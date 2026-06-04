import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-authRedirect-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/authRedirect.ts');
const compiledPath = path.join(tempDir, 'authRedirect.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const { getAuthErrorRedirectPath } = require(compiledPath);

test('getAuthErrorRedirectPath encodes callback error values', () => {
  assert.equal(
    getAuthErrorRedirectPath('access_denied&next=/admin'),
    '/?error=access_denied%26next%3D%2Fadmin'
  );
});

test('getAuthErrorRedirectPath falls back for blank and non-string values', () => {
  assert.equal(getAuthErrorRedirectPath('  '), '/?error=auth_failed');
  assert.equal(getAuthErrorRedirectPath(null), '/?error=auth_failed');
});

test('getAuthErrorRedirectPath trims and caps very long values', () => {
  const path = getAuthErrorRedirectPath(` ${'x'.repeat(140)} `);
  assert.equal(path, `/?error=${'x'.repeat(120)}`);
});
