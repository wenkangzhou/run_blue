import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-segmentBounds-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/segmentBounds.ts');
const compiledPath = path.join(tempDir, 'segmentBounds.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const { normalizeSegmentExploreBounds } = require(compiledPath);

test('normalizeSegmentExploreBounds accepts valid southwest/northeast bounds', () => {
  assert.equal(
    normalizeSegmentExploreBounds('31.10, 121.30, 31.35, 121.60'),
    '31.1,121.3,31.35,121.6'
  );
});

test('normalizeSegmentExploreBounds rejects missing, malformed, and reversed bounds', () => {
  assert.equal(normalizeSegmentExploreBounds(null), null);
  assert.equal(normalizeSegmentExploreBounds('31.10,121.30,31.35'), null);
  assert.equal(normalizeSegmentExploreBounds('31.10,abc,31.35,121.60'), null);
  assert.equal(normalizeSegmentExploreBounds('31.35,121.30,31.10,121.60'), null);
  assert.equal(normalizeSegmentExploreBounds('31.10,121.60,31.35,121.30'), null);
});

test('normalizeSegmentExploreBounds rejects coordinates outside valid ranges', () => {
  assert.equal(normalizeSegmentExploreBounds('-91,121.30,31.35,121.60'), null);
  assert.equal(normalizeSegmentExploreBounds('31.10,-181,31.35,121.60'), null);
  assert.equal(normalizeSegmentExploreBounds('31.10,121.30,91,121.60'), null);
  assert.equal(normalizeSegmentExploreBounds('31.10,121.30,31.35,181'), null);
});
