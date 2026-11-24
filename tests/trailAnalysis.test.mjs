import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-trailAnalysis-test');
mkdirSync(tempDir, { recursive: true });
writeFileSync(path.join(tempDir, 'trailAnalysis.js'), ts.transpileModule(
  readFileSync('src/lib/trailAnalysis.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText);
const { assessTrailExecution, getTrailDetection, getTrailTerrainSummary } = require(path.join(tempDir, 'trailAnalysis.js'));

function activity(overrides = {}) {
  return {
    id: 20991619385,
    name: '秋季越野挑战',
    type: 'Run',
    sport_type: 'Run',
    distance: 2000,
    moving_time: 900,
    total_elevation_gain: 120,
    splits_metric: [
      { split: 1, distance: 1000, moving_time: 500, elevation_difference: 100 },
      { split: 2, distance: 1000, moving_time: 400, elevation_difference: -100 },
    ],
    ...overrides,
  };
}

test('title 越野 identifies trail despite Strava Run type and modest total climb', () => {
  assert.deepEqual(getTrailDetection(activity({ id: 42, total_elevation_gain: 20 })), { isTrail: true, source: 'title' });
  assert.deepEqual(getTrailDetection(activity({ name: 'unlabelled run' })), { isTrail: true, source: 'user-confirmed' });
});

test('climbing can identify an unlabelled trail run', () => {
  assert.deepEqual(getTrailDetection(activity({ id: 42, name: 'Mountain session', distance: 10_000, total_elevation_gain: 500 })), { isTrail: true, source: 'climbing' });
});

test('full altitude stream yields per-kilometer ascent, descent, and effort-equivalent pace', () => {
  const distances = Array.from({ length: 41 }, (_, index) => index * 50);
  const altitudes = distances.map((distance) => distance <= 1000 ? 100 + distance * 0.1 : 200 - (distance - 1000) * 0.1);
  const terrain = getTrailTerrainSummary(activity(), {
    distance: { data: distances },
    altitude: { data: altitudes },
  });
  assert.equal(terrain.gradeCoverage, 1);
  assert.equal(terrain.kilometers[0].ascentMeters, 100);
  assert.equal(terrain.kilometers[0].descentMeters, 0);
  assert.equal(terrain.kilometers[1].ascentMeters, 0);
  assert.equal(terrain.kilometers[1].descentMeters, 100);
  assert.ok(terrain.equivalentPaceSecondsPerKm > 0);
  assert.ok(terrain.kilometers[0].equivalentPaceSecondsPerKm > 0);
});

test('no altitude stream never invents ascent/descent or grade-adjusted pace', () => {
  const terrain = getTrailTerrainSummary(activity(), null);
  assert.equal(terrain.equivalentPaceSecondsPerKm, undefined);
  assert.equal(terrain.gradeCoverage, 0);
  assert.equal(terrain.kilometers[0].netElevationMeters, 100);
  assert.equal(terrain.kilometers[0].ascentMeters, 0);
});

test('trail execution identifies late fade with grade-adjusted pace and heart rate', () => {
  const kilometers = Array.from({ length: 9 }, (_, index) => ({
    kilometer: index + 1,
    distanceMeters: 1000,
    altitudeCoverage: 1,
    ascentMeters: index === 3 ? 110 : 25,
    descentMeters: 0,
    paceSecondsPerKm: index < 6 ? 450 : 540,
    equivalentPaceSecondsPerKm: index < 6 ? 400 : 460,
    averageHeartRate: index < 6 ? 150 : 165,
  }));
  const result = assessTrailExecution(activity({ distance: 9000, total_elevation_gain: 310 }), {
    isTrail: true,
    source: 'title',
    climbMetersPerKm: 34,
    kilometers,
    gradeCoverage: 1,
  }, 'zh');
  assert.equal(result.quality, 'poor');
  assert.match(result.summary, /后段等强配速明显下降/);
  assert.match(result.summary, /第 4 公里/);
  assert.match(result.summary, /15 bpm/);
  assert.doesNotMatch(result.summary, /应结合|间歇/);
});

test('trail execution refuses a quality grade without sufficient altitude coverage', () => {
  const terrain = getTrailTerrainSummary(activity(), null);
  const result = assessTrailExecution(activity(), terrain, 'zh');
  assert.equal(result.quality, undefined);
  assert.match(result.summary, /暂不评定执行质量/);
});
