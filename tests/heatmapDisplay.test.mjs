import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-heatmap-display-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/heatmapDisplay.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
writeFileSync(path.join(tempDir, 'heatmapDisplay.cjs'), compiled);

const {
  getHeatmapClusterCellSizePx,
  getHeatmapDisplayPolicy,
} = require(path.join(tempDir, 'heatmapDisplay.cjs'));

test('keeps route lines out of the overview layer', () => {
  assert.deepEqual(getHeatmapDisplayPolicy(13), {
    mode: 'overview',
    routeLimit: 0,
    repeatedOnly: false,
  });
});

test('limits the pattern and detail route layers', () => {
  assert.deepEqual(getHeatmapDisplayPolicy(14), {
    mode: 'patterns',
    routeLimit: 72,
    repeatedOnly: true,
  });
  assert.deepEqual(getHeatmapDisplayPolicy(16), {
    mode: 'details',
    routeLimit: 180,
    repeatedOnly: false,
  });
});

test('uses larger cluster cells before route detail is visible', () => {
  assert.equal(getHeatmapClusterCellSizePx(10), 112);
  assert.equal(getHeatmapClusterCellSizePx(12), 96);
  assert.equal(getHeatmapClusterCellSizePx(13), 108);
});
