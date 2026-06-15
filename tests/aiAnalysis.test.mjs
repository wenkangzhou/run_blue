import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-aiAnalysis-test');
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

compileLibFile('src/lib/aiTypes.ts', 'aiTypes.js');
compileLibFile('src/lib/aiComparison.ts', 'aiComparison.js');
compileLibFile('src/lib/aiResponseParser.ts', 'aiResponseParser.js');
compileLibFile('src/lib/aiFallbackAnalysis.ts', 'aiFallbackAnalysis.js');

writeFileSync(
  path.join(tempDir, 'trainingAnalysis.js'),
  `exports.formatPace = function formatPace(secondsPerKm) {
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = Math.round(secondsPerKm % 60);
    return minutes + "'" + String(seconds).padStart(2, "0") + '"';
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
  };
  `
);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types') return {};
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const { parseAIResponse } = require(path.join(tempDir, 'aiResponseParser.js'));
const { generateFallbackAnalysis } = require(path.join(tempDir, 'aiFallbackAnalysis.js'));

function makeActivity(overrides = {}) {
  return {
    id: 1,
    name: 'Tempo run',
    distance: 5000,
    moving_time: 1500,
    elapsed_time: 1510,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-01-01T00:00:00Z',
    start_date_local: '2026-01-01T08:00:00Z',
    average_speed: 3.33,
    max_speed: 5,
    has_heartrate: true,
    map: { id: '1', polyline: null, summary_polyline: null },
    ...overrides,
  };
}

function makeClassification(overrides = {}) {
  return {
    isRace: false,
    raceType: null,
    intensity: 'moderate',
    paceZone: 'M',
    paceZoneConfidence: 'medium',
    paceZoneExactMatch: true,
    paceZoneGapSeconds: 0,
    workoutType: 'tempo',
    workoutTypeConfidence: 'medium',
    workoutTypeEvidence: ['pace falls in marathon zone'],
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
    ...overrides,
  };
}

function makeProfile(overrides = {}) {
  return {
    totalRunsAnalyzed: 30,
    estimatedPBs: {},
    paceZones: {},
    patterns: {
      typicalEasyRunDistance: 8000,
      typicalLongRunDistance: 16000,
      typicalWeekDistance: 42000,
      avgRunsPerWeek: 4,
      hasIntervalWorkouts: false,
      hasTempoWorkouts: true,
      hasLongRuns: false,
      hasRaceActivities: false,
      workoutTypeCounts: { tempo: 3, easy: 8 },
      trainingDeficiencies: ['需要补充长距离有氧'],
    },
    physiologyMetrics: {},
    recentLoad: [],
    similarStats: {
      count: 12,
      strictCount: 12,
      avgPace: 5.5,
      bestPace: 4.8,
      avgDistance: 5000,
      yourPaceRank: 86,
      trendDirection: 'improving',
      recentAvgPace: 5.2,
      olderAvgPace: 5.6,
      comparisonMode: 'strict',
      sampleConfidence: 'high',
    },
    dateRange: { start: '2026-01-01', end: '2026-02-01' },
    ...overrides,
  };
}

test('parseAIResponse extracts markdown JSON and overrides comparison with computed text', () => {
  const content = [
    '```json',
    JSON.stringify({
      summary: 'AI summary',
      intensity: 'easy',
      recoveryHours: 12,
      comparisonToAverage: 'hallucinated comparison',
      suggestions: ['keep going'],
    }),
    '```',
  ].join('\n');

  const result = parseAIResponse(
    content,
    makeActivity(),
    makeProfile(),
    makeClassification(),
    'en'
  );

  assert.equal(result.summary, 'AI summary');
  assert.equal(result.intensity, 'easy');
  assert.equal(result.recoveryHours, 12);
  assert.match(result.comparisonToAverage, /30s\/km faster than historical average/);
  assert.equal(result.suggestions[0], 'keep going');
  assert.equal(typeof result.generatedAt, 'number');
});

test('parseAIResponse tolerates prose wrappers and common unescaped pace quotes', () => {
  const content = [
    '下面是结构化分析：',
    '```json',
    '{',
    `  "summary": "第1公里5'05"/km后进入稳定节奏。",`,
    '  "intensity": "moderate",',
    '  "recoveryHours": 24,',
    `  "suggestions": ["第2公里4'55"/km可以作为参考配速。"],`,
    '  "paceZoneAnalysis": { "zone": "M", "description": "落在目标区间", "appropriateness": "appropriate" },',
    '  "trainingLoadContext": "负荷适中",',
    '  "similarActivitiesInsight": "样本较少",',
    '  "nextWorkoutSuggestion": "轻松跑恢复",',
    '  "warnings": []',
    '}',
    '```',
  ].join('\n');

  const result = parseAIResponse(
    content,
    makeActivity({ moving_time: 1525 }),
    makeProfile({ similarStats: null }),
    makeClassification({ workoutType: 'tempo', paceZone: 'M' }),
    'zh'
  );

  assert.match(result.summary, /5'05"\/km/);
  assert.doesNotMatch(result.suggestions.join(' '), /目标配速/);
  assert.match(result.suggestions[0], /参考配速/);
  assert.equal(result.paceZoneAnalysis.description, '落在训练区间');
});

test('parseAIResponse localizes confidence wording and uses system comparison insight on weak samples', () => {
  const content = JSON.stringify({
    summary: '本次训练识别为恢复跑（置信度: medium），整体控制稳定。',
    intensity: 'easy',
    recoveryHours: 12,
    suggestions: ['保持 current rhythm，属于 medium confidence 判断'],
    trainingLoadContext: 'confidence: low，但负荷可控',
    similarActivitiesInsight: '超过 0% 的同类训练，属于历史最差之一',
    nextWorkoutSuggestion: '安排一次 easy run，medium confidence 即可',
  });

  const result = parseAIResponse(
    content,
    makeActivity({ moving_time: 1775 }),
    makeProfile({
      similarStats: {
        count: 3,
        strictCount: 0,
        avgPace: 5.5,
        bestPace: 5.2,
        avgDistance: 5000,
        yourPaceRank: 0,
        trendDirection: 'stable',
        recentAvgPace: 5.4,
        olderAvgPace: 5.5,
        comparisonMode: 'fallback',
        sampleConfidence: 'low',
      },
    }),
    makeClassification({ workoutType: 'recovery', workoutTypeConfidence: 'medium' }),
    'zh'
  );

  assert.match(result.summary, /置信度：中等|中等置信度/);
  assert.doesNotMatch(result.summary, /medium/i);
  assert.doesNotMatch(result.trainingLoadContext, /\bconfidence\b/i);
  assert.match(result.comparisonToAverage, /只是一条配速参考|只作参考|优先看是否低负荷完成/);
  assert.doesNotMatch(result.similarActivitiesInsight, /0%|历史最差/);
  assert.match(result.similarActivitiesInsight, /后段|方向性提示|低压力训练/);
});

test('parseAIResponse protects interval workouts from average-pace and recovery-lap criticism', () => {
  const result = parseAIResponse(
    JSON.stringify({
      summary: '本次间歇训练全程平均配速偏慢，恢复圈太慢拖累整体质量。',
      intensity: 'hard',
      recoveryHours: 36,
      suggestions: [
        '下次需要提高恢复段配速，恢复段也要跑快。',
        '重点看平均配速是否慢于目标。',
      ],
    }),
    makeActivity({
      distance: 7600,
      moving_time: 2500,
      laps: [
        { distance: 1600, moving_time: 520 },
        { distance: 400, moving_time: 88 },
        { distance: 200, moving_time: 82 },
        { distance: 400, moving_time: 87 },
        { distance: 200, moving_time: 80 },
        { distance: 1600, moving_time: 560 },
      ],
    }),
    makeProfile({ similarStats: null }),
    makeClassification({
      workoutType: 'interval',
      workoutTypeConfidence: 'high',
      intensity: 'hard',
      paceZone: 'I',
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
    }),
    'zh'
  );

  const joined = [result.summary, ...result.suggestions].join(' ');
  assert.doesNotMatch(joined, /平均配速偏慢|恢复圈太慢|恢复段也要跑快|目标/);
  assert.match(joined, /平均配速仅作参考|恢复段慢是设计的一部分|恢复段能让下一组快段质量稳定|恢复段以恢复质量为先/);
});

test('parseAIResponse avoids heart-rate conclusions when heart-rate data is missing', () => {
  const result = parseAIResponse(
    JSON.stringify({
      summary: '心率控制稳定，未出现明显心率漂移。',
      intensity: 'moderate',
      recoveryHours: 24,
      suggestions: ['继续保持心率控制稳定。'],
      trainingLoadContext: '心率下降说明恢复很好。',
    }),
    makeActivity({ has_heartrate: false, average_heartrate: undefined, max_heartrate: undefined }),
    makeProfile({ similarStats: null }),
    makeClassification({ workoutType: 'unknown', workoutTypeConfidence: 'low', paceZone: 'unknown' }),
    'zh'
  );

  const joined = [result.summary, ...result.suggestions, result.trainingLoadContext].join(' ');
  assert.doesNotMatch(joined, /心率控制稳定|心率漂移|心率下降/);
  assert.match(joined, /缺少心率数据|心率数据缺失/);
});

test('parseAIResponse softens heat-stress wording in merely muggy conditions', () => {
  const result = parseAIResponse(
    JSON.stringify({
      summary: '在热应激下（21°C/77%湿度）未出现明显漂移。',
      intensity: 'easy',
      recoveryHours: 12,
      suggestions: ['热应激环境下控制不错'],
    }),
    makeActivity({
      average_temp: 21,
      description: 'Humidity 77%',
    }),
    makeProfile({ similarStats: null }),
    makeClassification({ workoutType: 'recovery' }),
    'zh'
  );

  assert.doesNotMatch(result.summary, /热应激/);
  assert.match(result.summary, /偏闷湿环境|闷热负荷/);
  assert.doesNotMatch(result.suggestions[0], /热应激/);
});

test('parseAIResponse softens harsh ranking language for recovery runs', () => {
  const result = parseAIResponse(
    JSON.stringify({
      summary: '同类训练中排名垫底，需区分是主动恢复还是能力模型漂移导致配速区间失准。',
      intensity: 'easy',
      recoveryHours: 12,
      suggestions: ['若体感轻松，建议下次同类训练尝试贴近5\'30"/km以校准能力模型'],
    }),
    makeActivity({ average_temp: 21, description: 'Humidity 77%' }),
    makeProfile({ similarStats: null }),
    makeClassification({ workoutType: 'recovery' }),
    'zh'
  );

  assert.doesNotMatch(result.summary, /排名垫底/);
  assert.match(result.summary, /样本后段|低压力训练/);
  assert.doesNotMatch(result.suggestions[0], /尝试贴近/);
  assert.match(result.suggestions[0], /稳态有氧跑再校准能力模型/);
});

test('parseAIResponse removes target-pace wording and BMI nutrition prescriptions for short recovery runs', () => {
  const result = parseAIResponse(
    JSON.stringify({
      summary: '本次恢复跑配速落在目标区间，后半段略慢于目标。',
      intensity: 'easy',
      recoveryHours: 12,
      suggestions: [
        '第3-5公里略慢于目标，但心率很低，属于主动放松。',
        'BMI 21.0配合180cm身高提示长跑经济性良好，建议补充碳水1.0-1.2g/kg体重（约68-82g），香蕉或燕麦优先。',
      ],
    }),
    makeActivity({ distance: 6740, moving_time: 2396 }),
    makeProfile({ similarStats: null }),
    makeClassification({ workoutType: 'recovery', workoutTypeConfidence: 'low', paceZone: 'E' }),
    'zh'
  );

  assert.doesNotMatch(result.summary, /目标区间|慢于目标/);
  assert.match(result.summary, /低强度范围|更偏放松/);
  assert.equal(result.suggestions.length, 1);
  assert.doesNotMatch(result.suggestions[0], /目标/);
  assert.doesNotMatch(result.suggestions.join(' '), /BMI|碳水|g\/kg|香蕉|燕麦/);
});

test('parseAIResponse softens overconfident hydration speculation on short runs', () => {
  const result = parseAIResponse(
    JSON.stringify({
      summary: '闷热环境下建议提前30分钟补充300ml电解质水，观察第6公里心率骤降是否与脱水后身体自我保护有关。',
      intensity: 'moderate',
      recoveryHours: 24,
      suggestions: [
        '闷热环境下建议提前30分钟补充300ml电解质水，观察第6公里心率骤降是否与脱水后身体自我保护有关。',
      ],
    }),
    makeActivity({
      distance: 6740,
      moving_time: 2040,
      average_temp: 25,
      description: 'Humidity 77%',
      has_heartrate: true,
      average_heartrate: 146,
    }),
    makeProfile({ similarStats: null }),
    makeClassification({ workoutType: 'progression', paceZone: 'E' }),
    'zh'
  );

  const joined = [result.summary, ...result.suggestions].join(' ');
  assert.doesNotMatch(joined, /脱水|身体自我保护|300ml|电解质水/);
  assert.match(joined, /适量补水/);
  assert.match(joined, /主动冷身|心率设备读数|体感变化/);
});

test('parseAIResponse keeps muggy long-run hydration advice qualitative', () => {
  const result = parseAIResponse(
    JSON.stringify({
      summary: '18°C高湿环境下85%湿度会轻微抑制散热。',
      intensity: 'moderate',
      recoveryHours: 36,
      suggestions: [
        '未来类似天气的长距离建议携带150-200ml运动饮料，每30分钟少量补液即可，即使体感不渴，提前预防隐性脱水导致的后程心率漂移。',
      ],
    }),
    makeActivity({
      distance: 21280,
      moving_time: 7052,
      average_temp: 18,
      description: 'Humidity 85%',
    }),
    makeProfile({ similarStats: null }),
    makeClassification({ workoutType: 'long-run', paceZone: 'E' }),
    'zh'
  );

  assert.doesNotMatch(result.suggestions.join(' '), /150-200ml|每30分钟|即使体感不渴|隐性脱水/);
  assert.match(result.suggestions[0], /携带少量饮水或运动饮料|按体感少量补液/);
});

test('parseAIResponse avoids turning ordinary long runs into M-pace workouts', () => {
  const result = parseAIResponse(
    JSON.stringify({
      summary: '这是一次稳定长距离。',
      intensity: 'moderate',
      recoveryHours: 36,
      suggestions: [
        '若体感轻松可尝试最后2公里渐进加速至M区（约5\'00"-5\'10"/km），模拟比赛后程发力模式。',
        '心率全程Z1但配速已达近期同类最快，可考虑在下周长距离中尝试穿插2-3组1km@M区（5\'00"/km），组间2km恢复。',
      ],
    }),
    makeActivity({ distance: 18010, moving_time: 6042 }),
    makeProfile({ similarStats: null }),
    makeClassification({ workoutType: 'long-run', paceZone: 'E' }),
    'zh'
  );

  assert.doesNotMatch(result.suggestions.join(' '), /加速至M区|1km@M区/);
  assert.match(result.suggestions.join(' '), /普通长距离仍优先保持E区稳定|质量长距离/);
});

test('parseAIResponse changes target-pace wording to reference pace without explicit workout target', () => {
  const result = parseAIResponse(
    JSON.stringify({
      summary: '夏季渐进跑可将目标配速整体下调5-10秒/km，目标区间不要卡太死。',
      intensity: 'moderate',
      recoveryHours: 24,
      suggestions: ['夏季渐进跑可将目标配速整体下调5-10秒/km。'],
    }),
    makeActivity({ distance: 6740, moving_time: 2040 }),
    makeProfile({ similarStats: null }),
    makeClassification({ workoutType: 'progression', paceZone: 'E' }),
    'zh'
  );

  const joined = [result.summary, ...result.suggestions].join(' ');
  assert.doesNotMatch(joined, /目标配速|目标区间/);
  assert.match(joined, /参考配速|训练区间/);
});

test('parseAIResponse forces race intensity and default race recovery', () => {
  const result = parseAIResponse(
    JSON.stringify({ summary: 'Race day', intensity: 'easy' }),
    makeActivity(),
    makeProfile({ similarStats: null }),
    makeClassification({ isRace: true, raceType: '10公里' }),
    'zh'
  );

  assert.equal(result.intensity, 'extreme');
  assert.equal(result.recoveryHours, 48);
  assert.deepEqual(result.warnings, ['这是高强度比赛，需要充分恢复']);
});

test('generateFallbackAnalysis handles marathon race recovery conservatively', () => {
  const result = generateFallbackAnalysis(
    makeActivity({ name: 'Marathon', distance: 42195, moving_time: 12600 }),
    makeProfile(),
    makeClassification({ isRace: true, raceType: '马拉松' }),
    'zh'
  );

  assert.equal(result.isFallback, true);
  assert.equal(result.intensity, 'extreme');
  assert.equal(result.recoveryHours, 168);
  assert.match(result.summary, /马拉松完成/);
  assert.ok(result.warnings.length > 0);
});

test('generateFallbackAnalysis uses training deficiencies for normal runs', () => {
  const result = generateFallbackAnalysis(
    makeActivity({ distance: 8000, moving_time: 2880 }),
    makeProfile(),
    makeClassification(),
    'zh'
  );

  assert.equal(result.isFallback, true);
  assert.equal(result.intensity, 'moderate');
  assert.equal(result.recoveryHours, 24);
  assert.ok(result.suggestions.includes('需要补充长距离有氧'));
  assert.ok(result.suggestions.some((suggestion) => suggestion.includes('15km+')));
  assert.ok(result.suggestions.some((suggestion) => suggestion.includes('400m×6')));
});

test('generateFallbackAnalysis uses classification pace zone instead of absolute pace cutoffs', () => {
  const result = generateFallbackAnalysis(
    makeActivity({ name: 'Easy aerobic', distance: 10000, moving_time: 2500 }),
    makeProfile(),
    makeClassification({
      paceZone: 'E',
      workoutType: 'easy',
      workoutTypeConfidence: 'medium',
      paceZoneConfidence: 'medium',
    }),
    'zh'
  );

  assert.equal(result.paceZoneAnalysis.zone, 'E');
  assert.match(result.paceZoneAnalysis.description, /轻松跑/);
  assert.doesNotMatch(result.summary, /乳酸阈值区间|间歇跑区间|重复跑区间/);
});
