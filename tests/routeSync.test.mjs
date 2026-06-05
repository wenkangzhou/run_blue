import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-routeSync-test');
mkdirSync(tempDir, { recursive: true });

function compileLibFile(sourceFile, outputFile) {
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

compileLibFile('src/lib/routeClustering.ts', 'routeClustering.js');
compileLibFile('src/lib/routeSync.ts', 'routeSync.js');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/routeClustering') return require(path.join(tempDir, 'routeClustering.js'));
  if (request === '@/types') return {};
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const { rematchSavedRoutes } = require(path.join(tempDir, 'routeSync.js'));

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

const baseRoute = [
  [31.2000, 121.5000],
  [31.2050, 121.5010],
  [31.2100, 121.5020],
  [31.2150, 121.5030],
  [31.2200, 121.5040],
];
const basePolyline = encodePolyline(baseRoute);

function makeActivity(id, points = baseRoute, overrides = {}) {
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

function makeRoute(overrides = {}) {
  return {
    key: '31.2,121.5',
    name: 'Saved Route',
    activityIds: [1, 2],
    createdAt: 1,
    referenceActivityId: 1,
    polyline: basePolyline,
    distance: 5000,
    elevationGain: 30,
    ...overrides,
  };
}

test('rematchSavedRoutes preserves existing matches while history cache is partial', () => {
  const result = rematchSavedRoutes([makeRoute()], [makeActivity(3)]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.routes[0].activityIds, [3, 1, 2]);
  assert.deepEqual(result.stats, {
    scannedActivities: 1,
    routesUpdated: 1,
    matchesAdded: 1,
    matchesRemoved: 0,
    totalMatches: 3,
    skippedRoutes: 0,
  });
});

test('rematchSavedRoutes can prune missing ids when history is complete', () => {
  const result = rematchSavedRoutes([makeRoute()], [makeActivity(3)], { pruneMissing: true });

  assert.equal(result.changed, true);
  assert.deepEqual(result.routes[0].activityIds, [3]);
  assert.equal(result.stats.matchesAdded, 1);
  assert.equal(result.stats.matchesRemoved, 2);
});

test('rematchSavedRoutes reports skipped routes without a usable reference', () => {
  const result = rematchSavedRoutes([
    makeRoute({ referenceActivityId: 999, activityIds: [999], polyline: undefined }),
  ], []);

  assert.equal(result.changed, false);
  assert.equal(result.stats.skippedRoutes, 1);
  assert.equal(result.stats.totalMatches, 1);
});

test('rematchSavedRoutes respects manually excluded activities', () => {
  const result = rematchSavedRoutes([
    makeRoute({ activityIds: [1], excludedActivityIds: [2] }),
  ], [makeActivity(1), makeActivity(2)]);

  assert.equal(result.changed, false);
  assert.deepEqual(result.routes[0].activityIds, [1]);
  assert.equal(result.stats.totalMatches, 1);
});
