import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-aiPrompt-test');
mkdirSync(tempDir, { recursive: true });

function compileLibFile(sourceFile, outputFile) {
  const sourcePath = path.resolve(sourceFile);
  const source = readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  writeFileSync(path.join(tempDir, outputFile), compiled);
}

compileLibFile('src/lib/weather.ts', 'weather.js');
compileLibFile('src/lib/activityAchievements.ts', 'activityAchievements.js');
compileLibFile('src/lib/activityHighlights.ts', 'activityHighlights.js');
compileLibFile('src/lib/aiPrompt.ts', 'aiPrompt.js');

writeFileSync(
  path.join(tempDir, 'trainingAnalysis.js'),
  `exports.formatPace = function formatPace(secondsPerKm) {
    const total = Math.round(secondsPerKm || 0);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes + "'" + String(seconds).padStart(2, "0") + '"';
  };
  exports.formatTime = function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return hrs + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    return mins + ':' + String(secs).padStart(2, '0');
  };
  exports.getWorkoutTypeLabel = function getWorkoutTypeLabel(workoutType, locale) {
    const zh = {
      race: '比赛',
      interval: '间歇',
      fartlek: '法特莱克',
      threshold: '阈值跑',
      tempo: '节奏跑',
      progression: '渐进跑',
      'long-run': '长距离',
      workout: '训练',
      easy: '轻松跑',
      recovery: '恢复跑',
      hill: '坡跑',
      treadmill: '跑步机',
      mixed: '混合训练',
      unknown: '未识别',
    };
    const en = {
      race: 'Race',
      interval: 'Interval',
      fartlek: 'Fartlek',
      threshold: 'Threshold',
      tempo: 'Tempo',
      progression: 'Progression',
      'long-run': 'Long run',
      workout: 'Workout',
      easy: 'Easy run',
      recovery: 'Recovery run',
      hill: 'Hill workout',
      treadmill: 'Treadmill run',
      mixed: 'Mixed workout',
      unknown: 'Unclassified',
    };
    return locale && locale.startsWith('en') ? en[workoutType] : zh[workoutType];
  };`
);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types') return {};
  if (request === './trainingAnalysis') return require(path.join(tempDir, 'trainingAnalysis.js'));
  if (request === './weather') return require(path.join(tempDir, 'weather.js'));
  if (request === './activityAchievements') return require(path.join(tempDir, 'activityAchievements.js'));
  if (request === './activityHighlights') return require(path.join(tempDir, 'activityHighlights.js'));
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const { buildProfessionalPrompt } = require(path.join(tempDir, 'aiPrompt.js'));

function makeActivity(overrides = {}) {
  return {
    id: 1,
    name: 'Track workout',
    distance: 7600,
    moving_time: 2500,
    elapsed_time: 2520,
    total_elevation_gain: 12,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-01-01T00:00:00Z',
    start_date_local: '2026-01-01T08:00:00Z',
    average_speed: 3.04,
    max_speed: 5,
    has_heartrate: true,
    average_heartrate: 168,
    max_heartrate: 182,
    average_temp: 18,
    map: { id: '1', polyline: null, summary_polyline: null },
    laps: [
      { distance: 1600, moving_time: 520 },
      { distance: 400, moving_time: 88 },
      { distance: 200, moving_time: 82 },
      { distance: 400, moving_time: 87 },
      { distance: 200, moving_time: 80 },
      { distance: 1600, moving_time: 560 },
    ],
    splits_metric: [
      { distance: 1000, moving_time: 360, elapsed_time: 360, elevation_difference: 0, split: 1, average_speed: 2.77 },
      { distance: 1000, moving_time: 320, elapsed_time: 320, elevation_difference: 0, split: 2, average_speed: 3.12 },
      { distance: 1000, moving_time: 355, elapsed_time: 355, elevation_difference: 0, split: 3, average_speed: 2.81 },
    ],
    ...overrides,
  };
}

function makeProfile(overrides = {}) {
  return {
    estimatedPBs: { '1k': 230, '3k': 760, '5k': 1260, '10k': 2650, '21k': 6200, '42k': 13200, reliability: 'high', sources: { '5k': 'actual', '10k': 'actual' } },
    paceZones: {
      easy: { min: 320, max: 360, description: 'easy' },
      marathon: { min: 285, max: 310, description: 'marathon' },
      threshold: { min: 255, max: 270, description: 'threshold' },
      interval: { min: 240, max: 252, description: 'interval' },
      repetition: { min: 225, max: 238, description: 'repetition' },
    },
    patterns: {
      typicalEasyRunDistance: 8000,
      typicalLongRunDistance: 18000,
      typicalWeekDistance: 50000,
      avgRunsPerWeek: 5,
      hasIntervalWorkouts: true,
      hasTempoWorkouts: true,
      hasLongRuns: true,
      hasRaceActivities: false,
      workoutTypeCounts: { interval: 2, easy: 6, 'long-run': 2 },
      trainingDeficiencies: ['训练结构均衡'],
    },
    physiologyMetrics: {},
    recentLoad: [
      { week: '2026-W1', totalDistance: 42000, totalTime: 14000, runs: 4, avgIntensity: 6 },
      { week: '2026-W2', totalDistance: 50000, totalTime: 16000, runs: 5, avgIntensity: 6 },
    ],
    similarStats: {
      count: 3,
      strictCount: 3,
      avgPace: 4.5,
      bestPace: 4.1,
      avgDistance: 7000,
      yourPaceRank: 70,
      trendDirection: 'improving',
      recentAvgPace: 4.4,
      olderAvgPace: 4.6,
      comparisonMode: 'strict',
      sampleConfidence: 'low',
    },
    thermalStats: null,
    totalRunsAnalyzed: 50,
    dateRange: { start: '2025-01-01', end: '2026-01-01' },
    ...overrides,
  };
}

function makeClassification(overrides = {}) {
  return {
    isRace: false,
    raceType: null,
    intensity: 'hard',
    paceZone: 'I',
    paceZoneConfidence: 'high',
    paceZoneExactMatch: true,
    paceZoneGapSeconds: 0,
    workoutType: 'interval',
    workoutTypeConfidence: 'high',
    workoutTypeEvidence: ['6 laps with 4 short reps', 'warmup/cooldown pattern detected'],
    structure: {
      source: 'laps',
      lapCount: 6,
      medianLapDistance: 400,
      shortRepCount: 4,
      fastRepCount: 2,
      recoveryRepCount: 2,
      hasWarmup: true,
      hasCooldown: true,
      splitPattern: 'interval',
      paceVariability: 0.18,
    },
    ...overrides,
  };
}

test('buildProfessionalPrompt uses ability-based zones and workout-type guidance', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity(),
    { distance: { type: 'distance', data: [0, 7600], series_type: 'distance', original_size: 2, resolution: 'high' } },
    makeProfile(),
    makeClassification(),
    'en',
    { height: 178, weight: 68 },
    176
  );

  assert.match(prompt, /Ability-based zone from the athlete profile:/);
  assert.match(prompt, /Do NOT use generic absolute pace cutoffs/);
  assert.match(prompt, /Workout-Type Coaching Rules/);
  assert.match(prompt, /average pace is a secondary metric/);
  assert.match(prompt, /Data Confidence/);
  assert.match(prompt, /Sample size is small/);
});

test('buildProfessionalPrompt keeps ordinary long runs from becoming default M-pace workouts', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity({
      distance: 18010,
      moving_time: 6042,
      average_speed: 2.98,
    }),
    null,
    makeProfile(),
    makeClassification({
      intensity: 'moderate',
      paceZone: 'E',
      paceZoneConfidence: 'medium',
      workoutType: 'long-run',
      workoutTypeConfidence: 'medium',
      workoutTypeEvidence: ['distance exceeds typical long-run threshold'],
      structure: {
        source: 'splits',
        lapCount: 0,
        medianLapDistance: null,
        shortRepCount: 0,
        fastRepCount: 0,
        recoveryRepCount: 0,
        hasWarmup: true,
        hasCooldown: true,
        splitPattern: 'steady',
        paceVariability: 0.04,
      },
    }),
    'zh',
    { height: 178, weight: 68 },
    176
  );

  assert.match(prompt, /不要把普通长距离自动改造成 M 配速质量课/);
  assert.match(prompt, /不要默认建议 M 配速结尾或 M 配速穿插/);
  assert.match(prompt, /精确饮水\/电解质量不是必须项/);
  assert.match(prompt, /不要写“目标配速”/);
});

test('buildProfessionalPrompt tells the model to acknowledge uncertainty when evidence is weak', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity({ laps: undefined, splits_metric: undefined, has_heartrate: false, average_heartrate: undefined }),
    null,
    makeProfile({ similarStats: null }),
    makeClassification({
      paceZone: 'unknown',
      paceZoneConfidence: 'low',
      paceZoneExactMatch: false,
      paceZoneGapSeconds: null,
      workoutType: 'unknown',
      workoutTypeConfidence: 'low',
      workoutTypeEvidence: ['insufficient workout-structure evidence'],
      structure: {
        source: 'basic',
        lapCount: 0,
        medianLapDistance: null,
        shortRepCount: 0,
        fastRepCount: 0,
        recoveryRepCount: 0,
        hasWarmup: false,
        hasCooldown: false,
        splitPattern: 'unknown',
        paceVariability: null,
      },
    }),
    'zh',
    undefined,
    null
  );

  assert.match(prompt, /数据置信度/);
  assert.match(prompt, /缺失证据/);
  assert.match(prompt, /最佳判断/);
  assert.match(prompt, /必须在 summary 中直接说明/);
});

test('buildProfessionalPrompt asks for a concise complete summary', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity(),
    null,
    makeProfile(),
    makeClassification(),
    'zh'
  );

  assert.match(prompt, /简要但完整的教练总结/);
  assert.match(prompt, /60-120字/);
  assert.match(prompt, /2-3个完整句子/);
  assert.doesNotMatch(prompt, /80-200字/);
});

test('buildProfessionalPrompt tells the model not to overstate nearest-zone hints', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity(),
    null,
    makeProfile({ estimatedPBs: { '1k': 0, '3k': 0, '5k': 1800, '10k': 0, '21k': 0, '42k': 0, reliability: 'low', sources: { '5k': 'estimated' } } }),
    makeClassification({
      paceZone: 'T',
      paceZoneConfidence: 'low',
      paceZoneExactMatch: false,
      paceZoneGapSeconds: 8,
      workoutType: 'tempo',
      workoutTypeConfidence: 'low',
      workoutTypeEvidence: ['pace is 8s/km slower than estimated threshold zone'],
    }),
    'zh'
  );

  assert.match(prompt, /最近区间提示/);
  assert.match(prompt, /软提示/);
  assert.match(prompt, /禁止表述为“落在该区间”/);
});

test('buildProfessionalPrompt localizes confidence labels in Chinese prompts', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity(),
    null,
    makeProfile(),
    makeClassification({
      workoutType: 'recovery',
      workoutTypeConfidence: 'medium',
      paceZone: 'unknown',
      paceZoneConfidence: 'low',
    }),
    'zh',
    undefined,
    176
  );

  assert.match(prompt, /主训练类型: 恢复跑（置信度: 中等）/);
  assert.doesNotMatch(prompt, /置信度: medium/);
  assert.doesNotMatch(prompt, /置信度low|置信度medium|置信度high/);
});

test('buildProfessionalPrompt keeps generic Strava workouts evidence-based', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity({ workout_type: 3 }),
    null,
    makeProfile(),
    makeClassification({
      workoutType: 'workout',
      workoutTypeConfidence: 'high',
      workoutTypeEvidence: ['Strava workout_type=3'],
    }),
    'zh'
  );

  assert.match(prompt, /主训练类型: 训练/);
  assert.match(prompt, /不要凭空编造间歇、节奏或阈值目标/);
  assert.match(prompt, /只有圈数、分段、配速或心率提供证据时才能继续推断子类型/);
});

test('buildProfessionalPrompt treats muggy but not hot weather as minor context', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity({
      average_temp: 21,
      description: 'Humidity 77%',
    }),
    null,
    makeProfile(),
    makeClassification({
      workoutType: 'recovery',
      workoutTypeConfidence: 'medium',
    }),
    'zh',
    undefined,
    176
  );

  assert.match(prompt, /热环境判断: 偏闷或偏暖/);
  assert.match(prompt, /只带来轻度的闷热负担/);
  assert.match(prompt, /不要直接写成“热应激”/);
});

test('buildProfessionalPrompt prioritizes the athlete personal same-temperature baseline', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity({ average_temp: 32, moving_time: 2640, average_heartrate: 150 }),
    null,
    makeProfile({
      thermalStats: {
        count: 6,
        currentTemperature: 32,
        averageTemperature: 31.5,
        averagePaceSeconds: 345,
        paceDifferenceSeconds: 3,
        averageHeartRate: 148,
        heartRateDifference: 2,
        sampleConfidence: 'medium',
      },
    }),
    makeClassification({ workoutType: 'easy', intensity: 'easy', paceZone: 'E' }),
    'zh',
    undefined,
    176
  );

  assert.match(prompt, /个人同温训练基线/);
  assert.match(prompt, /6 次相近训练，平均温度 31.5°C/);
  assert.match(prompt, /本次慢 3 秒\/公里/);
  assert.match(prompt, /本次高 2 bpm/);
  assert.match(prompt, /应视为高温下的正常表现，不要写成能力下降/);
});

test('buildProfessionalPrompt makes a hot-weather personal best the primary outcome', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity({
      distance: 12020,
      moving_time: 3588,
      description: 'Temperature 30.2°C, Feels like 33.1°C, Humidity 70%',
      best_efforts: [
        { name: '5K', distance: 5000, elapsed_time: 1254, pr_rank: 1 },
        { name: '1K', distance: 1000, elapsed_time: 238, pr_rank: 2 },
      ],
    }),
    null,
    makeProfile(),
    makeClassification({ workoutType: 'workout', paceZone: 'M' }),
    'zh'
  );

  assert.match(prompt, /本次刷新个人最佳/);
  assert.match(prompt, /5K: 20:54（个人最佳，第1名）/);
  assert.doesNotMatch(prompt, /1K: 3:58（个人最佳/);
  assert.match(prompt, /summary 前两句必须直接写出最重要的 PB/);
  assert.match(prompt, /PB 出现在明显热应激下/);
  assert.match(prompt, /把高温高湿作为一级训练变量/);
  assert.match(prompt, /配速\/心率解读、实际训练刺激和恢复成本/);
});

test('buildProfessionalPrompt promotes a standout continuous 5K block even without a PB', () => {
  const splits = [305, 292, 258, 253, 250, 255, 209, 325, 359, 338, 342, 300]
    .map((movingTime, index) => ({
      split: index + 1,
      distance: 1000,
      moving_time: movingTime,
      elapsed_time: movingTime + (index === 6 ? 55 : 0),
      average_speed: 1000 / movingTime,
      average_heartrate: [134, 150, 162, 170, 174, 176, 156, 162, 153, 156, 160, 164][index],
      elevation_difference: 0,
    }));
  const prompt = buildProfessionalPrompt(
    makeActivity({
      distance: 12020,
      moving_time: 3588,
      elapsed_time: 4124,
      description: 'Temperature 30.2°C, Feels like 33.1°C, Humidity 70%',
      splits_metric: splits,
      best_efforts: [
        { name: '5K', distance: 5000, moving_time: 1225, elapsed_time: 1280, pr_rank: null },
      ],
    }),
    null,
    makeProfile(),
    makeClassification({ workoutType: 'workout', paceZone: 'M' }),
    'zh'
  );

  assert.match(prompt, /本次核心连续质量段/);
  assert.match(prompt, /第3-7公里: 连续 5 km，移动用时 20:25，平均配速 4'05"\/km/);
  assert.match(prompt, /比全程平均配速快 5[34] 秒\/公里/);
  assert.match(prompt, /官方最佳区间用时为 21:20/);
  assert.match(prompt, /即使它不是 PB/);
  assert.match(prompt, /明显热应激下，应明确提高对表现含金量的评价/);
});

test('buildProfessionalPrompt makes the deterministic summer-load override non-negotiable', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity({
      distance: 8000,
      moving_time: 2560,
      description: 'Temperature 30°C, Feels like 33°C, Humidity 78%',
    }),
    null,
    makeProfile(),
    makeClassification({
      workoutType: 'recovery',
      workoutTypeConfidence: 'low',
      intensity: 'hard',
      paceZone: 'E',
      loadAdjustment: {
        applied: true,
        baseIntensity: 'easy',
        adjustedIntensity: 'hard',
        thermalSeverity: 'heat-stress',
        paceContext: 'upper-easy',
        paceSecondsPerKm: 320,
        easyFastBoundarySeconds: 331,
        sameTemperaturePaceDeltaSeconds: -18,
        recentVolumeChangePercent: 269,
        recentVolumeRatio: 3.69,
        activityTrainingLoad: 40,
        current7DayTrainingLoad: 223,
        previous7DayTrainingLoad: 56,
        averageWeeklyTrainingLoad: 162,
        trainingLoadChangePercent: 298,
        trainingLoadRatio: 1.38,
        trainingLoadState: 'high',
        trainingLoadHeartRateCoverage: 100,
        activityTrainingLoadSharePercent: 18,
        minimumRecoveryHours: 48,
      },
    }),
    'zh'
  );

  assert.match(prompt, /系统综合负荷校正/);
  assert.match(prompt, /滚动训练负荷（与统计页同口径）/);
  assert.match(prompt, /本次活动: 40 负荷点（占近 7 天负荷的 18%）/);
  assert.match(prompt, /近 7 天: 223 点；上一个 7 天: 56 点；前 3 周均值: 162 点/);
  assert.match(prompt, /较上一个 7 天: \+298%；相对前 3 周均值: 1.38 倍/);
  assert.match(prompt, /负荷状态: 负荷偏高；心率覆盖率: 100%/);
  assert.match(prompt, /本次均配: 5'20"\/km；个人配速位置: E 区较快一侧/);
  assert.match(prompt, /负荷点作为近期负荷的首要信号/);
  assert.match(prompt, /不得把本次写成“轻松”“低负荷”或“恢复负荷”/);
  assert.match(prompt, /intensity 不得低于“高强度”/);
  assert.match(prompt, /建议恢复不得少于 48h/);
});

test('buildProfessionalPrompt avoids target-pace and BMI nutrition prescriptions for recovery runs', () => {
  const prompt = buildProfessionalPrompt(
    makeActivity({
      distance: 6740,
      moving_time: 2396,
      average_heartrate: 133,
      max_heartrate: 151,
    }),
    null,
    makeProfile(),
    makeClassification({
      intensity: 'easy',
      paceZone: 'E',
      paceZoneConfidence: 'medium',
      workoutType: 'recovery',
      workoutTypeConfidence: 'low',
      workoutTypeEvidence: ['easy pace with low aerobic heart rate'],
      structure: {
        source: 'splits',
        lapCount: 0,
        medianLapDistance: null,
        shortRepCount: 0,
        fastRepCount: 0,
        recoveryRepCount: 0,
        hasWarmup: false,
        hasCooldown: false,
        splitPattern: 'steady',
        paceVariability: 0.05,
      },
    }),
    'zh',
    { height: 180, weight: 68 },
    176
  );

  assert.match(prompt, /不要把轻松\/恢复跑配速写成“目标配速”/);
  assert.match(prompt, /不要根据 BMI 推导表现结论/);
  assert.match(prompt, /不要给出精确到克数的营养处方/);
  assert.match(prompt, /不要给出精确到克数的碳水\/蛋白建议/);
  assert.match(prompt, /不要仅凭心率变化诊断脱水/);
  assert.match(prompt, /补水建议保持定性/);
});
