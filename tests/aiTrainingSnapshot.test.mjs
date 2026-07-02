import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-aiTrainingSnapshot-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/aiTrainingSnapshot.ts', 'utf8');
writeFileSync(path.join(tempDir, 'aiTrainingSnapshot.js'), ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types' || request === '@/lib/trainingAnalysis' || request === '@/lib/aiTypes') return {};
  return originalLoad.call(this, request, parent, isMain);
};
test.after(() => { Module._load = originalLoad; });

const { buildAITrainingSnapshot, getPromptInputsFromSnapshot } = require(path.join(tempDir, 'aiTrainingSnapshot.js'));

function makeProfile() {
  return {
    estimatedPBs: { '1k': 240, '3k': 780, '5k': 1320, '10k': 2800, '21k': 6200, '42k': 13200, reliability: 'high', sources: {} },
    paceZones: {
      easy: { min: 330, max: 380, description: 'easy' },
      marathon: { min: 300, max: 320, description: 'marathon' },
      threshold: { min: 270, max: 285, description: 'threshold' },
      interval: { min: 250, max: 265, description: 'interval' },
      repetition: { min: 235, max: 248, description: 'repetition' },
    },
    patterns: { workoutTypeCounts: { easy: 8 }, trainingDeficiencies: [] },
    recentLoad: Array.from({ length: 8 }, (_, index) => ({ week: `2026-W${index + 1}`, totalDistance: 40000, totalTime: 14000, runs: 4, avgIntensity: 4 })),
    similarStats: null,
    totalRunsAnalyzed: 120,
    physiologyMetrics: {},
    dateRange: { start: '2025-01-01', end: '2026-01-01' },
  };
}

test('AI training snapshot excludes identity, route, device, and raw stream data', () => {
  const activity = {
    id: 19067060784,
    name: 'Secret Riverside Route',
    description: 'Meet Jim at home',
    distance: 7000,
    moving_time: 2400,
    elapsed_time: 2500,
    total_elevation_gain: 35,
    type: 'Run',
    sport_type: 'Run',
    average_temp: 27,
    has_heartrate: true,
    average_heartrate: 142,
    max_heartrate: 168,
    device_name: 'Secret Watch',
    start_latlng: [31.23, 121.47],
    map: { summary_polyline: 'SECRET_POLYLINE' },
    laps: [{ id: 99, name: 'Private lap', start_date: '2026-07-01', lap_index: 1, distance: 1000, moving_time: 330, elapsed_time: 335, average_speed: 3, max_speed: 4, total_elevation_gain: 2 }],
    splits_metric: [{ split: 1, distance: 1000, moving_time: 330, elapsed_time: 335, average_speed: 3, elevation_difference: 2 }],
  };
  const snapshot = buildAITrainingSnapshot({
    activity,
    streams: { latlng: { data: [[31.23, 121.47]] } },
    trainingProfile: makeProfile(),
    classification: { workoutType: 'easy', workoutTypeConfidence: 'high', workoutTypeEvidence: [], intensity: 'easy', paceZone: 'E', paceZoneConfidence: 'high', paceZoneExactMatch: true, paceZoneGapSeconds: 0, isRace: false, raceType: null, structure: {} },
    streamSummary: 'derived summary only',
  });

  const serialized = JSON.stringify(snapshot);
  for (const forbidden of ['19067060784', 'Secret Riverside Route', 'Meet Jim at home', 'Secret Watch', 'SECRET_POLYLINE', '31.23', '121.47', 'Private lap', '2026-W1']) {
    assert.equal(serialized.includes(forbidden), false, `snapshot leaked ${forbidden}`);
  }
  assert.equal(snapshot.profile.recentLoad.length, 4);
  assert.equal(snapshot.hasStreamEvidence, true);

  const promptInputs = getPromptInputsFromSnapshot(snapshot);
  assert.equal(promptInputs.activity.name, undefined);
  assert.equal(promptInputs.activity.description, undefined);
  assert.equal(promptInputs.activity.map, undefined);
  assert.equal(promptInputs.activity.start_latlng, undefined);
  assert.equal(promptInputs.streams.summary.data.length, 0);
});
