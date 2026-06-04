import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { cleanupBrowserStorage, createFakeIndexedDB, installBrowserStorage } from './helpers/browserStorage.mjs';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-aiAnalysisCache-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/aiAnalysisCache.ts');
const compiledPath = path.join(tempDir, 'aiAnalysisCache.cjs');
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
  clearCachedAIAnalysis,
  getCachedAIAnalysis,
  setCachedAIAnalysis,
} = require(compiledPath);

test.afterEach(cleanupBrowserStorage);

const cacheKey = 'ai_analysis_v5_123_hash';
const analysis = {
  data: {
    summary: 'Solid aerobic run',
    intensity: 'moderate',
  },
  cachedAt: 1770000000000,
};

test('AI analysis cache uses localStorage when IndexedDB is unavailable', async () => {
  const localStorage = installBrowserStorage();

  await setCachedAIAnalysis(cacheKey, analysis);

  assert.deepEqual(await getCachedAIAnalysis(cacheKey), analysis);
  assert.equal(localStorage.data.get(cacheKey), JSON.stringify(analysis));

  await clearCachedAIAnalysis(cacheKey);
  assert.equal(await getCachedAIAnalysis(cacheKey), null);
  assert.equal(localStorage.data.has(cacheKey), false);
});

test('AI analysis cache migrates legacy localStorage values into IndexedDB', async () => {
  const fakeIndexedDB = createFakeIndexedDB();
  const localStorage = installBrowserStorage({
    indexedDB: fakeIndexedDB.api,
    local: {
      [cacheKey]: JSON.stringify(analysis),
    },
  });

  const cached = await getCachedAIAnalysis(cacheKey);

  assert.deepEqual(cached, analysis);
  assert.equal(localStorage.data.has(cacheKey), false);

  const indexedStore = fakeIndexedDB.stores.get('analyses');
  assert.deepEqual(indexedStore.get(cacheKey), analysis);

  await clearCachedAIAnalysis(cacheKey);
  assert.equal(indexedStore.has(cacheKey), false);
});

test('AI analysis cache prefers IndexedDB over stale legacy values', async () => {
  const fakeIndexedDB = createFakeIndexedDB();
  installBrowserStorage({
    indexedDB: fakeIndexedDB.api,
    local: {
      [cacheKey]: JSON.stringify({ data: { summary: 'stale' }, cachedAt: 1 }),
    },
  });

  await setCachedAIAnalysis(cacheKey, analysis);

  const indexedStore = fakeIndexedDB.stores.get('analyses');
  assert.deepEqual(indexedStore.get(cacheKey), analysis);
  assert.deepEqual(await getCachedAIAnalysis(cacheKey), analysis);
});
