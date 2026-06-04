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
const tempDir = path.join(os.tmpdir(), 'runblue-gearCache-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/gearCache.ts');
const compiledPath = path.join(tempDir, 'gearCache.cjs');
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
  if (request === '@/types') return {};
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const {
  clearGearCache,
  getGearCache,
  getGearCacheActivities,
  mergeIntoGearCache,
  setGearCache,
} = require(compiledPath);

test.afterEach(cleanupBrowserStorage);

function makeActivity(id, overrides = {}) {
  return {
    id,
    distance: 5000,
    moving_time: 1500,
    type: 'Run',
    sport_type: 'Run',
    gear_id: 'shoe-1',
    gear: { id: 'shoe-1', name: 'Daily Trainer', distance: 500000 },
    average_speed: 3.33,
    name: `Run ${id}`,
    elapsed_time: 1510,
    start_date: '2026-06-01T00:00:00Z',
    start_date_local: '2026-06-01T08:00:00Z',
    map: { id: String(id), summary_polyline: 'heavy-polyline', polyline: null },
    ...overrides,
  };
}

const cacheKey = 'run_blue_gear_activities_v1';
const legacyCache = {
  version: 1,
  activities: [
    {
      id: 1,
      distance: 5000,
      moving_time: 1500,
      type: 'Run',
      sport_type: 'Run',
      gear_id: 'shoe-1',
      gear: { id: 'shoe-1', name: 'Daily Trainer', distance: 500000 },
      average_speed: 3.33,
    },
  ],
  loadedPages: 2,
  hasMore: true,
  lastFetchedAt: 1770000000000,
};

test('gear cache falls back to localStorage when IndexedDB is unavailable', async () => {
  const localStorage = installBrowserStorage();

  await setGearCache({ activities: legacyCache.activities, loadedPages: 2, hasMore: true, lastFetchedAt: 1 });

  assert.deepEqual(await getGearCache(), {
    ...legacyCache,
    lastFetchedAt: 1,
  });
  assert.equal(JSON.parse(localStorage.data.get(cacheKey)).loadedPages, 2);

  await clearGearCache();
  assert.equal(await getGearCache(), null);
  assert.equal(localStorage.data.has(cacheKey), false);
});

test('gear cache migrates legacy localStorage values into IndexedDB', async () => {
  const fakeIndexedDB = createFakeIndexedDB();
  const localStorage = installBrowserStorage({
    indexedDB: fakeIndexedDB.api,
    exposeGlobalIndexedDB: true,
    local: {
      [cacheKey]: JSON.stringify(legacyCache),
    },
  });

  const cache = await getGearCache();

  assert.deepEqual(cache, legacyCache);
  assert.equal(localStorage.data.has(cacheKey), false);

  const indexedStore = fakeIndexedDB.stores.get('gear_cache');
  assert.deepEqual(indexedStore.get(cacheKey), legacyCache);

  await clearGearCache();
  assert.equal(indexedStore.has(cacheKey), false);
});

test('mergeIntoGearCache keeps only lightweight gear activity fields and dedupes', async () => {
  const localStorage = installBrowserStorage();

  await mergeIntoGearCache([
    makeActivity(1),
    makeActivity(1, { distance: 5200, average_speed: 3.5 }),
    makeActivity(2, { gear_id: null, gear: undefined }),
  ]);

  const activities = await getGearCacheActivities();

  assert.equal(activities.length, 2);
  assert.deepEqual(activities.find((activity) => activity.id === 1), {
    id: 1,
    distance: 5200,
    moving_time: 1500,
    type: 'Run',
    sport_type: 'Run',
    gear_id: 'shoe-1',
    gear: { id: 'shoe-1', name: 'Daily Trainer', distance: 500000 },
    average_speed: 3.5,
  });
  assert.equal(Object.hasOwn(activities[0], 'map'), false);
  assert.equal(localStorage.data.has(cacheKey), true);
});
