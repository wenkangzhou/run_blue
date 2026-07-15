import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-heartRateZones-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/heartRateZones.ts', 'utf8');
const compiledPath = path.join(tempDir, 'heartRateZones.cjs');
writeFileSync(compiledPath, ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText);

const {
  getHRZones,
  getLthrHRZones,
  getLthrZoneForHR,
  getZoneForHR,
} = require(compiledPath);

test('matches Strava heart-rate boundaries for a 182 bpm maximum', () => {
  assert.deepEqual(getHRZones(182), {
    z1: { min: 0, max: 118, label: '恢复', shortLabel: 'Z1' },
    z2: { min: 119, max: 147, label: '耐力', shortLabel: 'Z2' },
    z3: { min: 148, max: 162, label: '节奏', shortLabel: 'Z3' },
    z4: { min: 163, max: 177, label: '阈值', shortLabel: 'Z4' },
    z5: { min: 178, max: 999, label: '无氧', shortLabel: 'Z5' },
  });
});

test('assigns every Strava boundary without gaps', () => {
  const expected = [
    [0, 'z1'], [118, 'z1'],
    [119, 'z2'], [147, 'z2'],
    [148, 'z3'], [162, 'z3'],
    [163, 'z4'], [177, 'z4'],
    [178, 'z5'], [182, 'z5'],
  ];

  expected.forEach(([heartRate, zone]) => {
    assert.equal(getZoneForHR(heartRate, 182), zone);
  });
});

test('keeps LTHR zones separate for threshold-specific analysis', () => {
  const zones = getLthrHRZones(170);
  assert.equal(zones.z5.min, 170);
  assert.equal(getLthrZoneForHR(169, 170), 'z4');
  assert.equal(getLthrZoneForHR(170, 170), 'z5');
});
