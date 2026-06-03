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
      trainingDeficiencies: ['需要补充长距离有氧'],
    },
    physiologyMetrics: {},
    recentLoad: [],
    similarStats: {
      count: 12,
      avgPace: 5.5,
      bestPace: 4.8,
      avgDistance: 5000,
      yourPaceRank: 86,
      trendDirection: 'improving',
      recentAvgPace: 5.2,
      olderAvgPace: 5.6,
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
