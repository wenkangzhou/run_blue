import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-trainingAnalysis-test');
mkdirSync(tempDir, { recursive: true });

function compileLibFile(sourceFile, outputFile) {
  const sourcePath = path.resolve(sourceFile);
  const source = readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  writeFileSync(path.join(tempDir, outputFile), compiled);
}

compileLibFile('src/lib/dates.ts', 'dates.js');
compileLibFile('src/lib/heartRateZones.ts', 'heartRateZones.js');
compileLibFile('src/lib/trainingAnalysis.ts', 'trainingAnalysis.js');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types') return {};
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const {
  analyzeTrainingHistory,
  calculatePaceZones,
  classifyActivity,
} = require(path.join(tempDir, 'trainingAnalysis.js'));

function makeLap(index, distance, movingTime, overrides = {}) {
  return {
    id: index + 1,
    lap_index: index,
    name: `Lap ${index + 1}`,
    distance,
    elapsed_time: movingTime,
    moving_time: movingTime,
    start_date: '2026-01-01T00:00:00Z',
    average_speed: distance / movingTime,
    max_speed: distance / movingTime,
    total_elevation_gain: 0,
    ...overrides,
  };
}

function makeSplit(index, paceSecPerKm, overrides = {}) {
  return {
    distance: 1000,
    elapsed_time: paceSecPerKm,
    moving_time: paceSecPerKm,
    elevation_difference: 0,
    split: index + 1,
    average_speed: 1000 / paceSecPerKm,
    ...overrides,
  };
}

function makeActivity(id, overrides = {}) {
  const day = String((id % 20) + 1).padStart(2, '0');
  return {
    id,
    name: `Run ${id}`,
    distance: 8000,
    moving_time: 2400,
    elapsed_time: 2420,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: `2026-01-${day}T00:00:00Z`,
    start_date_local: `2026-01-${day}T08:00:00Z`,
    timezone: '(GMT+08:00) Asia/Shanghai',
    utc_offset: 28800,
    location_city: null,
    location_state: null,
    location_country: null,
    achievement_count: 0,
    kudos_count: 0,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    map: { id: String(id), polyline: null, summary_polyline: null },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: null,
    end_latlng: null,
    average_speed: 3.33,
    max_speed: 5,
    average_temp: 18,
    has_heartrate: true,
    heartrate_opt_out: false,
    display_hide_heartrate_option: false,
    upload_id: id,
    upload_id_str: String(id),
    external_id: null,
    from_accepted_tag: false,
    pr_count: 0,
    total_photo_count: 0,
    has_kudoed: false,
    ...overrides,
  };
}

test('classifyActivity recognizes interval workouts from lap structure', () => {
  const activity = makeActivity(1, {
    name: 'Track session',
    distance: 7600,
    moving_time: 2500,
    laps: [
      makeLap(0, 1600, 520),
      makeLap(1, 400, 88),
      makeLap(2, 200, 80),
      makeLap(3, 400, 87),
      makeLap(4, 200, 82),
      makeLap(5, 400, 89),
      makeLap(6, 200, 81),
      makeLap(7, 1600, 560),
    ],
  });

  const classification = classifyActivity(activity, calculatePaceZones(1200));

  assert.equal(classification.workoutType, 'interval');
  assert.equal(classification.workoutTypeConfidence, 'high');
  assert.equal(classification.structure.lapCount, 8);
  assert.ok(classification.workoutTypeEvidence.some((evidence) => evidence.includes('short reps')));
});

test('classifyActivity recognizes progression runs from splits', () => {
  const activity = makeActivity(2, {
    name: 'Evening run',
    distance: 8000,
    moving_time: 2560,
    splits_metric: [
      makeSplit(0, 360),
      makeSplit(1, 350),
      makeSplit(2, 340),
      makeSplit(3, 330),
      makeSplit(4, 320),
      makeSplit(5, 315),
      makeSplit(6, 310),
      makeSplit(7, 305),
    ],
  });

  const classification = classifyActivity(activity, calculatePaceZones(1200));

  assert.equal(classification.workoutType, 'progression');
  assert.equal(classification.structure.splitPattern, 'progression');
});

test('classifyActivity does not snap low-confidence pace models into threshold', () => {
  const activity = makeActivity(21, {
    name: 'Morning steady run',
    distance: 6740,
    moving_time: 2396,
    average_heartrate: 133,
    splits_metric: [
      makeSplit(0, 335),
      makeSplit(1, 356),
      makeSplit(2, 366),
      makeSplit(3, 364),
      makeSplit(4, 364),
      makeSplit(5, 356),
      makeSplit(6, 341),
    ],
  });

  const classification = classifyActivity(activity, calculatePaceZones(1790), 'low');

  // Low reliability still gets a zone (continuous zones), but confidence is low
  assert.equal(classification.paceZone, 'M');
  assert.equal(classification.paceZoneConfidence, 'low');
  // Marathon-zone pace without clear structure maps to tempo
  assert.equal(classification.workoutType, 'tempo');
  assert.equal(classification.workoutTypeConfidence, 'low');
});

test('classifyActivity uses LTHR to downgrade steady low-HR runs from tempo guesses', () => {
  const activity = makeActivity(22, {
    name: 'Morning steady run',
    distance: 6740,
    moving_time: 2396,
    average_heartrate: 133,
    max_heartrate: 151,
    splits_metric: [
      makeSplit(0, 335),
      makeSplit(1, 356),
      makeSplit(2, 366),
      makeSplit(3, 364),
      makeSplit(4, 364),
      makeSplit(5, 356),
      makeSplit(6, 341),
    ],
  });

  const classification = classifyActivity(activity, calculatePaceZones(1700), 'medium', 176);

  assert.equal(classification.workoutType, 'recovery');
  assert.equal(classification.intensity, 'easy');
  assert.ok(
    classification.workoutTypeEvidence.some((evidence) =>
      evidence.includes('average HR stayed in low aerobic zone')
    )
  );
});

test('classifyActivity keeps longer low-HR aerobic volume as easy rather than recovery', () => {
  const activity = makeActivity(24, {
    name: 'Aerobic volume',
    distance: 10800,
    moving_time: 3920,
    average_heartrate: 138,
    max_heartrate: 154,
    splits_metric: [
      makeSplit(0, 362),
      makeSplit(1, 364),
      makeSplit(2, 365),
      makeSplit(3, 361),
      makeSplit(4, 363),
      makeSplit(5, 364),
      makeSplit(6, 365),
      makeSplit(7, 361),
      makeSplit(8, 363),
      makeSplit(9, 364),
      makeSplit(10, 361),
    ],
  });

  const classification = classifyActivity(activity, calculatePaceZones(1700), 'medium', 176);

  assert.equal(classification.workoutType, 'easy');
  assert.ok(
    classification.workoutTypeEvidence.some((evidence) =>
      evidence.includes('aerobic volume with low heart-rate cost')
    )
  );
});

test('classifyActivity uses LTHR to rescue threshold detection when pace model is conservative', () => {
  const activity = makeActivity(23, {
    name: 'Evening run',
    distance: 8000,
    moving_time: 2640,
    average_heartrate: 169,
    max_heartrate: 177,
    splits_metric: [
      makeSplit(0, 333),
      makeSplit(1, 331),
      makeSplit(2, 329),
      makeSplit(3, 332),
      makeSplit(4, 330),
      makeSplit(5, 331),
      makeSplit(6, 329),
      makeSplit(7, 326),
    ],
  });

  const classification = classifyActivity(activity, calculatePaceZones(1550), 'medium', 176);

  assert.equal(classification.workoutType, 'threshold');
  assert.equal(classification.intensity, 'hard');
  assert.ok(
    classification.workoutTypeEvidence.some((evidence) =>
      evidence.includes('average HR sits in threshold zone')
    )
  );
});

test('analyzeTrainingHistory keeps easy runs separate from tempo runs when building comparisons', () => {
  const currentEasy = makeActivity(10, {
    name: 'Current easy',
    distance: 8000,
    moving_time: 2500,
    average_heartrate: 142,
  });
  const history = [
    makeActivity(11, {
      name: 'Easy aerobic',
      distance: 8100,
      moving_time: 2520,
      average_heartrate: 140,
    }),
    makeActivity(12, {
      name: 'Tempo session',
      distance: 7900,
      moving_time: 2080,
      average_heartrate: 168,
    }),
    makeActivity(13, {
      name: 'Intervals',
      distance: 7000,
      moving_time: 2300,
      laps: [
        makeLap(0, 1000, 330),
        makeLap(1, 400, 86),
        makeLap(2, 200, 78),
        makeLap(3, 400, 87),
        makeLap(4, 200, 80),
      ],
    }),
  ];

  const profile = analyzeTrainingHistory(history, currentEasy, { '5k': 1200 });

  assert.equal(profile.patterns.hasIntervalWorkouts, true);
  assert.equal(profile.similarStats?.count, 1);
  assert.equal(profile.similarStats?.strictCount, 1);
  assert.equal(profile.similarStats?.comparisonMode, 'strict');
  assert.equal(profile.patterns.workoutTypeCounts.interval, 1);
});

test('analyzeTrainingHistory excludes low-confidence guesses from workout mix counts', () => {
  const current = makeActivity(30, {
    name: 'Steady run',
    distance: 6700,
    moving_time: 2390,
    average_heartrate: 132,
    splits_metric: [
      makeSplit(0, 338),
      makeSplit(1, 355),
      makeSplit(2, 362),
      makeSplit(3, 360),
      makeSplit(4, 359),
      makeSplit(5, 355),
      makeSplit(6, 343),
    ],
  });

  const history = Array.from({ length: 6 }, (_, index) =>
    makeActivity(31 + index, {
      name: `Steady ${index}`,
      distance: 6700 + index * 10,
      moving_time: 2380 + index * 8,
      average_heartrate: 132 + (index % 3),
      splits_metric: [
        makeSplit(0, 338),
        makeSplit(1, 355),
        makeSplit(2, 362),
        makeSplit(3, 360),
        makeSplit(4, 359),
        makeSplit(5, 355),
        makeSplit(6, 343),
      ],
    })
  );

  const profile = analyzeTrainingHistory(history, current, { '5k': 1790 }, 176);

  assert.equal(profile.patterns.workoutTypeCounts.tempo, undefined);
  assert.equal(profile.patterns.workoutTypeCounts.threshold, undefined);
});
