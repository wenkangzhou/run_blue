import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-gearStats-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/gearStats.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;
const compiledPath = path.join(tempDir, 'gearStats.cjs');
writeFileSync(compiledPath, compiled);

const {
  buildGearStats,
  getShoeMileageState,
  mergeGearActivities,
  sortGearStats,
} = require(compiledPath);

function makeActivity(id, overrides = {}) {
  return {
    id,
    distance: 5000,
    moving_time: 1500,
    type: 'Run',
    sport_type: 'Run',
    gear_id: 'shoe-1',
    gear: { id: 'shoe-1', name: 'Daily Trainer', distance: 0 },
    average_speed: 3.33,
    ...overrides,
  };
}

test('mergeGearActivities keeps cached gear assignments when a lighter store item omits them', () => {
  const merged = mergeGearActivities(
    [makeActivity(1)],
    [makeActivity(1, { distance: 5200, gear_id: null, gear: undefined })]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].gear_id, 'shoe-1');
  assert.equal(merged[0].distance, 5000);
});

test('buildGearStats prefers official mileage and aggregates activity usage', () => {
  const stats = buildGearStats(
    [
      makeActivity(1),
      makeActivity(2, { distance: 10000, moving_time: 3000, average_speed: 3.5 }),
    ],
    [{
      id: 'shoe-1',
      name: 'Tempo 1',
      distance: 720000,
      brand_name: 'Run Blue',
      retired: false,
    }]
  );

  assert.equal(stats.length, 1);
  assert.equal(stats[0].name, 'Tempo 1');
  assert.equal(stats[0].displayDistance, 720000);
  assert.equal(stats[0].activityDistance, 15000);
  assert.equal(stats[0].activityCount, 2);
  assert.equal(stats[0].activityTime, 4500);
});

test('sortGearStats and mileage states support the gear controls', () => {
  const base = {
    gearId: '',
    name: '',
    stravaDistance: 0,
    activityDistance: 0,
    displayDistance: 0,
    activityTime: 0,
    activityCount: 0,
    avgSpeed: 0,
    retired: false,
  };
  const shoes = [
    { ...base, gearId: 'a', name: 'Alpha', displayDistance: 700000, activityCount: 4, avgSpeed: 3.2 },
    { ...base, gearId: 'b', name: 'Beta', displayDistance: 200000, activityCount: 10, avgSpeed: 3.8 },
  ];

  assert.equal(sortGearStats(shoes, 'distance')[0].gearId, 'a');
  assert.equal(sortGearStats(shoes, 'runs')[0].gearId, 'b');
  assert.equal(sortGearStats(shoes, 'pace')[0].gearId, 'b');
  assert.equal(getShoeMileageState(200000), 'fresh');
  assert.equal(getShoeMileageState(700000), 'watch');
  assert.equal(getShoeMileageState(800000), 'replace');
});
