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

export interface LongRunBlock {
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

export interface LongRunAssessment {
  tier: 'long-run' | 'race-simulation';
  blockSizeKm: 5 | 10;
  blocks: LongRunBlock[];
  pattern: LongRunExecutionPattern;
  earlyPaceSecondsPerKm?: number;
  latePaceSecondsPerKm?: number;
  paceChangeSecondsPerKm?: number;
  earlyHeartRate?: number;
  lateHeartRate?: number;
  heartRateChange?: number;
  paceSpreadSecondsPerKm?: number;
}

/** Complete blocks from consecutive metric splits. A short tail is not
 * compared with full blocks, and missing/irregular splits are not extrapolated. */
export function getLongRunBlocks(
  activity: Pick<StravaActivity, 'distance' | 'splits_metric'>,
  blockSizeMeters: 5_000 | 10_000
): LongRunBlock[] {
  if (activity.distance < 20_000) return [];
  const splits = getValidSplits(activity.splits_metric);
  const splitsPerBlock = blockSizeMeters / 1000;
  const fullBlockCount = Math.floor(activity.distance / blockSizeMeters);
  const blocks: LongRunBlock[] = [];
  for (let blockIndex = 0; blockIndex < fullBlockCount; blockIndex += 1) {
    const window = splits.slice(blockIndex * splitsPerBlock, blockIndex * splitsPerBlock + splitsPerBlock);
    if (window.length !== splitsPerBlock || window.some((split, index) =>
      split.split !== blockIndex * splitsPerBlock + index + 1 ||
      Math.abs(split.distance - 1000) > 25
    )) return [];
    const distanceMeters = window.reduce((sum, split) => sum + split.distance, 0);
    const movingTimeSeconds = window.reduce((sum, split) => sum + split.moving_time, 0);
    const hasHeartRate = window.every((split) => isPositiveFinite(split.average_heartrate));
    blocks.push({
      startKm: blockIndex * splitsPerBlock,
      endKm: (blockIndex + 1) * splitsPerBlock,
      distanceMeters,
      movingTimeSeconds,
      averagePaceSecondsPerKm: movingTimeSeconds / distanceMeters * 1000,
      averageHeartRate: hasHeartRate
        ? window.reduce((sum, split) => sum + (split.average_heartrate ?? 0) * split.moving_time, 0) / movingTimeSeconds
        : undefined,
    });
  }
  return blocks;
}

export function getLongRunTenKilometerBlocks(
  activity: Pick<StravaActivity, 'distance' | 'splits_metric'>
): LongRunBlock[] {
  return getLongRunBlocks(activity, 10_000);
}

function average(values: number[]): number | undefined {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
}

/**
 * Evaluates long-run execution from broad blocks instead of promoting a short
 * fast patch. Runs around 20 km use 5 km blocks; 30 km+ runs use 10 km blocks
 * because they are usually race-specific simulations. A late slowdown only
 * becomes a fatigue fade when heart rate stays high instead of falling with it.
 */
export function getLongRunAssessment(
  activity: Pick<StravaActivity, 'distance' | 'splits_metric'>
): LongRunAssessment | null {
  if (activity.distance < 20_000) return null;

  const raceSimulation = activity.distance >= 30_000;
  const blockSizeMeters = raceSimulation ? 10_000 : 5_000;
  const blocks = getLongRunBlocks(activity, blockSizeMeters);
  const base: LongRunAssessment = {
    tier: raceSimulation ? 'race-simulation' : 'long-run',
    blockSizeKm: raceSimulation ? 10 : 5,
    blocks,
    pattern: 'unknown',
  };
  if (blocks.length < 2) return base;

  const comparisonBlockCount = Math.max(1, Math.floor(blocks.length / 3));
  const earlyBlocks = blocks.slice(0, comparisonBlockCount);
  const lateBlocks = blocks.slice(-comparisonBlockCount);
  const earlyPaceSecondsPerKm = average(earlyBlocks.map((block) => block.averagePaceSecondsPerKm));
  const latePaceSecondsPerKm = average(lateBlocks.map((block) => block.averagePaceSecondsPerKm));
  if (earlyPaceSecondsPerKm === undefined || latePaceSecondsPerKm === undefined) return base;

  const earlyHeartRates = earlyBlocks.map((block) => block.averageHeartRate).filter(isPositiveFinite);
  const lateHeartRates = lateBlocks.map((block) => block.averageHeartRate).filter(isPositiveFinite);
  const earlyHeartRate = earlyHeartRates.length === earlyBlocks.length ? average(earlyHeartRates) : undefined;
  const lateHeartRate = lateHeartRates.length === lateBlocks.length ? average(lateHeartRates) : undefined;
  const paceChangeSecondsPerKm = latePaceSecondsPerKm - earlyPaceSecondsPerKm;
  const heartRateChange = earlyHeartRate !== undefined && lateHeartRate !== undefined
    ? lateHeartRate - earlyHeartRate
    : undefined;
  const paces = blocks.map((block) => block.averagePaceSecondsPerKm);
  const paceSpreadSecondsPerKm = Math.max(...paces) - Math.min(...paces);
  const meaningfulPaceChange = Math.max(12, earlyPaceSecondsPerKm * 0.03);
  const steadySpread = Math.max(15, earlyPaceSecondsPerKm * 0.04);

  let pattern: LongRunExecutionPattern;
  if (paceSpreadSecondsPerKm <= steadySpread && Math.abs(paceChangeSecondsPerKm) < meaningfulPaceChange) {
    pattern = 'steady';
  } else if (paceChangeSecondsPerKm <= -meaningfulPaceChange) {
    pattern = 'negative-split';
  } else if (paceChangeSecondsPerKm >= meaningfulPaceChange) {
    if (heartRateChange === undefined) pattern = 'slowing-unclear';
    else if (heartRateChange <= -5) pattern = 'intentional-slowdown';
    else if (heartRateChange >= -2) pattern = 'fatigue-fade';
    else pattern = 'slowing-unclear';
  } else {
    pattern = 'mixed';
  }

  return {
    ...base,
    pattern,
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
