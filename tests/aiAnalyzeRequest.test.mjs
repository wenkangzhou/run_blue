import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-aiAnalyzeRequest-test');
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

compileLibFile('src/lib/userProfile.ts', 'userProfile.js');
compileLibFile('src/lib/aiAnalyzeRequest.ts', 'aiAnalyzeRequest.js');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/userProfile') return require(path.join(tempDir, 'userProfile.js'));
  if (request === '@/types') return {};
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const { parseAIAnalyzeRequest } = require(path.join(tempDir, 'aiAnalyzeRequest.js'));

function makeActivity(overrides = {}) {
  return {
    id: 123,
    name: 'Morning Run',
    distance: 5000,
    moving_time: 1500,
    elapsed_time: 1510,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-06-04T00:00:00Z',
    start_date_local: '2026-06-04T08:00:00Z',
    average_speed: 3.33,
    max_speed: 5,
    has_heartrate: true,
    map: { id: '123', summary_polyline: null, polyline: null },
    ...overrides,
  };
}

test('parseAIAnalyzeRequest accepts and normalizes a valid payload', () => {
  const result = parseAIAnalyzeRequest({
    activity: makeActivity(),
    streams: { heartrate: { type: 'heartrate', data: [130], series_type: 'distance', original_size: 1, resolution: 'high' } },
    userProfilePBs: { '5k': 1500, bad: -1, text: 'nope' },
    recentActivities: [makeActivity({ id: 124 }), { id: 1 }],
    locale: 'zh',
    physique: { height: 178, weight: 68 },
    lthr: 180,
    allowThirdPartyAI: true,
  });

  assert.equal('payload' in result, true);
  assert.equal(result.payload.activity.id, 123);
  assert.deepEqual(result.payload.userProfilePBs, { '5k': 1500 });
  assert.equal(result.payload.recentActivities.length, 1);
  assert.deepEqual(result.payload.physique, { height: 178, weight: 68 });
  assert.equal(result.payload.lthr, 180);
  assert.equal(result.payload.allowThirdPartyAI, true);
});

test('parseAIAnalyzeRequest rejects missing or malformed activity data', () => {
  assert.deepEqual(parseAIAnalyzeRequest(null), { error: 'Invalid request body' });
  assert.deepEqual(parseAIAnalyzeRequest({ activity: null }), { error: 'Activity data required' });
  assert.deepEqual(parseAIAnalyzeRequest({ activity: makeActivity({ distance: 0 }) }), { error: 'Activity data required' });
  assert.deepEqual(parseAIAnalyzeRequest({ activity: makeActivity({ name: undefined }) }), { error: 'Activity data required' });
});

test('parseAIAnalyzeRequest rejects invalid LTHR and drops invalid physique values', () => {
  assert.deepEqual(parseAIAnalyzeRequest({ activity: makeActivity(), lthr: 180.5 }), {
    error: 'Invalid LTHR',
  });

  const result = parseAIAnalyzeRequest({
    activity: makeActivity(),
    physique: { height: 20, weight: 68 },
  });

  assert.equal('payload' in result, true);
  assert.deepEqual(result.payload.physique, { height: null, weight: 68 });
});

test('parseAIAnalyzeRequest normalizes optional streams and locale', () => {
  const result = parseAIAnalyzeRequest({
    activity: makeActivity(),
    streams: 'bad',
    locale: '',
  });

  assert.equal('payload' in result, true);
  assert.equal(result.payload.streams, null);
  assert.equal(result.payload.locale, undefined);
  assert.equal(result.payload.allowThirdPartyAI, false);
});
