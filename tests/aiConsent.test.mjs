import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

function loadConsentModule() {
  const source = readFileSync('src/lib/aiConsent.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports;
}

const { parseAIDataConsent } = loadConsentModule();

test('parseAIDataConsent accepts only explicit stored choices', () => {
  assert.equal(parseAIDataConsent('accepted'), 'accepted');
  assert.equal(parseAIDataConsent('declined'), 'declined');
  assert.equal(parseAIDataConsent(null), 'unknown');
  assert.equal(parseAIDataConsent('yes'), 'unknown');
});
