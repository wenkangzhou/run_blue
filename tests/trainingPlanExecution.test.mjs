import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-trainingPlanExecution-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/trainingPlanExecution.ts', 'utf8')
  .replace("'@/lib/dates'", "'./dates'");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
writeFileSync(path.join(tempDir, 'trainingPlanExecution.cjs'), compiled);
writeFileSync(
  path.join(tempDir, 'dates.js'),
  "exports.getActivityDate = (activity) => new Date((activity.start_date_local || activity.start_date).replace(/Z$/, ''));\n"
);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types' || request === '@/lib/trainingPlan') return {};
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const {
  calculateTrainingPlanExecution,
  getTrainingPlanStartDate,
} = require(path.join(tempDir, 'trainingPlanExecution.cjs'));

function makeSession(day, type, distance) {
  return { day, type, distance, title: type, description: '', paceZone: 'E' };
}

function makePlan(overrides = {}) {
  return {
    id: 'plan-1',
    createdAt: '2026-06-01T10:00:00.000Z',
    goal: {
      distance: '10k',
      targetTimeSeconds: 3000,
      raceDate: '2026-06-14',
    },
    currentAbility: { weeklyVolume: 30 },
    weeks: [
      {
        week: 1,
        phase: 'base',
        totalDistance: 15,
        notes: '',
        sessions: [
          makeSession(0, 'rest', 0),
          makeSession(1, 'easy', 5),
          makeSession(6, 'long', 10),
        ],
      },
      {
        week: 2,
        phase: 'taper',
        totalDistance: 10,
        notes: '',
        sessions: [
          makeSession(2, 'easy', 4),
          makeSession(6, 'race', 10),
        ],
      },
    ],
    ...overrides,
  };
}

function makeActivity(id, date, distance, overrides = {}) {
  return {
    id,
    name: 'Morning Run',
    description: '',
    distance,
    moving_time: 1800,
    type: 'Run',
    sport_type: 'Run',
    start_date: `${date}T00:00:00Z`,
    start_date_local: `${date}T08:00:00Z`,
    workout_type: 0,
    laps: [],
    ...overrides,
  };
}

test('anchors the final Sunday session to the race date', () => {
  const plan = makePlan();
  const start = getTrainingPlanStartDate(plan);
  assert.deepEqual(
    [start.getFullYear(), start.getMonth() + 1, start.getDate()],
    [2026, 6, 1]
  );
});

test('matches same-day and shifted activities without reusing records', () => {
  const execution = calculateTrainingPlanExecution(
    makePlan(),
    [
      makeActivity(1, '2026-06-02', 5200),
      makeActivity(2, '2026-06-08', 9000, { workout_type: 2 }),
      makeActivity(3, '2026-06-14', 10000, { workout_type: 1 }),
    ],
    new Date('2026-06-15T12:00:00')
  );

  const easy = execution.sessions.find((session) => session.key === '1-1');
  const long = execution.sessions.find((session) => session.key === '1-6');
  const race = execution.sessions.find((session) => session.key === '2-6');

  assert.equal(easy.status, 'completed');
  assert.equal(long.status, 'completed');
  assert.equal(long.dateDelta, 1);
  assert.equal(race.status, 'completed');
  assert.equal(new Set(execution.sessions.map((session) => session.activity?.id).filter(Boolean)).size, 3);
});

test('marks short runs partial and past unmatched sessions missed', () => {
  const execution = calculateTrainingPlanExecution(
    makePlan(),
    [makeActivity(1, '2026-06-02', 2000)],
    new Date('2026-06-10T12:00:00')
  );

  assert.equal(execution.sessions.find((session) => session.key === '1-1').status, 'partial');
  assert.equal(execution.sessions.find((session) => session.key === '1-6').status, 'missed');
  assert.equal(execution.sessions.find((session) => session.key === '2-6').status, 'upcoming');
  assert.equal(execution.partialCount, 1);
  assert.equal(execution.missedCount, 1);
});
