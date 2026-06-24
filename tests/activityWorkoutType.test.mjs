import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-activityWorkoutType-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/activityWorkoutType.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;
writeFileSync(path.join(tempDir, 'activityWorkoutType.js'), compiled);

const {
  getActivityWorkoutCategory,
  getActivityWorkoutSearchTerms,
  matchesActivityWorkoutCategory,
} = require(path.join(tempDir, 'activityWorkoutType.js'));

function makeActivity(overrides = {}) {
  return {
    name: 'Morning Run',
    description: '',
    distance: 8000,
    workout_type: null,
    ...overrides,
  };
}

test('maps the four Strava run workout types', () => {
  assert.equal(getActivityWorkoutCategory(makeActivity({ workout_type: 0 })), 'normal');
  assert.equal(getActivityWorkoutCategory(makeActivity({ workout_type: 1 })), 'race');
  assert.equal(getActivityWorkoutCategory(makeActivity({ workout_type: 2 })), 'longRun');
  assert.equal(getActivityWorkoutCategory(makeActivity({ workout_type: 3 })), 'workout');
});

test('keeps every explicit type zero activity in the normal run category', () => {
  assert.equal(getActivityWorkoutCategory(makeActivity({
    workout_type: 0,
    name: 'Recovery Run',
    distance: 20000,
  })), 'normal');
});

test('uses conservative fallbacks when the Strava type is missing', () => {
  assert.equal(getActivityWorkoutCategory(makeActivity({ description: '6 x 800m 间歇训练' })), 'workout');
  assert.equal(getActivityWorkoutCategory(makeActivity({ distance: 18000 })), 'longRun');
  assert.equal(getActivityWorkoutCategory(makeActivity()), 'normal');
});

test('matches multiple selected categories using OR semantics', () => {
  const normal = makeActivity({ workout_type: 0 });
  assert.equal(matchesActivityWorkoutCategory(normal, ['race', 'normal']), true);
  assert.equal(matchesActivityWorkoutCategory(normal, ['race', 'workout']), false);
});

test('adds localized search synonyms for activity types', () => {
  assert.ok(getActivityWorkoutSearchTerms(makeActivity({ workout_type: 0 })).includes('普通跑'));
  assert.ok(getActivityWorkoutSearchTerms(makeActivity({ workout_type: 3 })).includes('训练'));
});
