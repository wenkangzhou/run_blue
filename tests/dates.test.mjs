import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = path.resolve('src/lib/dates.ts');
const compiledPath = path.join(os.tmpdir(), 'runblue-dates.cjs');
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
  formatLocalDateKey,
  getActivityDateKey,
  getActivityHour,
  getISOWeek,
  getISOWeekStart,
  parseStravaLocalDate,
  parseStravaLocalDateParts,
} = require(compiledPath);

test('parses Strava start_date_local as local wall-clock time even with trailing Z', () => {
  const parts = parseStravaLocalDateParts('2026-01-01T23:30:15Z');
  const date = parseStravaLocalDate('2026-01-01T23:30:15Z');

  assert.deepEqual(parts, {
    year: 2026,
    month: 1,
    day: 1,
    hour: 23,
    minute: 30,
    second: 15,
  });
  assert.equal(formatLocalDateKey(date), '2026-01-01');
  assert.equal(date.getHours(), 23);
});

test('uses start_date_local for activity date keys and hour buckets', () => {
  const activity = {
    start_date: '2025-12-31T16:30:00Z',
    start_date_local: '2026-01-01T00:30:00Z',
  };

  assert.equal(getActivityDateKey(activity), '2026-01-01');
  assert.equal(getActivityHour(activity), 0);
});

test('calculates ISO week-year across new year boundaries', () => {
  assert.deepEqual(getISOWeek(new Date(2021, 0, 1)), { year: 2020, week: 53 });
  assert.deepEqual(getISOWeek(new Date(2021, 0, 4)), { year: 2021, week: 1 });
  assert.equal(formatLocalDateKey(getISOWeekStart(2020, 53)), '2020-12-28');
});
