import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-aiAnalysisRefresh-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync(path.resolve('src/lib/aiAnalysisRefresh.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;
writeFileSync(path.join(tempDir, 'aiAnalysisRefresh.js'), compiled);

const { shouldPreserveAnalysisAfterRetry } = require(path.join(tempDir, 'aiAnalysisRefresh.js'));

test('keeps the previous result when a forced Kimi retry falls back locally', () => {
  assert.equal(shouldPreserveAnalysisAfterRetry({
    force: true,
    hasPreviousAnalysis: true,
    consentStatus: 'accepted',
    analysisSource: 'fallback',
    analysisError: 'Kimi request timed out',
  }), true);
});

test('accepts successful refreshes and initial fallback results', () => {
  assert.equal(shouldPreserveAnalysisAfterRetry({
    force: true,
    hasPreviousAnalysis: true,
    consentStatus: 'accepted',
    analysisSource: 'kimi',
  }), false);
  assert.equal(shouldPreserveAnalysisAfterRetry({
    force: false,
    hasPreviousAnalysis: false,
    consentStatus: 'accepted',
    analysisSource: 'fallback',
    analysisError: 'Kimi request timed out',
  }), false);
});
