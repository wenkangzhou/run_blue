import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { cleanupBrowserStorage, createFakeIndexedDB, installBrowserStorage } from './helpers/browserStorage.mjs';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-activityDetailCache-test');
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
compileLibFile('src/lib/cache.ts', 'cache.js');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/dates') return require(path.join(tempDir, 'dates.js'));
  if (request === '@/types') return {};
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const {
  clearActivityCache,
  getCachedActivity,
  setCachedActivity,
  shouldRefreshCachedActivity,
} = require(path.join(tempDir, 'cache.js'));

test.afterEach(cleanupBrowserStorage);

function makeActivity(id, startDateLocal = '2026-06-01T08:00:00Z') {
  return {
    id,
    name: `Run ${id}`,
    distance: 5000,
    moving_time: 1500,
    elapsed_time: 1520,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: startDateLocal,
    start_date_local: startDateLocal,
    map: { id: String(id), polyline: null, summary_polyline: null },
  };
}

const streams = {
  heartrate: {
    type: 'heartrate',
    data: [130, 150, 170],
    series_type: 'distance',
    original_size: 3,
    resolution: 'high',
  },
};

test('activity detail cache refreshes only recent stale entries', () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-06-03T08:00:00Z');

  try {
    assert.equal(
      shouldRefreshCachedActivity({
        activity: makeActivity(1, '2026-06-01T08:00:00Z'),
        streams: null,
        timestamp: Date.now() - 2 * 60 * 60 * 1000,
      }),
      true
    );

    assert.equal(
      shouldRefreshCachedActivity({
        activity: makeActivity(2, '2026-06-01T08:00:00Z'),
        streams: null,
        timestamp: Date.now() - 30 * 60 * 1000,
      }),
      false
    );

    assert.equal(
      shouldRefreshCachedActivity({
        activity: makeActivity(3, '2026-05-01T08:00:00Z'),
        streams: null,
        timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000,
      }),
      false
    );
  } finally {
    Date.now = originalNow;
  }
});

test('activity detail cache uses localStorage when IndexedDB is unavailable', async () => {
  const localStorage = installBrowserStorage();
  const originalNow = Date.now;
  Date.now = () => 1770000000000;

  try {
    await setCachedActivity(123, makeActivity(123), streams);

    const cached = await getCachedActivity(123);
    assert.equal(cached.activity.id, 123);
    assert.deepEqual(cached.streams, streams);
    assert.equal(cached.timestamp, 1770000000000);
    assert.equal(localStorage.data.has('run_blue_cache_activity_123'), true);

    await clearActivityCache(123);
    assert.equal(await getCachedActivity(123), null);
    assert.equal(localStorage.data.has('run_blue_cache_activity_123'), false);
  } finally {
    Date.now = originalNow;
  }
});

test('activity detail cache migrates legacy localStorage values into IndexedDB', async () => {
  const cachedActivity = {
    activity: makeActivity(456),
    streams,
    timestamp: 1770000000000,
  };
  const fakeIndexedDB = createFakeIndexedDB();
  const localStorage = installBrowserStorage({
    indexedDB: fakeIndexedDB.api,
    local: {
      run_blue_cache_activity_456: JSON.stringify(cachedActivity),
    },
  });

  const cached = await getCachedActivity(456);

  assert.deepEqual(cached, cachedActivity);
  assert.equal(localStorage.data.has('run_blue_cache_activity_456'), false);

  const indexedStore = fakeIndexedDB.stores.get('activity_details');
  assert.deepEqual(indexedStore.get('run_blue_cache_activity_456'), cachedActivity);

  await clearActivityCache(456);
  assert.equal(indexedStore.has('run_blue_cache_activity_456'), false);
});
