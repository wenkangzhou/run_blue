import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-trainingPlanRequest-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/trainingPlanRequest.ts');
const compiledPath = path.join(tempDir, 'trainingPlanRequest.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/trainingPlan') return {};
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const { parseTrainingPlanRequest } = require(compiledPath);

function validBody(overrides = {}) {
  return {
    distance: '21k',
    targetTimeSeconds: 7200,
    weeks: 12,
    pb5kSec: 1500,
    weeklyVolume: 45,
    raceDate: '2026-10-18',
    locale: 'zh',
    lthr: 180,
    ...overrides,
  };
}

test('parseTrainingPlanRequest accepts a complete valid payload', () => {
  assert.deepEqual(parseTrainingPlanRequest(validBody()), {
    payload: validBody(),
  });
});

test('parseTrainingPlanRequest defaults omitted weekly volume and optional fields', () => {
  assert.deepEqual(
    parseTrainingPlanRequest(validBody({ weeklyVolume: undefined, raceDate: '', locale: '', lthr: null })),
    {
      payload: {
        distance: '21k',
        targetTimeSeconds: 7200,
        weeks: 12,
        pb5kSec: 1500,
        weeklyVolume: 30,
        raceDate: undefined,
        locale: undefined,
        lthr: undefined,
      },
    }
  );
});

test('parseTrainingPlanRequest rejects invalid race distance and date values', () => {
  assert.deepEqual(parseTrainingPlanRequest(validBody({ distance: '50k' })), {
    error: 'Invalid race distance',
  });
  assert.deepEqual(parseTrainingPlanRequest(validBody({ raceDate: '2026-02-30' })), {
    error: 'Invalid race date',
  });
  assert.deepEqual(parseTrainingPlanRequest(validBody({ raceDate: '10/18/2026' })), {
    error: 'Invalid race date',
  });
});

test('parseTrainingPlanRequest requires integer target and PB seconds', () => {
  assert.deepEqual(parseTrainingPlanRequest(validBody({ targetTimeSeconds: 7200.5 })), {
    error: 'Invalid target time',
  });
  assert.deepEqual(parseTrainingPlanRequest(validBody({ pb5kSec: 1500.5 })), {
    error: 'Invalid 5K PB',
  });
});

test('parseTrainingPlanRequest validates weeks, weekly volume, and LTHR ranges', () => {
  assert.deepEqual(parseTrainingPlanRequest(validBody({ weeks: 3 })), {
    error: 'Plan weeks must be between 4 and 20',
  });
  assert.deepEqual(parseTrainingPlanRequest(validBody({ weeklyVolume: 301 })), {
    error: 'Weekly volume must be between 0 and 300 km',
  });
  assert.deepEqual(parseTrainingPlanRequest(validBody({ lthr: 79 })), {
    error: 'LTHR must be between 80 and 240 bpm',
  });
  assert.deepEqual(parseTrainingPlanRequest(validBody({ lthr: 180.5 })), {
    error: 'LTHR must be between 80 and 240 bpm',
  });
});
