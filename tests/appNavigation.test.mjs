import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = path.resolve('src/lib/appNavigation.ts');
const compiledPath = path.join(os.tmpdir(), 'runblue-app-navigation.cjs');
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
  if (request === '@/lib/navigationState') {
    return {
      readSessionState: () => null,
      writeSessionState: () => {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
test.after(() => { Module._load = originalLoad; });

const { normalizeAppRoute, resolveAppBackTarget } = require(compiledPath);

test('normalizes same-origin routes and preserves filters', () => {
  assert.equal(
    normalizeAppRoute('http://localhost:6364/activities?year=2025&type=Run#week', 'http://localhost:6364'),
    '/activities?year=2025&type=Run'
  );
});

test('rejects external and API routes as return targets', () => {
  assert.equal(normalizeAppRoute('https://strava.com/activities', 'http://localhost:6364'), null);
  assert.equal(normalizeAppRoute('/api/auth/session', 'http://localhost:6364'), null);
});

test('returns the recorded source page for a detail route', () => {
  const now = Date.now();
  assert.equal(resolveAppBackTarget('/activities/123', '/activities', {
    '/activities/123': { source: '/heatmap?year=2025', capturedAt: now },
  }, now), '/heatmap?year=2025');
});

test('does not send detail pages back to the login home or stale sources', () => {
  const now = Date.now();
  assert.equal(resolveAppBackTarget('/activities/123', '/activities', {
    '/activities/123': { source: '/', capturedAt: now },
  }, now), '/activities');
  assert.equal(resolveAppBackTarget('/activities/123', '/activities', {
    '/activities/123': { source: '/routes', capturedAt: now - 1000 * 60 * 60 * 13 },
  }, now), '/activities');
});
