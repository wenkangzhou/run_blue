import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-trainingLoad-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/trainingLoad.ts', 'utf8');
writeFileSync(path.join(tempDir, 'trainingLoad.js'), ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types') return {};
  if (request === '@/lib/dates') {
    return {
      getActivityTimestamp: (activity) => new Date(activity.start_date).getTime(),
      getActivityDateKey: (activity) => activity.start_date.slice(0, 10),
      formatLocalDateKey: (date) => [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-'),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
test.after(() => { Module._load = originalLoad; });

const { calculateActivityTrainingLoad, calculateTrainingLoadSummary } = require(path.join(tempDir, 'trainingLoad.js'));

function makeRun(daysAgo, overrides = {}) {
  const now = new Date('2026-07-02T12:00:00Z');
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return {
    id: daysAgo + 1,
    name: 'Run',
    type: 'Run',
    sport_type: 'Run',
    distance: 8000,
    moving_time: 3000,
    elapsed_time: 3050,
    start_date: date.toISOString(),
    average_heartrate: 145,
    ...overrides,
  };
}

test('activity load increases with duration and heart-rate intensity', () => {
  const easy = calculateActivityTrainingLoad(makeRun(0, { moving_time: 2400, average_heartrate: 130 }), 175);
  const hard = calculateActivityTrainingLoad(makeRun(0, { moving_time: 3600, average_heartrate: 170 }), 175);
  assert.ok(hard > easy);
});

test('training load summary builds four weeks and flags a sharp recent increase', () => {
  const activities = [
    makeRun(0, { moving_time: 7200, average_heartrate: 170, workout_type: 3 }),
    makeRun(2, { moving_time: 5400, average_heartrate: 165, workout_type: 3 }),
    makeRun(4, { moving_time: 4800, average_heartrate: 160 }),
    makeRun(8, { moving_time: 2400, average_heartrate: 135 }),
    makeRun(15, { moving_time: 2400, average_heartrate: 135 }),
    makeRun(22, { moving_time: 2400, average_heartrate: 135 }),
  ];
  const summary = calculateTrainingLoadSummary(activities, 175, new Date('2026-07-02T12:00:00Z'));

  assert.equal(summary.weeks.length, 4);
  assert.equal(summary.state, 'high');
  assert.ok(summary.current7DayLoad > summary.previous7DayLoad);
  assert.equal(
    summary.averageWeeklyLoad,
    Math.round(summary.weeks.slice(0, 3).reduce((total, week) => total + week.load, 0) / 3)
  );
  assert.equal(summary.heartRateCoverage, 100);
  assert.equal(summary.changeReliability, 'low');
  assert.equal(summary.consecutiveRunDays, 1);
});

test('training load summary reports insufficient evidence conservatively', () => {
  const summary = calculateTrainingLoadSummary(
    [makeRun(1), makeRun(10)],
    175,
    new Date('2026-07-02T12:00:00Z')
  );
  assert.equal(summary.state, 'insufficient');
  assert.equal(summary.latestRunDaysAgo, 1);
});

test('training load summary counts consecutive running days ending at the latest run', () => {
  const summary = calculateTrainingLoadSummary(
    [makeRun(0), makeRun(1), makeRun(2), makeRun(4)],
    175,
    new Date('2026-07-02T12:00:00Z')
  );

  assert.equal(summary.consecutiveRunDays, 3);
});
