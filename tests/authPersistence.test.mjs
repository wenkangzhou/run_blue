import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-authPersistence-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/authPersistence.ts');
const compiledPath = path.join(tempDir, 'authPersistence.cjs');
const source = readFileSync(sourcePath, 'utf8')
  .replace("'@/lib/guestMode'", "'./guestMode'");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);
writeFileSync(
  path.join(tempDir, 'guestMode.js'),
  "exports.GUEST_ACCESS_TOKEN = 'guest-demo-access';\n"
);

const {
  shouldClearAuthStateForSessionError,
  shouldPromptReauthForSessionError,
  stripAuthTokens,
} = require(compiledPath);

const user = {
  id: '42',
  stravaId: 42,
  email: '',
  name: 'Runner',
  image: null,
  accessToken: 'access-secret',
  refreshToken: 'refresh-secret',
  expiresAt: 123456,
};

test('stripAuthTokens removes token fields while preserving the profile shell', () => {
  const sanitized = stripAuthTokens(user);

  assert.notEqual(sanitized, user);
  assert.equal(sanitized.id, user.id);
  assert.equal(sanitized.name, user.name);
  assert.equal(sanitized.accessToken, '');
  assert.equal(sanitized.refreshToken, '');
  assert.equal(sanitized.expiresAt, 0);
});

test('stripAuthTokens handles empty users', () => {
  assert.equal(stripAuthTokens(null), null);
  assert.equal(stripAuthTokens(undefined), null);
});

test('session errors clear stale auth only when the cookie session is gone', () => {
  assert.equal(shouldClearAuthStateForSessionError('no_token'), true);
  assert.equal(shouldClearAuthStateForSessionError('token_expired'), true);
  assert.equal(shouldClearAuthStateForSessionError('rate_limited'), false);
  assert.equal(shouldClearAuthStateForSessionError('strava_error'), false);
  assert.equal(shouldClearAuthStateForSessionError('strava_error', 403), false);
  assert.equal(shouldClearAuthStateForSessionError('strava_error', 500), false);
});

test('only expired tokens ask for explicit re-login', () => {
  assert.equal(shouldPromptReauthForSessionError('token_expired'), true);
  assert.equal(shouldPromptReauthForSessionError('no_token'), false);
  assert.equal(shouldPromptReauthForSessionError('rate_limited'), false);
  assert.equal(shouldPromptReauthForSessionError('strava_error', 403), false);
  assert.equal(shouldPromptReauthForSessionError('strava_error', 500), false);
});
