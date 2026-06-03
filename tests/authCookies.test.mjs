import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-authCookies-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/authCookies.ts');
const compiledPath = path.join(tempDir, 'authCookies.cjs');
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
  AUTH_COOKIE_NAMES,
  LEGACY_AUTH_COOKIE_NAMES,
  THIRTY_DAYS_SECONDS,
  getAuthCookieOptions,
  getExpiredAuthCookieOptions,
} = require(compiledPath);

test('auth cookie options are scoped to the whole app and HttpOnly', () => {
  const options = getAuthCookieOptions(3600);

  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.path, '/');
  assert.equal(options.maxAge, 3600);
  assert.equal(options.secure, process.env.NODE_ENV === 'production');
});

test('expired auth cookies reuse app-wide scope', () => {
  const options = getExpiredAuthCookieOptions();

  assert.equal(options.maxAge, 0);
  assert.equal(options.path, '/');
  assert.equal(options.expires.getTime(), 0);
});

test('auth cookie name lists include current and legacy session cookies', () => {
  assert.deepEqual(AUTH_COOKIE_NAMES, ['access_token', 'refresh_token', 'user_id']);
  assert.ok(LEGACY_AUTH_COOKIE_NAMES.includes('next-auth.session-token'));
  assert.equal(THIRTY_DAYS_SECONDS, 30 * 24 * 60 * 60);
});
