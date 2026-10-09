import type { ActivitySplit, StravaActivity } from '@/types';

const STANDARD_DISTANCES = [10_000, 5_000, 3_000] as const;
const DISTANCE_TOLERANCE = 0.025;
const MIN_PACE_GAIN_SECONDS = 20;
const MIN_PACE_GAIN_RATIO = 0.08;
const MIN_QUALITY_DISTANCE_RATIO = 0.8;

export interface SustainedEffortHighlight {
  distanceMeters: number;
  startSplit: number;
  endSplit: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  averagePaceSecondsPerKm: number;
  averageHeartRate?: number;
  paceGainVsActivitySeconds: number;
  paceGainVsActivityRatio: number;
  qualityDistanceRatio: number;
  officialBestEffortElapsedSeconds?: number;
  officialBestEffortMovingSeconds?: number;
}

export interface LongRunPhase {
  startKm: number;
  endKm: number;
  distanceMeters: number;
  movingTimeSeconds: number;
  averagePaceSecondsPerKm: number;
  averageHeartRate?: number;
}

export type LongRunExecutionPattern =
  | 'negative-split'
  | 'steady'
  | 'intentional-slowdown'
  | 'fatigue-fade'
  | 'slowing-unclear'
  | 'mixed'
  | 'unknown';

export type LongRunAnalysisMethod =
  | 'whole-run'
  | 'adaptive-phases'
  | 'early-late'
  | 'insufficient';

export interface LongRunAssessment {
  tier: 'long-run' | 'very-long-run';
  analysisMethod: LongRunAnalysisMethod;
  phases: LongRunPhase[];
  pattern: LongRunExecutionPattern;
  analyzedDistanceMeters: number;
  averagePaceSecondsPerKm?: number;
  averageHeartRate?: number;
  comparisonWindowKm?: number;
  earlyPaceSecondsPerKm?: number;
  latePaceSecondsPerKm?: number;
  paceChangeSecondsPerKm?: number;
  earlyHeartRate?: number;
  lateHeartRate?: number;
  heartRateChange?: number;
  paceSpreadSecondsPerKm?: number;
}

function average(values: number[]): number | undefined {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
}

function percentile(values: number[], ratio: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * ratio)];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function getContinuousKilometerSplits(
  activity: Pick<StravaActivity, 'distance' | 'splits_metric'>
): ActivitySplit[] {
  const splits = getValidSplits(activity.splits_metric)
    .filter((split) => split.distance >= 800 && split.distance <= 1_200);
  if (splits.length < 6) return [];
  const hasGap = splits[0]?.split !== 1 || splits.some((split, index) =>
    index > 0 && split.split !== splits[index - 1].split + 1
  );
  const coveredDistance = splits.reduce((sum, split) => sum + split.distance, 0);
  if (hasGap || coveredDistance < activity.distance * 0.95) return [];
  return splits;
}

function getSmoothedPaces(splits: ActivitySplit[]): number[] {
  const paces = splits.map((split) => split.moving_time / split.distance * 1000);
  return paces.map((_, index) => median(paces.slice(
    Math.max(0, index - 1),
    Math.min(paces.length, index + 2)
  )));
}

function buildAdaptiveLongRunPhases(
  splits: ActivitySplit[],
  averagePaceSecondsPerKm: number
): LongRunPhase[] {
  const minPhaseLength = splits.length >= 30 ? 5 : 4;
  if (splits.length < minPhaseLength * 2) return [];

  const paces = getSmoothedPaces(splits);
  const comparisonWidth = Math.min(4, minPhaseLength);
  const meaningfulChange = Math.max(12, averagePaceSecondsPerKm * 0.035);
  const candidates: Array<{ cut: number; score: number }> = [];
  for (let cut = minPhaseLength; cut <= splits.length - minPhaseLength; cut += 1) {
    const left = average(paces.slice(cut - comparisonWidth, cut));
    const right = average(paces.slice(cut, cut + comparisonWidth));
    if (left === undefined || right === undefined) continue;
    const score = Math.abs(right - left);
    if (score >= meaningfulChange) candidates.push({ cut, score });
  }

  const cuts: number[] = [];
  candidates
    .sort((a, b) => b.score - a.score)
    .forEach((candidate) => {
      if (cuts.length >= 3) return;
      if (cuts.every((cut) => Math.abs(cut - candidate.cut) >= minPhaseLength)) {
        cuts.push(candidate.cut);
      }
    });
  cuts.sort((a, b) => a - b);
  if (cuts.length === 0) return [];

  const boundaries = [0, ...cuts, splits.length];
  let distanceCursor = 0;
  return boundaries.slice(0, -1).map((startIndex, phaseIndex) => {
    const endIndex = boundaries[phaseIndex + 1];
    const window = splits.slice(startIndex, endIndex);
    const startKm = distanceCursor / 1000;
    const distanceMeters = window.reduce((sum, split) => sum + split.distance, 0);
    const movingTimeSeconds = window.reduce((sum, split) => sum + split.moving_time, 0);
    const hasHeartRate = window.every((split) => isPositiveFinite(split.average_heartrate));
    distanceCursor += distanceMeters;
    return {
      startKm,
      endKm: distanceCursor / 1000,
      distanceMeters,
      movingTimeSeconds,
      averagePaceSecondsPerKm: movingTimeSeconds / distanceMeters * 1000,
      averageHeartRate: hasHeartRate
        ? window.reduce((sum, split) => sum + (split.average_heartrate ?? 0) * split.moving_time, 0) / movingTimeSeconds
        : undefined,
    };
  });
}

/**
 * Evaluates long-run execution after identifying the workout's own structure.
 * Stable runs are judged as a whole; sustained pace changes create adaptive
 * phases; gradual trends use broad early/late windows. A late slowdown only
 * becomes a fatigue fade when heart rate stays high instead of falling with it.
 */
export function getLongRunAssessment(
  activity: Pick<StravaActivity, 'distance' | 'splits_metric'>
): LongRunAssessment | null {
  if (activity.distance < 20_000) return null;

  const veryLongRun = activity.distance >= 30_000;
  const splits = getContinuousKilometerSplits(activity);
  const base: LongRunAssessment = {
    tier: veryLongRun ? 'very-long-run' : 'long-run',
    analysisMethod: 'insufficient',
    phases: [],
    pattern: 'unknown',
    analyzedDistanceMeters: 0,
  };
  if (splits.length < 6) return base;

  const analyzedDistanceMeters = splits.reduce((sum, split) => sum + split.distance, 0);
  const analyzedTimeSeconds = splits.reduce((sum, split) => sum + split.moving_time, 0);
  const averagePaceSecondsPerKm = analyzedTimeSeconds / analyzedDistanceMeters * 1000;
  const hasHeartRate = splits.every((split) => isPositiveFinite(split.average_heartrate));
  const averageHeartRate = hasHeartRate
    ? splits.reduce((sum, split) => sum + (split.average_heartrate ?? 0) * split.moving_time, 0) / analyzedTimeSeconds
    : undefined;
  const comparisonWindowCount = Math.max(3, Math.min(8, Math.floor(splits.length * 0.2)));
  const earlySplits = splits.slice(0, comparisonWindowCount);
  const lateSplits = splits.slice(-comparisonWindowCount);
  const earlyPaceSecondsPerKm = average(earlySplits.map((split) => split.moving_time / split.distance * 1000));
  const latePaceSecondsPerKm = average(lateSplits.map((split) => split.moving_time / split.distance * 1000));
  if (earlyPaceSecondsPerKm === undefined || latePaceSecondsPerKm === undefined) return base;

  const earlyHeartRates = earlySplits.map((split) => split.average_heartrate).filter(isPositiveFinite);
  const lateHeartRates = lateSplits.map((split) => split.average_heartrate).filter(isPositiveFinite);
  const earlyHeartRate = earlyHeartRates.length === earlySplits.length ? average(earlyHeartRates) : undefined;
  const lateHeartRate = lateHeartRates.length === lateSplits.length ? average(lateHeartRates) : undefined;
  const paceChangeSecondsPerKm = latePaceSecondsPerKm - earlyPaceSecondsPerKm;
  const heartRateChange = earlyHeartRate !== undefined && lateHeartRate !== undefined
    ? lateHeartRate - earlyHeartRate
    : undefined;
  const paces = getSmoothedPaces(splits);
  const pace10 = percentile(paces, 0.1);
  const pace90 = percentile(paces, 0.9);
  const paceSpreadSecondsPerKm = pace10 !== undefined && pace90 !== undefined ? pace90 - pace10 : 0;
  const meaningfulPaceChange = Math.max(12, earlyPaceSecondsPerKm * 0.03);
  const steadySpread = Math.max(15, earlyPaceSecondsPerKm * 0.04);
  const thirdSize = Math.max(2, Math.floor(splits.length / 3));
  const earlyThirdPace = average(paces.slice(0, thirdSize)) ?? earlyPaceSecondsPerKm;
  const middleStart = Math.floor((splits.length - thirdSize) / 2);
  const middleThirdPace = average(paces.slice(middleStart, middleStart + thirdSize)) ?? averagePaceSecondsPerKm;
  const lateThirdPace = average(paces.slice(-thirdSize)) ?? latePaceSecondsPerKm;
  const trendTolerance = meaningfulPaceChange * 0.6;
  const progressesConsistently = middleThirdPace <= earlyThirdPace + trendTolerance
    && lateThirdPace <= middleThirdPace + trendTolerance;
  const fadesConsistently = middleThirdPace >= earlyThirdPace - trendTolerance
    && lateThirdPace >= middleThirdPace - trendTolerance;

  let pattern: LongRunExecutionPattern;
  if (paceSpreadSecondsPerKm <= steadySpread && Math.abs(paceChangeSecondsPerKm) < meaningfulPaceChange) {
    pattern = 'steady';
  } else if (paceChangeSecondsPerKm <= -meaningfulPaceChange && progressesConsistently) {
    pattern = 'negative-split';
  } else if (paceChangeSecondsPerKm >= meaningfulPaceChange && fadesConsistently) {
    if (heartRateChange === undefined) pattern = 'slowing-unclear';
    else if (heartRateChange <= -5) pattern = 'intentional-slowdown';
    else if (heartRateChange >= -2) pattern = 'fatigue-fade';
    else pattern = 'slowing-unclear';
  } else {
    pattern = 'mixed';
  }

  const phases = buildAdaptiveLongRunPhases(splits, averagePaceSecondsPerKm);
  const analysisMethod: LongRunAnalysisMethod = pattern === 'steady'
    ? 'whole-run'
    : phases.length >= 2
      ? 'adaptive-phases'
      : 'early-late';

  return {
    ...base,
    analysisMethod,
    phases,
    pattern,
    analyzedDistanceMeters,
    averagePaceSecondsPerKm,
    averageHeartRate,
    comparisonWindowKm: earlySplits.reduce((sum, split) => sum + split.distance, 0) / 1000,
    earlyPaceSecondsPerKm,
    latePaceSecondsPerKm,
    paceChangeSecondsPerKm,
    earlyHeartRate,
    lateHeartRate,
    heartRateChange,
    paceSpreadSecondsPerKm,
  };
}

export function formatSustainedEffortDistance(distanceMeters: number): string {
  const distanceKm = distanceMeters / 1000;
  const roundedKm = Math.round(distanceKm);
  return Math.abs(distanceKm - roundedKm) <= 0.05
    ? String(roundedKm)
    : distanceKm.toFixed(1);
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getValidSplits(splits: ActivitySplit[] | undefined): ActivitySplit[] {
  return (splits ?? [])
    .filter((split) =>
      isPositiveFinite(split.distance) &&
      isPositiveFinite(split.moving_time) &&
      isPositiveFinite(split.elapsed_time)
    )
    .sort((a, b) => a.split - b.split);
}

function findMatchingBestEffort(
  activity: Pick<StravaActivity, 'best_efforts'>,
  targetDistance: number
) {
  return (activity.best_efforts ?? [])
    .filter((effort) =>
      isPositiveFinite(effort.distance) &&
      isPositiveFinite(effort.elapsed_time) &&
      Math.abs(effort.distance - targetDistance) / targetDistance <= DISTANCE_TOLERANCE
    )
    .sort((a, b) => a.elapsed_time - b.elapsed_time)[0];
}

function buildCandidate(
  activity: Pick<StravaActivity, 'distance' | 'moving_time' | 'best_efforts'>,
  splits: ActivitySplit[],
  targetDistance: number,
  startIndex: number,
  endIndex: number,
  qualityPaceCeilingSecondsPerKm: number
): SustainedEffortHighlight | null {
  const window = splits.slice(startIndex, endIndex + 1);
  const hasMissingSplit = window.some((split, index) =>
    index > 0 && split.split !== window[index - 1].split + 1
  );
  if (hasMissingSplit) return null;

  const distanceMeters = window.reduce((sum, split) => sum + split.distance, 0);
  const distanceError = Math.abs(distanceMeters - targetDistance) / targetDistance;
  if (distanceError > DISTANCE_TOLERANCE) return null;

  const movingTimeSeconds = window.reduce((sum, split) => sum + split.moving_time, 0);
  const elapsedTimeSeconds = window.reduce((sum, split) => sum + split.elapsed_time, 0);
  const averagePaceSecondsPerKm = movingTimeSeconds / distanceMeters * 1000;
  if (averagePaceSecondsPerKm > qualityPaceCeilingSecondsPerKm) return null;

  const qualityDistanceMeters = window.reduce((sum, split) => {
    const splitPaceSecondsPerKm = split.moving_time / split.distance * 1000;
    return splitPaceSecondsPerKm <= qualityPaceCeilingSecondsPerKm
      ? sum + split.distance
      : sum;
  }, 0);
  const qualityDistanceRatio = qualityDistanceMeters / distanceMeters;
  if (qualityDistanceRatio < MIN_QUALITY_DISTANCE_RATIO) return null;

  const activityPaceSecondsPerKm = activity.moving_time / activity.distance * 1000;
  const paceGainVsActivitySeconds = activityPaceSecondsPerKm - averagePaceSecondsPerKm;
  const paceGainVsActivityRatio = paceGainVsActivitySeconds / activityPaceSecondsPerKm;

  if (
    paceGainVsActivitySeconds < MIN_PACE_GAIN_SECONDS ||
    paceGainVsActivityRatio < MIN_PACE_GAIN_RATIO
  ) {
    return null;
  }

  const heartRateSamples = window
    .map((split) => split.average_heartrate)
    .filter(isPositiveFinite);
  const officialBestEffort = findMatchingBestEffort(activity, targetDistance);

  return {
    distanceMeters,
    startSplit: window[0].split,
    endSplit: window[window.length - 1].split,
    movingTimeSeconds,
    elapsedTimeSeconds,
    averagePaceSecondsPerKm,
    averageHeartRate: heartRateSamples.length === window.length
      ? heartRateSamples.reduce((sum, heartRate) => sum + heartRate, 0) / heartRateSamples.length
      : undefined,
    paceGainVsActivitySeconds,
    paceGainVsActivityRatio,
    qualityDistanceRatio,
    officialBestEffortElapsedSeconds: officialBestEffort?.elapsed_time,
    officialBestEffortMovingSeconds: officialBestEffort?.moving_time,
  };
}

/**
 * Finds the longest clearly faster continuous 3K/5K/10K block that also
 * reaches the athlete's marathon zone or faster. At least 80% of the block's
 * distance must independently reach that ceiling, so isolated surges cannot
 * pull an otherwise easy block's average into the quality range.
 */
export function getKeySustainedEffort(
  activity: Pick<StravaActivity, 'distance' | 'moving_time' | 'splits_metric' | 'best_efforts'>,
  qualityPaceCeilingSecondsPerKm?: number | null
): SustainedEffortHighlight | null {
  const qualityPaceCeiling = qualityPaceCeilingSecondsPerKm ?? undefined;
  if (
    !isPositiveFinite(activity.distance) ||
    !isPositiveFinite(activity.moving_time) ||
    !isPositiveFinite(qualityPaceCeiling)
  ) return null;

  const splits = getValidSplits(activity.splits_metric);
  if (splits.length < 3) return null;

  const candidates: SustainedEffortHighlight[] = [];
  for (const targetDistance of STANDARD_DISTANCES) {
    // A small fast patch should not become the headline of a long session.
    if (targetDistance > activity.distance * 0.9 || targetDistance < activity.distance * 0.25) continue;
    if (activity.distance >= 25_000) continue;

    for (let startIndex = 0; startIndex < splits.length; startIndex += 1) {
      let accumulatedDistance = 0;
      for (let endIndex = startIndex; endIndex < splits.length; endIndex += 1) {
        accumulatedDistance += splits[endIndex].distance;
        if (accumulatedDistance > targetDistance * (1 + DISTANCE_TOLERANCE)) break;
        if (accumulatedDistance < targetDistance * (1 - DISTANCE_TOLERANCE)) continue;

        const candidate = buildCandidate(
          activity,
          splits,
          targetDistance,
          startIndex,
          endIndex,
          qualityPaceCeiling
        );
        if (candidate) candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const distanceDifference = b.distanceMeters - a.distanceMeters;
    if (Math.abs(distanceDifference) >= 1_000) return distanceDifference;
    return b.paceGainVsActivityRatio - a.paceGainVsActivityRatio;
  })[0];
}
