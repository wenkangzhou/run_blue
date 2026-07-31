import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = path.resolve('src/lib/activityMemories.ts');
const compiledPath = path.join(os.tmpdir(), 'runblue-activity-memories.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/lib/dates') {
    return {
      getActivityDateParts: (activity) => {
        const match = (activity.start_date_local || activity.start_date).match(
          /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/
        );
        return {
          year: Number(match?.[1] ?? 0),
          month: Number(match?.[2] ?? 0),
          day: Number(match?.[3] ?? 0),
          hour: Number(match?.[4] ?? 0),
          minute: Number(match?.[5] ?? 0),
          second: Number(match?.[6] ?? 0),
        };
      },
      getActivityTimestamp: (activity) => {
        const value = activity.start_date_local || activity.start_date;
        return new Date(value.replace(/Z$/, '')).getTime();
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
test.after(() => { Module._load = originalLoad; });

const { findActivityMemories } = require(compiledPath);

function makeActivity(id, localDate, type = 'Run') {
  return {
    id,
    name: `Run ${id}`,
    type,
    start_date: localDate,
    start_date_local: localDate,
  };
}

test('returns exact calendar-day memories from earlier years before nearby runs', () => {
  const current = makeActivity(100, '2026-07-30T06:30:00Z');
  const matches = findActivityMemories([
    current,
    makeActivity(1, '2025-07-29T07:00:00Z'),
    makeActivity(2, '2025-07-30T07:00:00Z'),
    makeActivity(3, '2024-07-30T07:00:00Z'),
    makeActivity(4, '2026-07-30T18:00:00Z'),
  ], current);

  assert.deepEqual(matches.map((match) => match.activity.id), [2, 3]);
  assert.deepEqual(matches.map((match) => match.yearsAgo), [1, 2]);
  assert.ok(matches.every((match) => match.kind === 'same-day' && match.dayOffset === 0));
});

test('falls back to the nearest previous-year date and labels its offset', () => {
  const current = makeActivity(100, '2026-07-30T06:30:00Z');
  const matches = findActivityMemories([
    current,
    makeActivity(1, '2025-07-27T07:00:00Z'),
    makeActivity(2, '2025-08-01T07:00:00Z'),
    makeActivity(3, '2024-07-25T07:00:00Z'),
  ], current);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].activity.id, 2);
  assert.equal(matches[0].kind, 'last-year-nearby');
  assert.equal(matches[0].dayOffset, 2);
});

test('returns all activities from the nearest previous-year date up to the limit', () => {
  const current = makeActivity(100, '2026-07-30T06:30:00Z');
  const matches = findActivityMemories([
    current,
    makeActivity(1, '2025-07-29T07:00:00Z'),
    makeActivity(2, '2025-07-29T18:00:00Z'),
    makeActivity(3, '2025-08-01T07:00:00Z'),
  ], current, { maxItems: 2 });

  assert.deepEqual(matches.map((match) => match.activity.id), [2, 1]);
  assert.ok(matches.every((match) => match.dayOffset === -1));
});

test('handles leap-day fallback without rolling the target into March', () => {
  const current = makeActivity(100, '2024-02-29T06:30:00Z');
  const matches = findActivityMemories([
    current,
    makeActivity(1, '2023-02-28T07:00:00Z'),
    makeActivity(2, '2023-03-01T07:00:00Z'),
  ], current);

  assert.equal(matches[0].activity.id, 1);
  assert.equal(matches[0].dayOffset, 0);
  assert.equal(matches[0].kind, 'last-year-nearby');
});

test('does not surface unrelated dates outside the nearby window', () => {
  const current = makeActivity(100, '2026-07-30T06:30:00Z');
  const matches = findActivityMemories([
    current,
    makeActivity(1, '2025-07-20T07:00:00Z'),
  ], current);

  assert.deepEqual(matches, []);
});

test('keeps running memories separate from other sports on the same day', () => {
  const current = makeActivity(100, '2026-07-30T06:30:00Z');
  const matches = findActivityMemories([
    current,
    makeActivity(1, '2025-07-30T07:00:00Z', 'Ride'),
    makeActivity(2, '2025-07-30T08:00:00Z', 'Run'),
  ], current);

  assert.deepEqual(matches.map((match) => match.activity.id), [2]);
});
