import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { cleanupBrowserStorage, createFakeIndexedDB, installBrowserStorage } from './helpers/browserStorage.mjs';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-trainingPlan-test');
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

compileLibFile('src/lib/heartRateZones.ts', 'heartRateZones.js');
compileLibFile('src/lib/paceFormat.ts', 'paceFormat.js');
compileLibFile('src/lib/userProfile.ts', 'userProfile.js');
compileLibFile('src/lib/trainingPlan.ts', 'trainingPlan.js');

const {
  clearTrainingPlans,
  deleteTrainingPlan,
  generateTrainingPlan,
  getStoredTrainingPlan,
  getStoredTrainingPlans,
  estimatePlanWeeks,
  getRecommendedTargetTime,
  saveTrainingPlan,
  TrainingPlanInputError,
} = require(path.join(tempDir, 'trainingPlan.js'));

test.afterEach(cleanupBrowserStorage);

test('generates a periodized training plan with seven sessions per week', async () => {
  const plan = await generateTrainingPlan('21k', 7200, 12, 1500, 35, '2026-10-18', 'zh', 180);

  assert.equal(plan.goal.distance, '21k');
  assert.equal(plan.goal.targetTimeSeconds, 7200);
  assert.equal(plan.goal.raceDate, '2026-10-18');
  assert.equal(plan.currentAbility.lthr, 180);
  assert.equal(plan.weeks.length, 12);

  const phases = new Set(plan.weeks.map((week) => week.phase));
  assert.equal(phases.has('base'), true);
  assert.equal(phases.has('build'), true);
  assert.equal(phases.has('peak'), true);
  assert.equal(phases.has('taper'), true);

  for (const week of plan.weeks) {
    assert.equal(week.sessions.length, 7, `week ${week.week} should have seven sessions`);
    assert.deepEqual(week.sessions.map((session) => session.day), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(week.sessions.every((session) => session.title.trim().length > 0), true);
    assert.equal(week.sessions.every((session) => session.description.trim().length > 0), true);
    assert.equal(week.totalDistance, week.sessions.reduce((sum, session) => sum + session.distance, 0));
  }

  const finalSession = plan.weeks.at(-1).sessions.at(-1);
  assert.equal(finalSession.type, 'race');
  assert.equal(finalSession.day, 6);

  const easyRun = plan.weeks[0].sessions.find((session) => session.type === 'easy');
  assert.match(easyRun.description, /153-160bpm/);
});

test('rejects unrealistic race goals from the 5K PB equivalency check', async () => {
  await assert.rejects(
    () => generateTrainingPlan('42k', 7200, 16, 1500, 50, undefined, 'en'),
    TrainingPlanInputError
  );
});

test('estimates default plan weeks by race distance', () => {
  assert.equal(estimatePlanWeeks('5k'), 8);
  assert.equal(estimatePlanWeeks('10k'), 10);
  assert.equal(estimatePlanWeeks('21k'), 12);
  assert.equal(estimatePlanWeeks('42k'), 16);
});

test('recommends target time from exact or nearest available PB', () => {
  const exact = getRecommendedTargetTime({ '10k': 2700 }, '10k');
  assert.deepEqual(exact, {
    seconds: 2700,
    sourceDistance: '10k',
    sourceSeconds: 2700,
    estimated: false,
  });

  const estimated = getRecommendedTargetTime({ '5k': 1275 }, '10k');
  assert.equal(estimated.sourceDistance, '5k');
  assert.equal(estimated.sourceSeconds, 1275);
  assert.equal(estimated.estimated, true);
  assert.equal(estimated.seconds, 2658);
});

test('stores training plans through localStorage when IndexedDB is unavailable', async () => {
  const localStorage = installBrowserStorage();
  const plan = await generateTrainingPlan('10k', 3000, 10, 1500, 30, undefined, 'zh', 175);

  await saveTrainingPlan(plan);

  assert.equal(localStorage.data.has('runblue_training_plans'), true);
  assert.equal((await getStoredTrainingPlans()).length, 1);
  assert.equal((await getStoredTrainingPlan(plan.id)).id, plan.id);

  await deleteTrainingPlan(plan.id);
  assert.deepEqual(await getStoredTrainingPlans(), []);
});

test('migrates legacy localStorage training plans into IndexedDB', async () => {
  const plan = await generateTrainingPlan('5k', 1500, 8, 1500, 25, undefined, 'en', 172);
  const fakeIndexedDB = createFakeIndexedDB();
  const localStorage = installBrowserStorage({
    indexedDB: fakeIndexedDB.api,
    local: {
      runblue_training_plans: JSON.stringify([plan]),
    },
  });

  const plans = await getStoredTrainingPlans();

  assert.equal(plans.length, 1);
  assert.equal(plans[0].id, plan.id);
  assert.equal(localStorage.data.has('runblue_training_plans'), false);

  const indexedStore = fakeIndexedDB.stores.get('training_plans');
  assert.deepEqual(indexedStore.get('runblue_training_plans'), [plan]);

  await clearTrainingPlans();
  assert.equal(indexedStore.has('runblue_training_plans'), false);
});
