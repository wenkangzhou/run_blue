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
  AUTH_PROFILE_COOKIE_NAME,
  LEGACY_AUTH_COOKIE_NAMES,
  THIRTY_DAYS_SECONDS,
  getAuthCookieOptions,
  getExpiredAuthCookieOptions,
  parseAuthProfileCookie,
  parseCookieHeader,
  serializeAuthProfileCookie,
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
  assert.deepEqual(AUTH_COOKIE_NAMES, [
    'access_token',
    'refresh_token',
    'user_id',
    'athlete_profile',
  ]);
  assert.equal(AUTH_PROFILE_COOKIE_NAME, 'athlete_profile');
  assert.ok(LEGACY_AUTH_COOKIE_NAMES.includes('next-auth.session-token'));
  assert.equal(THIRTY_DAYS_SECONDS, 30 * 24 * 60 * 60);
});

test('athlete profile cookie round-trips without exposing raw JSON', () => {
  const profile = {
    id: 123,
    firstname: 'Run',
    lastname: 'Blue',
    profile: 'https://example.com/avatar.png',
  };
  const serialized = serializeAuthProfileCookie(profile);

  assert.equal(serialized.includes('Run'), false);
  assert.deepEqual(parseAuthProfileCookie(serialized), profile);
  assert.equal(parseAuthProfileCookie('not-valid-base64'), null);
});

test('parseCookieHeader decodes cookie values and tolerates malformed encoding', () => {
  assert.deepEqual(
    parseCookieHeader('access_token=abc%20123; empty=; bad=%E0%A4%A; refresh_token=a=b=c'),
    {
      access_token: 'abc 123',
      empty: '',
      bad: '%E0%A4%A',
      refresh_token: 'a=b=c',
    }
  );
  assert.deepEqual(parseCookieHeader(''), {});
});
