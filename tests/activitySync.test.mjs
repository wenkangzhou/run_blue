import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-activitySync-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/activitySync.ts');
const compiledPath = path.join(tempDir, 'activitySync.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const CACHE_TTL = 1000 * 60 * 30;

let state;
let pageData;
let calls;
let syncedRouteSizes;

function makeActivity(id, daysAgo = id) {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id,
    name: `Run ${id}`,
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    type: 'Run',
    sport_type: 'Run',
    start_date: date,
    start_date_local: date,
    map: { id: String(id), summary_polyline: null, polyline: null },
  };
}

function makeActivities(startId, count, startDaysAgo = 0) {
  return Array.from({ length: count }, (_, index) => makeActivity(startId - index, startDaysAgo + index));
}

function makeRecentActivities(startId, count) {
  return Array.from({ length: count }, (_, index) => makeActivity(startId - index, 1));
}

function mergeActivities(existing, incoming) {
  const merged = new Map();
  for (const activity of existing) merged.set(activity.id, activity);
  for (const activity of incoming) merged.set(activity.id, { ...merged.get(activity.id), ...activity });
  return [...merged.values()].sort((a, b) => Date.parse(b.start_date) - Date.parse(a.start_date));
}

function resetStore(patch = {}) {
  pageData = new Map();
  calls = [];
  syncedRouteSizes = [];
  state = {
    activities: [],
    lastFetchedAt: null,
    loadedPages: 0,
    hasMore: true,
    latestActivityId: null,
    replaceActivitiesBatch(activities, loadedPages, hasMore, lastFetchedAt, latestActivityId) {
      state.activities = [...activities];
      state.loadedPages = loadedPages;
      state.hasMore = hasMore;
      state.lastFetchedAt = lastFetchedAt;
      state.latestActivityId = latestActivityId ?? activities[0]?.id ?? null;
    },
    mergeActivitiesBatch(activities, loadedPages, hasMore, lastFetchedAt, latestActivityId) {
      state.activities = mergeActivities(state.activities, activities);
      state.loadedPages = Math.max(state.loadedPages, loadedPages);
      state.hasMore = state.hasMore && hasMore;
      state.lastFetchedAt = lastFetchedAt;
      state.latestActivityId = latestActivityId ?? state.activities[0]?.id ?? state.latestActivityId;
    },
    batchUpdate(patchValue) {
      Object.assign(state, patchValue);
    },
    ...patch,
  };
}

resetStore();

const fakeModules = {
  '@/lib/strava': {
    getActivities: async (_accessToken, page, perPage) => {
      calls.push({ page, perPage });
      const data = pageData.get(page);
      if (data instanceof Error) throw data;
      return data ?? [];
    },
  },
  '@/lib/dates': {
    getActivityTimestamp: (activity) => Date.parse(activity.start_date_local || activity.start_date || ''),
  },
  '@/store/activities': {
    useActivitiesStore: {
      getState: () => state,
    },
    isActivitiesCacheStale: (lastFetchedAt) => !lastFetchedAt || Date.now() - lastFetchedAt > CACHE_TTL,
  },
  '@/store/routes': {
    useRoutesStore: {
      getState: () => ({
        syncRoutes: (activities) => syncedRouteSizes.push(activities.length),
      }),
    },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(fakeModules, request)) {
    return fakeModules[request];
  }
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const {
  ACTIVITIES_PER_PAGE,
  ensureActivityHistory,
  getNextActivitiesPage,
  loadRemainingActivities,
  syncRecentActivities,
} = require(compiledPath);

test('calculates the next page from persisted paging metadata first', () => {
  assert.equal(getNextActivitiesPage(2, 350), 3);
  assert.equal(getNextActivitiesPage(0, 0), 1);
  assert.equal(getNextActivitiesPage(0, 350), 3);
});

test('skips recent sync while the cache is fresh', async () => {
  resetStore({
    activities: [makeActivity(1)],
    loadedPages: 1,
    lastFetchedAt: Date.now(),
  });

  const result = await syncRecentActivities('token');

  assert.deepEqual(result, { skipped: true, pagesFetched: 0, activitiesFetched: 0 });
  assert.deepEqual(calls, []);
  assert.deepEqual(syncedRouteSizes, []);
});

test('recent sync merges new activities without dropping cached history', async () => {
  const oldHistory = [makeActivity(100, 20), makeActivity(90, 40)];
  resetStore({
    activities: oldHistory,
    loadedPages: 2,
    hasMore: false,
    lastFetchedAt: Date.now() - CACHE_TTL - 1000,
    latestActivityId: 100,
  });
  pageData.set(1, [makeActivity(110, 1), makeActivity(100, 20)]);

  const result = await syncRecentActivities('token');

  assert.equal(result.skipped, false);
  assert.deepEqual(calls, [{ page: 1, perPage: ACTIVITIES_PER_PAGE }]);
  assert.deepEqual(state.activities.map((activity) => activity.id), [110, 100, 90]);
  assert.equal(state.loadedPages, 2);
  assert.equal(state.hasMore, false);
  assert.deepEqual(syncedRouteSizes, [3]);
});

test('recent sync records the actual fetched page count when capped by maxPages', async () => {
  resetStore();
  pageData.set(1, makeRecentActivities(1000, 200));
  pageData.set(2, makeRecentActivities(800, 200));
  pageData.set(3, makeRecentActivities(600, 200));
  pageData.set(4, makeActivities(400, 12, 20));

  const recent = await syncRecentActivities('token', { force: true, maxPages: 3 });

  assert.equal(recent.pagesFetched, 3);
  assert.equal(state.loadedPages, 3);
  assert.equal(state.hasMore, true);

  const remaining = await loadRemainingActivities('token', { delayMs: 0, maxPages: 1 });

  assert.deepEqual(calls.map((call) => call.page), [1, 2, 3, 4]);
  assert.deepEqual(remaining, { pagesLoaded: 1, activitiesFetched: 12, hasMore: false });
  assert.equal(state.loadedPages, 4);
  assert.equal(state.hasMore, false);
});

test('loads remaining history until the first short page and persists hasMore=false', async () => {
  resetStore({
    activities: makeActivities(1000, 200, 0),
    loadedPages: 1,
    hasMore: true,
    lastFetchedAt: Date.now() - CACHE_TTL - 1000,
    latestActivityId: 1000,
  });
  pageData.set(2, makeActivities(800, 200, 200));
  pageData.set(3, makeActivities(600, 12, 400));

  const result = await loadRemainingActivities('token', { delayMs: 0, maxPages: 5 });

  assert.deepEqual(calls, [
    { page: 2, perPage: ACTIVITIES_PER_PAGE },
    { page: 3, perPage: ACTIVITIES_PER_PAGE },
  ]);
  assert.deepEqual(result, { pagesLoaded: 2, activitiesFetched: 212, hasMore: false });
  assert.equal(state.loadedPages, 3);
  assert.equal(state.hasMore, false);
  assert.equal(state.activities.length, 412);
  assert.deepEqual(syncedRouteSizes, [400, 412]);
});

test('ensureActivityHistory skips network when cache is fresh and history is complete', async () => {
  resetStore({
    activities: makeActivities(100, 20, 1),
    loadedPages: 1,
    hasMore: false,
    lastFetchedAt: Date.now(),
    latestActivityId: 100,
  });

  const result = await ensureActivityHistory('token');

  assert.deepEqual(result, {
    recent: { skipped: true, pagesFetched: 0, activitiesFetched: 0 },
    remaining: { pagesLoaded: 0, activitiesFetched: 0, hasMore: false },
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(syncedRouteSizes, []);
});

test('ensureActivityHistory syncs stale recent data before continuing historical pages', async () => {
  resetStore({
    activities: makeActivities(1000, 200, 10),
    loadedPages: 1,
    hasMore: true,
    lastFetchedAt: Date.now() - CACHE_TTL - 1000,
    latestActivityId: 1000,
  });
  pageData.set(1, makeActivities(1100, 200, 0));
  pageData.set(2, makeActivities(800, 12, 220));

  const progress = [];
  const result = await ensureActivityHistory('token', {
    delayMs: 0,
    maxPages: 5,
    onProgress: ({ pagesLoaded, page }) => progress.push({ pagesLoaded, page }),
  });

  assert.deepEqual(calls, [
    { page: 1, perPage: ACTIVITIES_PER_PAGE },
    { page: 2, perPage: ACTIVITIES_PER_PAGE },
  ]);
  assert.equal(result.recent.skipped, false);
  assert.equal(result.recent.pagesFetched, 1);
  assert.equal(result.recent.activitiesFetched, 200);
  assert.deepEqual(result.remaining, { pagesLoaded: 1, activitiesFetched: 12, hasMore: false });
  assert.deepEqual(progress, [{ pagesLoaded: 1, page: 2 }]);
  assert.equal(state.loadedPages, 2);
  assert.equal(state.hasMore, false);
  assert.deepEqual(syncedRouteSizes, [300, 312]);
});
