import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = path.resolve('src/lib/paceFormat.ts');
const compiledPath = path.join(os.tmpdir(), 'runblue-paceFormat.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const { formatPaceSeconds, getRoundedPaceParts } = require(compiledPath);

test('formatPaceSeconds carries rounded 60 seconds into the next minute', () => {
  assert.equal(formatPaceSeconds(359.5), '6\'00"');
  assert.deepEqual(getRoundedPaceParts(359.5), { minutes: 6, seconds: 0 });
});

test('formatPaceSeconds keeps ordinary pace formatting stable', () => {
  assert.equal(formatPaceSeconds(333), '5\'33"');
  assert.equal(formatPaceSeconds(333.4), '5\'33"');
  assert.equal(formatPaceSeconds(333.5), '5\'34"');
});

test('formatPaceSeconds uses fallback for invalid pace values', () => {
  assert.equal(formatPaceSeconds(0), '--');
  assert.equal(formatPaceSeconds(Number.NaN), '--');
  assert.equal(formatPaceSeconds(-1, "--'--\""), "--'--\"");
});
