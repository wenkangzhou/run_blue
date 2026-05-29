import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = path.resolve('src/lib/routeClustering.ts');
const compiledPath = path.join(os.tmpdir(), 'runblue-routeClustering.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const {
  areActivitiesSameRoute,
  findActivitiesByRouteKey,
  findRouteActivities,
  getRouteKey,
} = require(compiledPath);

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

test('getRouteKey rounds the start point to roughly 100m precision', () => {
  const activity = makeActivity(1, baseRoute);

  assert.equal(getRouteKey(activity), '31.2,121.5');
});

test('matches the same route with small GPS noise', () => {
  const noisyRoute = baseRoute.map(([lat, lng], index) => [
    lat + index * 0.00001,
    lng - index * 0.00001,
  ]);

  assert.equal(
    areActivitiesSameRoute(
      makeActivity(1, baseRoute),
      makeActivity(2, noisyRoute, { distance: 5050, total_elevation_gain: 32 }),
    ),
    true,
  );
});

test('matches the same route in reverse direction', () => {
  assert.equal(
    areActivitiesSameRoute(
      makeActivity(1, baseRoute),
      makeActivity(2, [...baseRoute].reverse()),
    ),
    true,
  );
});

test('rejects a nearby route with a different path shape', () => {
  const differentShape = [
    [31.2000, 121.5000],
    [31.2000, 121.5300],
    [31.2200, 121.5300],
    [31.2200, 121.5040],
  ];

  assert.equal(
    areActivitiesSameRoute(
      makeActivity(1, baseRoute),
      makeActivity(2, differentShape),
    ),
    false,
  );
});

test('rejects routes with too much distance drift', () => {
  assert.equal(
    areActivitiesSameRoute(
      makeActivity(1, baseRoute, { distance: 5000 }),
      makeActivity(2, baseRoute, { distance: 7000 }),
    ),
    false,
  );
});

test('route lookup helpers use strict keys or flexible reference matching', () => {
  const target = makeActivity(1, baseRoute);
  const same = makeActivity(2, baseRoute);
  const different = makeActivity(3, [
    [32.1000, 121.5000],
    [32.1100, 121.5100],
  ]);
  const all = [target, same, different];

  assert.deepEqual(findRouteActivities(target, all).map((a) => a.id), [2]);
  assert.deepEqual(findActivitiesByRouteKey(getRouteKey(target), all).map((a) => a.id), [1, 2]);
  assert.deepEqual(findActivitiesByRouteKey(getRouteKey(target), all, target).map((a) => a.id), [2]);
});
