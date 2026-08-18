import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-performanceTrend-test');
mkdirSync(tempDir, { recursive: true });

function compile(sourceFile, outputFile) {
  const source = readFileSync(sourceFile, 'utf8');
  writeFileSync(path.join(tempDir, outputFile), ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText);
}

compile('src/lib/dates.ts', 'dates.js');
compile('src/lib/heartRateZones.ts', 'heartRateZones.js');
compile('src/lib/trainingZones.ts', 'trainingZones.js');
compile('src/lib/weather.ts', 'weather.js');
compile('src/lib/activityHighlights.ts', 'activityHighlights.js');
compile('src/lib/performanceTrend.ts', 'performanceTrend.js');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types') return {};
  return originalLoad.call(this, request, parent, isMain);
};
test.after(() => { Module._load = originalLoad; });

const {
  calculatePerformanceTrend,
  calculateVDOT,
  getActivityPerformanceImpact,
  predictTimeFromVDOT,
} = require(path.join(tempDir, 'performanceTrend.js'));

function makeSplit(index, pace, overrides = {}) {
  return {
    distance: 1000,
    elapsed_time: pace,
    moving_time: pace,
    elevation_difference: 0,
    split: index + 1,
    average_speed: 1000 / pace,
    ...overrides,
  };
}

function makeActivity(id, date, overrides = {}) {
  return {
    id,
    name: `Run ${id}`,
    distance: 9000,
    moving_time: 3465,
    elapsed_time: 3500,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: `${date}T00:00:00Z`,
    start_date_local: `${date}T08:00:00Z`,
    map: { id: String(id), polyline: null, summary_polyline: null },
    manual: false,
    flagged: false,
    workout_type: 0,
    has_heartrate: true,
    heartrate_opt_out: false,
    display_hide_heartrate_option: false,
    ...overrides,
  };
}

test('VDOT prediction round-trips a 5K result', () => {
  const vdot = calculateVDOT(5000, 1260);
  assert.ok(vdot > 45 && vdot < 55);
  assert.ok(Math.abs(predictTimeFromVDOT(vdot, '5k') - 1260) <= 1);
});

test('ordinary easy pace variation does not become ability evidence', () => {
  const activity = makeActivity(1, '2026-08-10', {
    splits_metric: [385, 382, 350, 350, 350, 385, 385, 385, 385].map((pace, index) => makeSplit(index, pace)),
  });
  const trend = calculatePerformanceTrend({
    activities: [activity],
    profilePBs: { '5k': 1260 },
    now: new Date('2026-08-18T00:00:00Z'),
  });

  assert.equal(trend.evidence.length, 0);
  assert.equal(trend.snapshots.length, 1);
  assert.equal(trend.snapshots[0].confidence, 'low');
});

test('an unranked slow Strava best effort does not lower the ability estimate', () => {
  const activity = makeActivity(11, '2026-08-10', {
    distance: 10_000,
    moving_time: 3900,
    best_efforts: [{
      name: '5K',
      distance: 5000,
      elapsed_time: 1900,
      moving_time: 1880,
      pr_rank: null,
    }],
  });
  const trend = calculatePerformanceTrend({
    activities: [activity],
    profilePBs: { '5k': 1260 },
    now: new Date('2026-08-18T00:00:00Z'),
  });

  assert.equal(trend.evidence.length, 0);
  assert.ok(Math.abs(predictTimeFromVDOT(trend.snapshots[0].vdot, '5k') - 1260) <= 1);
});

test('a top-three Strava best effort remains trusted performance evidence', () => {
  const activity = makeActivity(12, '2026-08-10', {
    best_efforts: [{
      name: '5K',
      distance: 5000,
      elapsed_time: 1280,
      moving_time: 1278,
      pr_rank: 2,
    }],
  });
  const trend = calculatePerformanceTrend({
    activities: [activity],
    profilePBs: { '5k': 1260 },
    now: new Date('2026-08-18T00:00:00Z'),
  });

  assert.ok(trend.evidence.some((item) => item.activityId === 12 && item.prRank === 2));
});

test('distance trends require evidence that is long enough for the target event', () => {
  const activity = makeActivity(13, '2026-08-10', {
    best_efforts: [{
      name: '5K',
      distance: 5000,
      elapsed_time: 1260,
      moving_time: 1258,
      pr_rank: 1,
    }],
  });
  const trend = calculatePerformanceTrend({
    activities: [activity],
    profilePBs: { '5k': 1260 },
    now: new Date('2026-08-18T00:00:00Z'),
  });

  assert.ok(trend.distanceSnapshots['5k'].length > 0);
  assert.ok(trend.distanceSnapshots['10k'].length > 0);
  assert.equal(trend.distanceSnapshots['21k'].length, 0);
  assert.equal(trend.distanceSnapshots['42k'].length, 0);
});

test('a snapshot exposes every evidence item counted in its total', () => {
  const activities = [
    makeActivity(14, '2026-08-08', {
      best_efforts: [{ name: '5K', distance: 5000, elapsed_time: 1270, moving_time: 1268, pr_rank: 2 }],
    }),
    makeActivity(15, '2026-08-12', {
      best_efforts: [{ name: '5K', distance: 5000, elapsed_time: 1265, moving_time: 1263, pr_rank: 3 }],
    }),
  ];
  const trend = calculatePerformanceTrend({
    activities,
    profilePBs: { '5k': 1260 },
    now: new Date('2026-08-18T00:00:00Z'),
  });
  const current = trend.distanceSnapshots['5k'].at(-1);

  assert.equal(current.evidenceCount, 2);
  assert.equal(current.evidence.length, current.evidenceCount);
});

test('a continuous marathon-zone-or-faster block becomes qualified evidence', () => {
  const activity = makeActivity(2, '2026-08-10', {
    splits_metric: [390, 385, 260, 260, 260, 260, 260, 390, 390].map((pace, index) => makeSplit(index, pace)),
  });
  const trend = calculatePerformanceTrend({
    activities: [activity],
    profilePBs: { '5k': 1260 },
    now: new Date('2026-08-18T00:00:00Z'),
  });

  assert.ok(trend.evidence.some((item) => item.source === 'quality-block' && item.distanceMeters === 5000));
  const estimate = predictTimeFromVDOT(trend.snapshots.at(-1).vdot, '5k');
  assert.ok(estimate <= 1290, 'submaximal quality work must not be treated as a slow all-out 5K');
});

test('PB remains raw while heat only improves normalized ability evidence', () => {
  const activity = makeActivity(3, '2026-08-10', {
    distance: 5200,
    moving_time: 1320,
    description: 'Cloudy · 31°C · Feels like 36°C · Humidity 76%',
    best_efforts: [{ name: '5K', distance: 5000, elapsed_time: 1260, moving_time: 1255, pr_rank: 1 }],
  });
  const trend = calculatePerformanceTrend({
    activities: [activity],
    profilePBs: { '5k': 1300 },
    now: new Date('2026-08-18T00:00:00Z'),
  });
  const evidence = trend.evidence.find((item) => item.activityId === 3);

  assert.equal(trend.records['5k'].durationSeconds, 1260);
  assert.equal(evidence.heatAdjusted, true);
  assert.ok(evidence.normalizedDurationSeconds < evidence.durationSeconds);
  assert.equal(getActivityPerformanceImpact(trend, 3).kind, 'pb');
});

test('rolling snapshots ignore evidence older than the 84-day window', () => {
  const activity = makeActivity(4, '2025-12-01', {
    distance: 5000,
    moving_time: 1260,
    workout_type: 1,
  });
  const trend = calculatePerformanceTrend({
    activities: [activity],
    now: new Date('2026-08-18T00:00:00Z'),
  });

  assert.ok(trend.snapshots.length > 0);
  assert.ok(trend.snapshots.at(-1).timestamp < new Date('2026-08-18T00:00:00Z').getTime() - 84 * 86400000);
  assert.equal(trend.records['5k'].durationSeconds, 1260);
});
