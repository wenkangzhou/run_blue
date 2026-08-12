import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-calendar-heatmap-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/calendarHeatmap.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
writeFileSync(path.join(tempDir, 'calendarHeatmap.cjs'), compiled);

const { getCalendarHeatmapLevel } = require(path.join(tempDir, 'calendarHeatmap.cjs'));

test('uses the daily distribution instead of the largest outlier', () => {
  const distribution = [5, 6, 7, 8, 100];

  assert.equal(getCalendarHeatmapLevel(5, distribution), 1);
  assert.equal(getCalendarHeatmapLevel(7, distribution), 3);
  assert.equal(getCalendarHeatmapLevel(100, distribution), 4);
});

test('gives faster pace days stronger color levels', () => {
  const paces = [270, 300, 330, 360];

  assert.equal(getCalendarHeatmapLevel(270, paces, true), 4);
  assert.equal(getCalendarHeatmapLevel(360, paces, true), 1);
});

test('keeps empty days at level zero', () => {
  assert.equal(getCalendarHeatmapLevel(0, [5, 10, 15]), 0);
});
