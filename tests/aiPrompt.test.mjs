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
