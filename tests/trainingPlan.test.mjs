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

compileLibFile('src/lib/dates.ts', 'dates.js');
compileLibFile('src/lib/heartRateZones.ts', 'heartRateZones.js');
compileLibFile('src/lib/paceFormat.ts', 'paceFormat.js');
compileLibFile('src/lib/userProfile.ts', 'userProfile.js');
compileLibFile('src/lib/trainingZones.ts', 'trainingZones.js');
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

  const trainingWeeks = plan.weeks.slice(0, -1);
  assert.equal(trainingWeeks.every((week) => (
    week.sessions.some((session) => session.type === 'long' && session.day === 5)
  )), true);
  assert.equal(trainingWeeks.every((week) => (
    week.sessions.some((session) => session.day === 6 && ['recovery', 'rest'].includes(session.type))
  )), true);
  assert.equal(plan.weeks.every((week) => !/Sunday LSD|周日长距离/.test(week.notes)), true);

  const easyRun = plan.weeks[0].sessions.find((session) => session.type === 'easy');
  assert.match(easyRun.description, /153-160bpm/);

  const repetitionSessions = plan.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.paceZone === 'R');
  const intervalSessions = plan.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.paceZone === 'I');
  assert.equal(repetitionSessions.length > 0, true);
  assert.equal(repetitionSessions.every((session) => session.workDistance <= 1), true);
  assert.equal(repetitionSessions.every((session) => session.distance <= 5), true);
  assert.equal(intervalSessions.length > 0, true);
  assert.equal(intervalSessions.every((session) => session.workDistance <= 4), true);
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
  plan.executionOverrides = {
    '1-2': {
      matchMode: 'manual',
      activityId: 123,
      dateOffsetDays: 1,
      updatedAt: '2026-06-25T08:00:00.000Z',
    },
  };

  await saveTrainingPlan(plan);

  assert.equal(localStorage.data.has('runblue_training_plans'), true);
  assert.equal((await getStoredTrainingPlans()).length, 1);
  const restoredPlan = await getStoredTrainingPlan(plan.id);
  assert.equal(restoredPlan.id, plan.id);
  assert.deepEqual(restoredPlan.executionOverrides, plan.executionOverrides);

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

test('normalizes legacy oversized R and I sessions when plans are loaded', async () => {
  const plan = await generateTrainingPlan('10k', 3000, 10, 1500, 30, undefined, 'zh', 175);
  const rSession = plan.weeks.flatMap((week) => week.sessions).find((session) => session.paceZone === 'R');
  const iSession = plan.weeks.flatMap((week) => week.sessions).find((session) => session.paceZone === 'I');
  rSession.distance = 6;
  rSession.workDistance = undefined;
  rSession.description = '速度激活\n8×200m @ 3:40/km\n配速建议：R区 3:35-3:45/km';
  iSession.distance = 8;
  iSession.workDistance = undefined;
  iSession.description = '间歇训练\n5×1000m @ 4:10/km，组休2.5min';
  installBrowserStorage({
    local: { runblue_training_plans: JSON.stringify([plan]) },
  });

  const restored = await getStoredTrainingPlan(plan.id);
  const restoredR = restored.weeks.flatMap((week) => week.sessions).find((session) => session.paceZone === 'R');
  const restoredI = restored.weeks.flatMap((week) => week.sessions).find((session) => session.paceZone === 'I');

  assert.equal(restoredR.distance, 4.2);
  assert.equal(restoredR.workDistance, 0.6);
  assert.match(restoredR.description, /6×100m/);
  assert.equal(restoredI.distance, 7);
  assert.equal(restoredI.workDistance, 4);
  assert.match(restoredI.description, /4×1000m/);
});

test('moves stored Sunday long runs to Saturday without moving race day', async () => {
  const plan = await generateTrainingPlan('10k', 3000, 10, 1500, 30, '2026-11-08', 'zh', 175);
  const firstWeek = plan.weeks[0];
  const longRun = firstWeek.sessions.find((session) => session.type === 'long');
  const sundayRecovery = firstWeek.sessions.find((session) => session.day === 6);
  longRun.day = 6;
  sundayRecovery.day = 5;
  firstWeek.sessions.sort((left, right) => left.day - right.day);
  firstWeek.notes = '建立期：周三强度课+周日长距离，重视高强度日之间的恢复。';
  plan.executionOverrides = {
    '1-6': {
      matchMode: 'manual',
      activityId: 123,
      updatedAt: '2026-09-02T08:00:00.000Z',
    },
  };
  installBrowserStorage({
    local: { runblue_training_plans: JSON.stringify([plan]) },
  });

  const restored = await getStoredTrainingPlan(plan.id);
  const restoredFirstWeek = restored.weeks[0];

  assert.equal(restoredFirstWeek.sessions.find((session) => session.type === 'long').day, 5);
  assert.equal(restoredFirstWeek.sessions.find((session) => session.day === 6).type, sundayRecovery.type);
  assert.match(restoredFirstWeek.notes, /周六长距离/);
  assert.equal(restored.executionOverrides['1-5'].activityId, 123);
  assert.equal(restored.weeks.at(-1).sessions.at(-1).type, 'race');
  assert.equal(restored.weeks.at(-1).sessions.at(-1).day, 6);
});
