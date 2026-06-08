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
