import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-claudeStravaAnalysis-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync(path.resolve('src/lib/claudeStravaAnalysis.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;
const compiledPath = path.join(tempDir, 'claudeStravaAnalysis.cjs');
writeFileSync(compiledPath, compiled);

const { parseClaudeStructuredAnalysis } = require(compiledPath);

function makeAnalysis() {
  return {
    summary: '一次完成良好的轻松跑。下一次保持低强度即可。',
    intensity: 'easy',
    recoveryHours: 18,
    comparisonToAverage: '与近期轻松跑相近',
    suggestions: ['保持轻松'],
    paceZoneAnalysis: null,
    trainingLoadContext: '负荷适中',
    similarActivitiesInsight: '表现稳定',
    nextWorkoutSuggestion: '轻松跑或休息',
    warnings: [],
  };
}

test('parses Claude structured_output envelope', () => {
  const result = parseClaudeStructuredAnalysis(JSON.stringify({ structured_output: makeAnalysis() }));
  assert.equal(result.intensity, 'easy');
  assert.equal(result.isFallback, false);
  assert.equal(typeof result.generatedAt, 'number');
});

test('rejects Claude error and malformed payloads', () => {
  assert.throws(
    () => parseClaudeStructuredAnalysis(JSON.stringify({ is_error: true, result: 'MCP auth required' })),
    /MCP auth required/
  );
  assert.throws(
    () => parseClaudeStructuredAnalysis(JSON.stringify({ structured_output: { summary: 'missing fields' } })),
    /invalid Strava analysis payload/
  );
});
