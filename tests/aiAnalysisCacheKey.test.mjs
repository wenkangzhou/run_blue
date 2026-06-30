import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-aiAnalysisCacheKey-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/aiAnalysisCacheKey.ts');
const compiledPath = path.join(tempDir, 'aiAnalysisCacheKey.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const { AI_ANALYSIS_CACHE_VERSION, getAIAnalysisCacheKey, getLegacyAIAnalysisCacheKeys } = require(compiledPath);

function makeActivity(id, overrides = {}) {
  return {
    id,
    name: `Run ${id}`,
    distance: 5000,
    moving_time: 1500,
    elapsed_time: 1520,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: `2026-01-${String(id).padStart(2, '0')}T00:00:00Z`,
    start_date_local: `2026-01-${String(id).padStart(2, '0')}T08:00:00Z`,
    average_speed: 3.33,
    max_speed: 5,
    has_heartrate: true,
    average_heartrate: 150,
    max_heartrate: 170,
    workout_type: 0,
    calories: 320,
    map: { id: String(id), polyline: null, summary_polyline: null },
    ...overrides,
  };
}

function makeProfile(overrides = {}) {
  return {
    pbs: { '5k': 1500, '10k': 3200, '21k': null, '42k': null },
    height: 178,
    weight: 68,
    lthr: 172,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeStreams(overrides = {}) {
  return {
    heartrate: {
      type: 'heartrate',
      data: [130, 150, 170],
      series_type: 'distance',
      original_size: 3,
      resolution: 'high',
    },
    distance: {
      type: 'distance',
      data: [0, 2500, 5000],
      series_type: 'distance',
      original_size: 3,
      resolution: 'high',
    },
    ...overrides,
  };
}

function key(overrides = {}) {
  return getAIAnalysisCacheKey(makeCacheInput(overrides));
}

function makeCacheInput(overrides = {}) {
  return {
    activity: makeActivity(1),
    streams: makeStreams(),
    historyActivities: [makeActivity(3), makeActivity(2), makeActivity(1)],
    locale: 'zh',
    profile: makeProfile(),
    ...overrides,
  };
}

test('builds stable v20 keys for identical AI analysis inputs', () => {
  const first = key();
  const second = key();

  assert.equal(AI_ANALYSIS_CACHE_VERSION, 'v20');
  assert.equal(first, second);
  assert.match(first, /^ai_analysis_v20_1_/);
});

test('builds legacy fallback keys for existing cached analysis', () => {
  const current = key();
  const legacy = getLegacyAIAnalysisCacheKeys(makeCacheInput());

  assert.equal(legacy.length, 2);
  assert.match(legacy[0], /^ai_analysis_v19_1_/);
  assert.match(legacy[1], /^ai_analysis_v18_1_/);
  assert.notEqual(legacy[0], current);
});

test('skips the unsafe workout fallback while keeping the latest compatible cache', () => {
  const legacy = getLegacyAIAnalysisCacheKeys(makeCacheInput({
    activity: makeActivity(1, { workout_type: 3 }),
  }));

  assert.equal(legacy.length, 2);
  assert.match(legacy[0], /^ai_analysis_v19_1_/);
  assert.match(legacy[1], /^ai_analysis_v17_1_/);
});

test('does not reuse legacy analysis when split structure affects classification', () => {
  const legacy = getLegacyAIAnalysisCacheKeys(makeCacheInput({
    activity: makeActivity(1, {
      splits_metric: [
        { distance: 1000, moving_time: 360 },
        { distance: 1000, moving_time: 350 },
        { distance: 500, moving_time: 165 },
      ],
    }),
  }));

  assert.deepEqual(legacy, []);
});

test('changes key when a middle historical activity changes', () => {
  const original = key();
  const changed = key({
    historyActivities: [
      makeActivity(3),
      makeActivity(2, { moving_time: 1400 }),
      makeActivity(1),
    ],
  });

  assert.notEqual(changed, original);
});

test('changes key when runner profile inputs change', () => {
  const original = key();
  const changedLthr = key({ profile: makeProfile({ lthr: 180 }) });
  const changedWeight = key({ profile: makeProfile({ weight: 70 }) });

  assert.notEqual(changedLthr, original);
  assert.notEqual(changedWeight, original);
});

test('changes key when stream samples change without changing stream length', () => {
  const original = key();
  const changed = key({
    streams: makeStreams({
      heartrate: {
        type: 'heartrate',
        data: [130, 155, 170],
        series_type: 'distance',
        original_size: 3,
        resolution: 'high',
      },
    }),
  });

  assert.notEqual(changed, original);
});
