import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-trainingZones-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/trainingZones.ts', 'utf8');
writeFileSync(path.join(tempDir, 'trainingZones.js'), ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText);

function getHRZones(maxHeartRate) {
  const z1Max = Math.round(maxHeartRate * 0.65);
  const z2Max = Math.round(maxHeartRate * 0.81);
  const z3Max = Math.round(maxHeartRate * 0.89);
  const z4Max = Math.round(maxHeartRate * 0.97);
  return {
    z1: { min: 0, max: z1Max },
    z2: { min: z1Max + 1, max: z2Max },
    z3: { min: z2Max + 1, max: z3Max },
    z4: { min: z3Max + 1, max: z4Max },
    z5: { min: z4Max + 1, max: 999 },
  };
}

function getZoneForHR(hr, maxHeartRate) {
  const zones = getHRZones(maxHeartRate);
  if (hr >= zones.z5.min) return 'z5';
  if (hr >= zones.z4.min) return 'z4';
  if (hr >= zones.z3.min) return 'z3';
  if (hr >= zones.z2.min) return 'z2';
  return 'z1';
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types') return {};
  if (request === './dates') {
    return { getActivityTimestamp: (activity) => new Date(activity.start_date).getTime() };
  }
  if (request === './heartRateZones') return { getHRZones, getZoneForHR };
  return originalLoad.call(this, request, parent, isMain);
};
test.after(() => { Module._load = originalLoad; });

const {
  calculateActivityTrainingZoneDistribution,
  calculateSemanticPaceZones,
  calculateTrainingZoneDistribution,
  getPaceTrainingZones,
  getPaceZoneForSeconds,
  resolveFiveKReference,
} = require(path.join(tempDir, 'trainingZones.js'));

function makeRun(daysAgo, overrides = {}) {
  const now = new Date('2026-07-03T12:00:00Z');
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return {
    id: daysAgo + 1,
    name: 'Run',
    type: 'Run',
    sport_type: 'Run',
    distance: 10000,
    moving_time: 3000,
    elapsed_time: 3050,
    start_date: date.toISOString(),
    average_heartrate: 160,
    ...overrides,
  };
}

test('builds Strava-style Z1-Z6 boundaries from a 21-minute 5K', () => {
  const zones = getPaceTrainingZones(1260);
  assert.deepEqual(zones.map(({ id, min, max }) => ({ id, min, max })), [
    { id: 'z6', min: 0, max: 239 },
    { id: 'z5', min: 239, max: 254 },
    { id: 'z4', min: 254, max: 271 },
    { id: 'z3', min: 271, max: 302 },
    { id: 'z2', min: 302, max: 351 },
    { id: 'z1', min: 351, max: Number.POSITIVE_INFINITY },
  ]);
  assert.equal(getPaceZoneForSeconds(400, 1260), 'z1');
  assert.equal(getPaceZoneForSeconds(300, 1260), 'z3');
  assert.equal(getPaceZoneForSeconds(230, 1260), 'z6');
});

test('maps numeric zones to the shared E/M/T/I/R model', () => {
  const zones = calculateSemanticPaceZones(1260);
  assert.deepEqual([zones.easy.min, zones.easy.max], [302, 351]);
  assert.deepEqual([zones.marathon.min, zones.marathon.max], [271, 302]);
  assert.deepEqual([zones.threshold.min, zones.threshold.max], [254, 271]);
  assert.deepEqual([zones.interval.min, zones.interval.max], [239, 254]);
  assert.deepEqual([zones.repetition.min, zones.repetition.max], [219, 239]);
});

test('resolves profile PBs before conservative history estimates', () => {
  assert.deepEqual(resolveFiveKReference({ '5k': 1260 }, []), { seconds: 1260, source: 'profile' });
  const equivalent = resolveFiveKReference({ '10k': 2700 }, []);
  assert.equal(equivalent.source, 'profile-equivalent');
  assert.ok(equivalent.seconds > 1200 && equivalent.seconds < 1400);
  assert.equal(resolveFiveKReference(null, [makeRun(1)]).source, 'history-estimate');
});

test('calculates duration-weighted pace and HR distributions with coverage', () => {
  const activities = [
    makeRun(1, { moving_time: 4000, distance: 10000, average_heartrate: 140 }),
    makeRun(2, { moving_time: 3000, distance: 10000, average_heartrate: 170 }),
    makeRun(3, { moving_time: 2500, distance: 10000, average_heartrate: undefined }),
    makeRun(10, { moving_time: 3200, distance: 10000, average_heartrate: 160 }),
  ];
  const now = new Date('2026-07-03T12:00:00Z');
  const pace = calculateTrainingZoneDistribution({ activities, mode: 'pace', period: '7d', pb5kSeconds: 1260, now });
  const hr = calculateTrainingZoneDistribution({ activities, mode: 'heartRate', period: '7d', maxHeartRate: 180, now });

  assert.equal(pace.totalActivities, 3);
  assert.equal(pace.coveredActivities, 3);
  assert.equal(pace.coveragePercent, 100);
  assert.equal(pace.zones.reduce((sum, zone) => sum + zone.seconds, 0), pace.totalSeconds);
  assert.equal(hr.totalActivities, 3);
  assert.equal(hr.coveredActivities, 2);
  assert.equal(hr.coveragePercent, Math.round(7000 / 9500 * 100));
  assert.equal(hr.dominantZone, 'z2');
});

test('calculates one activity pace zones from time-weighted stream samples', () => {
  const activity = makeRun(1, { moving_time: 60, distance: 200 });
  const distribution = calculateActivityTrainingZoneDistribution({
    activity,
    mode: 'pace',
    pb5kSeconds: 1260,
    streams: {
      time: { data: [0, 10, 30, 60] },
      velocity_smooth: { data: [1000 / 230, 1000 / 300, 1000 / 400, 1000 / 400] },
    },
  });

  assert.equal(distribution.source, 'stream');
  assert.equal(distribution.coveragePercent, 100);
  assert.equal(distribution.dominantZone, 'z1');
  assert.equal(distribution.zones.find((zone) => zone.id === 'z6').percent, 17);
  assert.equal(distribution.zones.find((zone) => zone.id === 'z3').percent, 33);
  assert.equal(distribution.zones.find((zone) => zone.id === 'z1').percent, 50);
});

test('calculates heart-rate zones from moving samples and falls back to activity averages', () => {
  const activity = makeRun(1, { moving_time: 60, distance: 200, average_heartrate: 150 });
  const streamDistribution = calculateActivityTrainingZoneDistribution({
    activity,
    mode: 'heartRate',
    maxHeartRate: 170,
    streams: {
      time: { data: [0, 20, 50, 60] },
      heartrate: { data: [130, 150, 170, 170] },
      velocity_smooth: { data: [3, 3, 3, 3] },
    },
  });
  assert.equal(streamDistribution.source, 'stream');
  assert.equal(streamDistribution.dominantZone, 'z3');
  assert.equal(streamDistribution.zones.find((zone) => zone.id === 'z3').percent, 50);

  const fallback = calculateActivityTrainingZoneDistribution({
    activity: makeRun(1, { moving_time: 3000, distance: 10000 }),
    mode: 'pace',
    pb5kSeconds: 1260,
    streams: null,
  });
  assert.equal(fallback.source, 'average');
  assert.equal(fallback.coveragePercent, 100);
  assert.equal(fallback.dominantZone, 'z3');
});

test('uses split data before falling back to the whole-activity average', () => {
  const activity = makeRun(1, {
    moving_time: 60,
    distance: 200,
    splits_metric: [
      { moving_time: 20, average_speed: 1000 / 230, average_heartrate: 130 },
      { moving_time: 40, average_speed: 1000 / 400, average_heartrate: 150 },
    ],
  });
  const distribution = calculateActivityTrainingZoneDistribution({
    activity,
    mode: 'pace',
    pb5kSeconds: 1260,
    streams: null,
  });

  assert.equal(distribution.source, 'splits');
  assert.equal(distribution.dominantZone, 'z1');
  assert.equal(distribution.zones.find((zone) => zone.id === 'z6').percent, 33);
  assert.equal(distribution.zones.find((zone) => zone.id === 'z1').percent, 67);
});

test('reports unavailable activity zones without a runner reference', () => {
  const distribution = calculateActivityTrainingZoneDistribution({
    activity: makeRun(1),
    mode: 'pace',
    streams: null,
  });
  assert.equal(distribution.source, 'unavailable');
  assert.deepEqual(distribution.zones, []);
});
