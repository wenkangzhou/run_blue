import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-gearRequest-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/gearRequest.ts');
const compiledPath = path.join(tempDir, 'gearRequest.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const { parseGearIdsRequest } = require(compiledPath);

test('parseGearIdsRequest trims and dedupes valid gear ids', () => {
  assert.deepEqual(parseGearIdsRequest({ gearIds: [' shoe-1 ', 'shoe-2', 'shoe-1', ''] }), {
    gearIds: ['shoe-1', 'shoe-2'],
  });
});

test('parseGearIdsRequest treats missing gear ids as an empty request', () => {
  assert.deepEqual(parseGearIdsRequest({}), { gearIds: [] });
  assert.deepEqual(parseGearIdsRequest({ gearIds: null }), { gearIds: [] });
});

test('parseGearIdsRequest rejects malformed gear id payloads', () => {
  assert.deepEqual(parseGearIdsRequest(null), { error: 'invalid_body' });
  assert.deepEqual(parseGearIdsRequest({ gearIds: 'shoe-1' }), { error: 'invalid_gear_ids' });
  assert.deepEqual(parseGearIdsRequest({ gearIds: ['shoe-1', 42] }), { error: 'invalid_gear_ids' });
  assert.deepEqual(parseGearIdsRequest({ gearIds: ['x'.repeat(129)] }), { error: 'invalid_gear_ids' });
});

test('parseGearIdsRequest caps batch size', () => {
  assert.deepEqual(parseGearIdsRequest({ gearIds: Array.from({ length: 101 }, (_, index) => `shoe-${index}`) }), {
    error: 'too_many_gear_ids',
  });
});
