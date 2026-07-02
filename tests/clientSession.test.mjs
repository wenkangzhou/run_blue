import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-clientSession-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/clientSession.ts');
const compiledPath = path.join(tempDir, 'clientSession.cjs');
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
  getClientSession,
  invalidateClientSessionCache,
} = require(compiledPath);

const originalFetch = global.fetch;

test.afterEach(() => {
  invalidateClientSessionCache();
  global.fetch = originalFetch;
});

test('deduplicates concurrent session requests', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      ok: true,
      status: 200,
      json: async () => ({ user: { id: '1', name: 'Runner' }, accessToken: 'token' }),
    };
  };

  const [first, second] = await Promise.all([
    getClientSession(),
    getClientSession(),
  ]);

  assert.equal(calls, 1);
  assert.equal(first.accessToken, 'token');
  assert.equal(second.accessToken, 'token');
});

test('uses the short cache unless a real token refresh is requested', async () => {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ user: { id: '1', name: 'Runner' }, accessToken: `token-${urls.length}` }),
    };
  };

  const first = await getClientSession();
  const cached = await getClientSession();
  const refreshed = await getClientSession({ force: true });

  assert.equal(first.accessToken, 'token-1');
  assert.equal(cached.accessToken, 'token-1');
  assert.equal(refreshed.accessToken, 'token-2');
  assert.deepEqual(urls, ['/api/auth/session', '/api/auth/session?refresh=1']);
});
