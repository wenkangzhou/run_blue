import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-guest-demo-dates-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/guestDemoDates.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
writeFileSync(path.join(tempDir, 'guestDemoDates.cjs'), compiled);

const {
  getGuestDemoDateOffsetDays,
  getGuestPlanCreatedAt,
  shiftGuestDemoDate,
} = require(path.join(tempDir, 'guestDemoDates.cjs'));

test('anchors the newest guest activity to the previous local day', () => {
  const now = new Date('2026-08-12T01:30:00Z');
  const offset = getGuestDemoDateOffsetDays('2026-06-21T06:20:00Z', now);
  const shifted = new Date(shiftGuestDemoDate('2026-06-21T06:20:00Z', offset));

  assert.equal(shifted.getUTCFullYear(), 2026);
  assert.equal(shifted.getUTCMonth(), 7);
  assert.equal(shifted.getUTCDate(), 11);
  assert.equal(shifted.getUTCHours(), 6);
});

test('preserves spacing between guest activities when shifting dates', () => {
  const offset = getGuestDemoDateOffsetDays(
    '2026-06-21T06:20:00Z',
    new Date('2026-08-12T01:30:00Z')
  );
  const newest = new Date(shiftGuestDemoDate('2026-06-21T06:20:00Z', offset));
  const previous = new Date(shiftGuestDemoDate('2026-06-18T19:05:00Z', offset));

  assert.equal((newest.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000), 2.46875);
});

test('keeps the seeded training plan close to the current week', () => {
  const createdAt = getGuestPlanCreatedAt(new Date('2026-08-12T01:30:00Z'));

  assert.equal(createdAt, '2026-07-14T16:00:00.000Z');
});
