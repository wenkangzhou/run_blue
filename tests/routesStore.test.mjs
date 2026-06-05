import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const projectRequire = createRequire(path.resolve('package.json'));
const tempDir = path.join(os.tmpdir(), 'runblue-routes-store-test');
mkdirSync(tempDir, { recursive: true });

function compileFile(sourceFile, outputFile) {
  const source = readFileSync(path.resolve(sourceFile), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  writeFileSync(path.join(tempDir, outputFile), compiled);
}

compileFile('src/lib/routeClustering.ts', 'routeClustering.js');
compileFile('src/lib/routeSync.ts', 'routeSync.js');
compileFile('src/lib/indexedDbStorage.ts', 'indexedDbStorage.js');
compileFile('src/store/routes.ts', 'routes.js');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/routeClustering') return require(path.join(tempDir, 'routeClustering.js'));
  if (request === '@/lib/routeSync') return require(path.join(tempDir, 'routeSync.js'));
  if (request === '@/lib/indexedDbStorage') return require(path.join(tempDir, 'indexedDbStorage.js'));
  if (request === '@/types') return {};
  if (request === 'zustand' || request === 'zustand/middleware') {
    return originalLoad.call(this, projectRequire.resolve(request), parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const { useRoutesStore } = require(path.join(tempDir, 'routes.js'));

function encodePolyline(points) {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';

  for (const [lat, lng] of points) {
    const nextLat = Math.round(lat * 1e5);
    const nextLng = Math.round(lng * 1e5);
    result += encodeValue(nextLat - lastLat);
    result += encodeValue(nextLng - lastLng);
    lastLat = nextLat;
    lastLng = nextLng;
  }

  return result;
}

function encodeValue(value) {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';
  while (v >= 0x20) {
    encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  encoded += String.fromCharCode(v + 63);
  return encoded;
}

function makeActivity(id, points, overrides = {}) {
  return {
    id,
    name: `Route ${id}`,
    type: 'Run',
    sport_type: 'Run',
    distance: 5000,
    total_elevation_gain: 30,
    start_latlng: points[0],
    end_latlng: points[points.length - 1],
    map: {
      id: String(id),
      polyline: null,
      summary_polyline: encodePolyline(points),
    },
    moving_time: 1800,
    elapsed_time: 1800,
    start_date: '2026-01-01T00:00:00Z',
    start_date_local: '2026-01-01T08:00:00Z',
    average_speed: 2.77,
    max_speed: 4,
    has_heartrate: false,
    ...overrides,
  };
}

const baseRoute = [
  [31.2000, 121.5000],
  [31.2050, 121.5010],
  [31.2100, 121.5020],
  [31.2150, 121.5030],
  [31.2200, 121.5040],
];

test('saveRoute merges compatible routes even when rounded start keys drift', () => {
  useRoutesStore.setState({ savedRoutes: [] });
  const driftedRoute = baseRoute.map(([lat, lng]) => [lat + 0.0006, lng]);
  const first = makeActivity(1, baseRoute);
  const second = makeActivity(2, driftedRoute);

  useRoutesStore.getState().saveRoute(first, [first]);
  useRoutesStore.getState().saveRoute(second, [first, second]);

  const routes = useRoutesStore.getState().savedRoutes;
  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].activityIds, [2, 1]);
});

test('mergeRoutes combines route activity ids and removes the source route', () => {
  useRoutesStore.setState({
    savedRoutes: [
      {
        key: '31.2,121.5',
        name: 'Main',
        activityIds: [1],
        createdAt: 1,
        referenceActivityId: 1,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
      {
        key: '31.2,121.5#1',
        name: 'Duplicate',
        activityIds: [2],
        createdAt: 2,
        referenceActivityId: 2,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
    ],
  });

  useRoutesStore.getState().mergeRoutes('31.2,121.5', '31.2,121.5#1');

  const routes = useRoutesStore.getState().savedRoutes;
  assert.equal(routes.length, 1);
  assert.equal(routes[0].key, '31.2,121.5');
  assert.deepEqual(routes[0].activityIds, [1, 2]);
});

test('unsaveActivity records a manual exclusion on the source route', () => {
  useRoutesStore.setState({
    savedRoutes: [
      {
        key: '31.2,121.5',
        name: 'Main',
        activityIds: [1, 2],
        createdAt: 1,
        referenceActivityId: 1,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
    ],
  });

  useRoutesStore.getState().unsaveActivity(2);

  const routes = useRoutesStore.getState().savedRoutes;
  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].activityIds, [1]);
  assert.deepEqual(routes[0].excludedActivityIds, [2]);
});

test('splitActivityToRoute excludes the activity from the source and creates a new version', () => {
  const first = makeActivity(1, baseRoute);
  const second = makeActivity(2, baseRoute);
  useRoutesStore.setState({
    savedRoutes: [
      {
        key: '31.2,121.5',
        name: 'Main',
        activityIds: [1, 2],
        createdAt: 1,
        referenceActivityId: 1,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
    ],
  });

  useRoutesStore.getState().splitActivityToRoute('31.2,121.5', second);

  const routes = useRoutesStore.getState().savedRoutes;
  assert.equal(routes.length, 2);
  const source = routes.find((route) => route.key === '31.2,121.5');
  const split = routes.find((route) => route.key !== '31.2,121.5');
  assert.deepEqual(source.activityIds, [1]);
  assert.deepEqual(source.excludedActivityIds, [2]);
  assert.deepEqual(split.activityIds, [2]);
  assert.deepEqual(split.excludedActivityIds, [1]);
  assert.equal(split.referenceActivityId, 2);
});

test('splitActivityToRoute keeps drifted activities in the source route family', () => {
  const driftedRoute = baseRoute.map(([lat, lng]) => [lat + 0.0006, lng]);
  const first = makeActivity(1, baseRoute);
  const second = makeActivity(2, driftedRoute);
  useRoutesStore.setState({
    savedRoutes: [
      {
        key: '31.2,121.5',
        name: 'Main',
        activityIds: [1, 2],
        createdAt: 1,
        referenceActivityId: 1,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
    ],
  });

  useRoutesStore.getState().splitActivityToRoute('31.2,121.5', second);

  const routes = useRoutesStore.getState().savedRoutes;
  const split = routes.find((route) => route.referenceActivityId === 2);
  assert.equal(split.key, '31.2,121.5#1');
});

test('syncRoutes auto-merges high-confidence duplicate saved routes', () => {
  const driftedRoute = baseRoute.map(([lat, lng]) => [lat + 0.0006, lng]);
  const first = makeActivity(1, baseRoute);
  const second = makeActivity(2, driftedRoute);
  useRoutesStore.setState({
    savedRoutes: [
      {
        key: '31.2,121.5',
        name: 'Main',
        activityIds: [1],
        createdAt: 1,
        referenceActivityId: 1,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
      {
        key: '31.201,121.5',
        name: 'Duplicate',
        activityIds: [2],
        createdAt: 2,
        referenceActivityId: 2,
        polyline: encodePolyline(driftedRoute),
        distance: 5000,
        elevationGain: 30,
      },
    ],
  });

  const stats = useRoutesStore.getState().syncRoutes([first, second], { pruneMissing: true, autoMerge: true });

  const routes = useRoutesStore.getState().savedRoutes;
  assert.equal(routes.length, 1);
  assert.equal(routes[0].key, '31.2,121.5');
  assert.deepEqual(routes[0].activityIds, [1, 2]);
  assert.equal(stats.autoMergedRoutes, 1);
});

test('syncRoutes does not auto-merge duplicate routes unless explicitly requested', () => {
  const driftedRoute = baseRoute.map(([lat, lng]) => [lat + 0.0006, lng]);
  const first = makeActivity(1, baseRoute);
  const second = makeActivity(2, driftedRoute);
  useRoutesStore.setState({
    savedRoutes: [
      {
        key: '31.2,121.5',
        name: 'Main',
        activityIds: [1],
        createdAt: 1,
        referenceActivityId: 1,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
      {
        key: '31.201,121.5',
        name: 'Duplicate',
        activityIds: [2],
        createdAt: 2,
        referenceActivityId: 2,
        polyline: encodePolyline(driftedRoute),
        distance: 5000,
        elevationGain: 30,
      },
    ],
    lastRoutesBackup: null,
  });

  const stats = useRoutesStore.getState().syncRoutes([first, second], { pruneMissing: true });

  const routes = useRoutesStore.getState().savedRoutes;
  assert.equal(routes.length, 2);
  assert.equal(stats.autoMergedRoutes, 0);
});

test('syncRoutes preserves curated route ids even when pruneMissing is requested', () => {
  const first = makeActivity(1, baseRoute);
  useRoutesStore.setState({
    savedRoutes: [
      {
        key: '31.2,121.5',
        name: 'Curated',
        activityIds: [1, 2],
        createdAt: 1,
        referenceActivityId: 1,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
    ],
    lastRoutesBackup: null,
  });

  const stats = useRoutesStore.getState().syncRoutes([first], { pruneMissing: true });

  const routes = useRoutesStore.getState().savedRoutes;
  assert.deepEqual(routes[0].activityIds, [1, 2]);
  assert.equal(stats.matchesRemoved, 0);
});

test('syncRoutes stores a restorable backup before changing routes', () => {
  const first = makeActivity(1, baseRoute);
  const second = makeActivity(2, baseRoute);
  useRoutesStore.setState({
    savedRoutes: [
      {
        key: '31.2,121.5',
        name: 'Curated',
        activityIds: [1],
        createdAt: 1,
        referenceActivityId: 1,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
    ],
    lastRoutesBackup: null,
  });

  useRoutesStore.getState().syncRoutes([first, second]);

  let state = useRoutesStore.getState();
  assert.deepEqual(state.savedRoutes[0].activityIds, [1, 2]);
  assert.deepEqual(state.lastRoutesBackup.savedRoutes[0].activityIds, [1]);

  useRoutesStore.getState().restoreLastRoutesBackup();

  state = useRoutesStore.getState();
  assert.deepEqual(state.savedRoutes[0].activityIds, [1]);
  assert.deepEqual(state.lastRoutesBackup.savedRoutes[0].activityIds, [1, 2]);
});

test('syncRoutes does not auto-merge manually split routes', () => {
  const first = makeActivity(1, baseRoute);
  const second = makeActivity(2, baseRoute);
  useRoutesStore.setState({
    savedRoutes: [
      {
        key: '31.2,121.5',
        name: 'Main',
        activityIds: [1],
        excludedActivityIds: [2],
        createdAt: 1,
        referenceActivityId: 1,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
      {
        key: '31.2,121.5#1',
        name: 'Split',
        activityIds: [2],
        excludedActivityIds: [1],
        createdAt: 2,
        referenceActivityId: 2,
        polyline: encodePolyline(baseRoute),
        distance: 5000,
        elevationGain: 30,
      },
    ],
  });

  const stats = useRoutesStore.getState().syncRoutes([first, second], { pruneMissing: true });

  const routes = useRoutesStore.getState().savedRoutes;
  assert.equal(routes.length, 2);
  assert.deepEqual(routes.find((route) => route.key === '31.2,121.5').activityIds, [1]);
  assert.deepEqual(routes.find((route) => route.key === '31.2,121.5#1').activityIds, [2]);
  assert.equal(stats.autoMergedRoutes, 0);
});
