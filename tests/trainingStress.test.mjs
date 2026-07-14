import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-trainingStress-test');
mkdirSync(tempDir, { recursive: true });

function compileLibFile(sourceFile, outputFile) {
  const source = readFileSync(path.resolve(sourceFile), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  writeFileSync(path.join(tempDir, outputFile), compiled);
}

compileLibFile('src/lib/weather.ts', 'weather.js');
compileLibFile('src/lib/trainingStress.ts', 'trainingStress.js');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types') return {};
  if (request === './weather') return require(path.join(tempDir, 'weather.js'));
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const { adjustClassificationForTrainingStress } = require(path.join(tempDir, 'trainingStress.js'));

function makeActivity(paceSeconds, overrides = {}) {
  return {
    id: 1,
    name: 'Summer run',
    distance: 8000,
    moving_time: paceSeconds * 8,
    elapsed_time: paceSeconds * 8,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-07-13T00:00:00Z',
    start_date_local: '2026-07-13T08:00:00Z',
    average_speed: 1000 / paceSeconds,
    max_speed: 4,
    has_heartrate: true,
    weather_context: {
      temperatureC: 30,
      feelsLikeC: 33,
      humidityPercent: 78,
      sources: ['strava'],
      source: 'strava',
      hasWeather: true,
      thermalSeverity: 'heat-stress',
    },
    ...overrides,
  };
}

function makeProfile(recentDistances) {
  return {
    paceZones: {
      easy: { min: 306, max: 355, description: 'easy' },
      marathon: { min: 280, max: 305, description: 'marathon' },
      threshold: { min: 250, max: 279, description: 'threshold' },
      interval: { min: 235, max: 249, description: 'interval' },
      repetition: { min: 210, max: 234, description: 'repetition' },
    },
    recentLoad: recentDistances.map((totalDistance, index) => ({
      week: `w${index}`,
      totalDistance,
      totalTime: 0,
      runs: 4,
      avgIntensity: 5,
    })),
    thermalStats: null,
  };
}

function makeClassification() {
  return {
    isRace: false,
    raceType: null,
    intensity: 'easy',
    paceZone: 'E',
    paceZoneConfidence: 'high',
    paceZoneExactMatch: true,
    paceZoneGapSeconds: 0,
    workoutType: 'recovery',
    workoutTypeConfidence: 'low',
    workoutTypeEvidence: ['easy pace with low aerobic heart rate'],
    structure: {
      source: 'splits',
      lapCount: 0,
      medianLapDistance: 1000,
      shortRepCount: 0,
      fastRepCount: 0,
      recoveryRepCount: 0,
      hasWarmup: false,
      hasCooldown: false,
      splitPattern: 'steady',
      paceVariability: 0.03,
    },
  };
}

function makeTrainingLoadContext(overrides = {}) {
  return {
    activityLoad: 40,
    summary: {
      current7DayLoad: 223,
      previous7DayLoad: 56,
      averageWeeklyLoad: 162,
      loadRatio: 1.38,
      changePercent: 298,
      state: 'high',
      heartRateCoverage: 100,
      latestRunDaysAgo: 0,
      weeks: [],
      ...overrides,
    },
  };
}

test('raises a fast-side easy-zone run to hard when heat stress and acute volume spike combine', () => {
  const adjusted = adjustClassificationForTrainingStress(
    makeActivity(320),
    makeProfile([10000, 10000, 10000, 36900]),
    makeClassification()
  );

  assert.equal(adjusted.intensity, 'hard');
  assert.equal(adjusted.loadAdjustment.applied, true);
  assert.equal(adjusted.loadAdjustment.paceContext, 'upper-easy');
  assert.equal(adjusted.loadAdjustment.recentVolumeChangePercent, 269);
  assert.equal(adjusted.loadAdjustment.minimumRecoveryHours, 48);
});

test('keeps a genuinely relaxed hot-weather pace easy when recent load is stable', () => {
  const adjusted = adjustClassificationForTrainingStress(
    makeActivity(400),
    makeProfile([40000, 40000, 40000, 40000]),
    makeClassification()
  );

  assert.equal(adjusted.intensity, 'easy');
  assert.equal(adjusted.loadAdjustment.applied, false);
  assert.equal(adjusted.loadAdjustment.paceContext, 'relaxed-easy');
  assert.equal(adjusted.loadAdjustment.minimumRecoveryHours, 0);
});

test('raises a faster hot-weather easy-zone run to moderate even before volume becomes excessive', () => {
  const adjusted = adjustClassificationForTrainingStress(
    makeActivity(320),
    makeProfile([40000, 40000, 40000, 42000]),
    makeClassification()
  );

  assert.equal(adjusted.intensity, 'moderate');
  assert.equal(adjusted.loadAdjustment.applied, true);
  assert.equal(adjusted.loadAdjustment.minimumRecoveryHours, 36);
});

test('uses the stats training-load calculation as the primary acute-load signal', () => {
  const adjusted = adjustClassificationForTrainingStress(
    makeActivity(320),
    makeProfile([40000, 40000, 40000, 40000]),
    makeClassification(),
    makeTrainingLoadContext()
  );

  assert.equal(adjusted.intensity, 'hard');
  assert.equal(adjusted.loadAdjustment.activityTrainingLoad, 40);
  assert.equal(adjusted.loadAdjustment.current7DayTrainingLoad, 223);
  assert.equal(adjusted.loadAdjustment.trainingLoadChangePercent, 298);
  assert.equal(adjusted.loadAdjustment.trainingLoadRatio, 1.38);
  assert.equal(adjusted.loadAdjustment.trainingLoadState, 'high');
  assert.equal(adjusted.loadAdjustment.activityTrainingLoadSharePercent, 18);
  assert.equal(adjusted.loadAdjustment.minimumRecoveryHours, 48);
});
