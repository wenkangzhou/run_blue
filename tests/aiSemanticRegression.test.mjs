import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { AI_SEMANTIC_REGRESSION_CASES } from './fixtures/aiSemanticRegressionCases.mjs';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-ai-semantic-regression-test');
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

[
  'dates',
  'heartRateZones',
  'trainingZones',
  'weather',
  'trailAnalysis',
  'trainingAnalysis',
  'trainingStressEvidence',
  'trainingStress',
  'activityAchievements',
  'activityHighlights',
  'raceExecution',
  'aiComparison',
  'aiFallbackAnalysis',
].forEach((name) => compileLibFile(`src/lib/${name}.ts`, `${name}.js`));

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types') return {};
  return originalLoad.call(this, request, parent, isMain);
};

test.after(() => {
  Module._load = originalLoad;
});

const {
  calculatePaceZones,
  classifyActivity,
} = require(path.join(tempDir, 'trainingAnalysis.js'));
const { adjustClassificationForTrainingStress } = require(path.join(tempDir, 'trainingStress.js'));
const { getActivityPersonalRecords, getPrimaryPersonalRecord } = require(path.join(tempDir, 'activityAchievements.js'));
const { getKeySustainedEffort, getLongRunAssessment } = require(path.join(tempDir, 'activityHighlights.js'));
const { getRaceExecutionAssessment } = require(path.join(tempDir, 'raceExecution.js'));
const { generateFallbackAnalysis } = require(path.join(tempDir, 'aiFallbackAnalysis.js'));

function makeProfile() {
  return {
    totalRunsAnalyzed: 1000,
    estimatedPBs: { '5k': 1260, '10k': 2578, '21k': 5743, '42k': 12711 },
    paceZones: calculatePaceZones(1260),
    patterns: {
      typicalEasyRunDistance: 8000,
      typicalLongRunDistance: 20000,
      typicalWeekDistance: 50000,
      avgRunsPerWeek: 5,
      hasIntervalWorkouts: true,
      hasTempoWorkouts: true,
      hasLongRuns: true,
      hasRaceActivities: true,
      workoutTypeCounts: {},
      trainingDeficiencies: [],
    },
    physiologyMetrics: {},
    recentLoad: [
      { week: 'w1', totalDistance: 50000, totalTime: 0, runs: 5, avgIntensity: 5 },
      { week: 'w2', totalDistance: 50000, totalTime: 0, runs: 5, avgIntensity: 5 },
      { week: 'w3', totalDistance: 50000, totalTime: 0, runs: 5, avgIntensity: 5 },
      { week: 'w4', totalDistance: 50000, totalTime: 0, runs: 5, avgIntensity: 5 },
    ],
    thermalStats: null,
    similarStats: null,
    dateRange: { start: '2025-01-01', end: '2026-01-01' },
  };
}

function makeTrainingLoadContext(load) {
  if (!load) return undefined;
  return {
    activityLoad: load.activityLoad,
    maxHeartRate: 182,
    summary: {
      current7DayLoad: load.current7DayLoad,
      previous7DayLoad: load.previous7DayLoad,
      averageWeeklyLoad: load.averageWeeklyLoad,
      loadRatio: load.loadRatio,
      changePercent: load.changePercent,
      state: load.state,
      changeReliability: load.changeReliability,
      heartRateCoverage: 100,
      latestRunDaysAgo: 0,
      consecutiveRunDays: load.consecutiveRunDays,
      weeks: [],
    },
  };
}

function assertPatterns(text, patterns = [], message) {
  for (const pattern of patterns) assert.match(text, pattern, message);
}

function assertExcludedPatterns(text, patterns = [], message) {
  for (const pattern of patterns) assert.doesNotMatch(text, pattern, message);
}

for (const regressionCase of AI_SEMANTIC_REGRESSION_CASES) {
  test(`${regressionCase.id}: ${regressionCase.title}`, () => {
    const profile = makeProfile();
    const baseClassification = classifyActivity(
      regressionCase.activity,
      profile.paceZones,
      'medium',
      176
    );
    const classification = adjustClassificationForTrainingStress(
      regressionCase.activity,
      profile,
      baseClassification,
      makeTrainingLoadContext(regressionCase.trainingLoad)
    );
    const analysis = generateFallbackAnalysis(
      regressionCase.activity,
      profile,
      classification,
      'zh'
    );
    const expected = regressionCase.expected;
    const label = `activity ${regressionCase.id}`;

    if (expected.workoutType) assert.equal(classification.workoutType, expected.workoutType, label);
    if (expected.intensity) assert.equal(classification.intensity, expected.intensity, label);
    if (expected.alternatingRepCount !== undefined) {
      assert.equal(classification.structure.alternatingRepCount, expected.alternatingRepCount, label);
    }
    if (expected.minimumRecoveryHours !== undefined) {
      assert.equal(classification.loadAdjustment.minimumRecoveryHours, expected.minimumRecoveryHours, label);
    }

    if (expected.keyEffort === null) {
      assert.equal(
        getKeySustainedEffort(regressionCase.activity, profile.paceZones.marathon.max),
        null,
        label
      );
    }
    if (expected.primaryPersonalRecord) {
      assert.equal(getPrimaryPersonalRecord(regressionCase.activity)?.name, expected.primaryPersonalRecord, label);
      assert.equal(getActivityPersonalRecords(regressionCase.activity).length, expected.personalRecordCount, label);
    }
    if (expected.longRunPattern || expected.longRunMethod) {
      const longRun = getLongRunAssessment(regressionCase.activity);
      assert.ok(longRun, label);
      if (expected.longRunPattern) assert.equal(longRun.pattern, expected.longRunPattern, label);
      if (expected.longRunMethod) assert.equal(longRun.analysisMethod, expected.longRunMethod, label);
    }
    if (expected.racePattern || expected.raceQuality) {
      const race = getRaceExecutionAssessment(regressionCase.activity);
      assert.ok(race, label);
      if (expected.racePattern) assert.equal(race.pattern, expected.racePattern, label);
      if (expected.raceQuality) assert.equal(race.quality, expected.raceQuality, label);
    }

    assertPatterns(analysis.summary, expected.summaryIncludes, label);
    assertExcludedPatterns(analysis.summary, expected.summaryExcludes, label);
    assertPatterns(analysis.executionSummary, expected.executionIncludes, label);
    assertExcludedPatterns(analysis.executionSummary, expected.executionExcludes, label);
  });
}
