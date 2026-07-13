import type { ActivitySplit, StravaActivity } from '@/types';

const STANDARD_DISTANCES = [10_000, 5_000, 3_000] as const;
const DISTANCE_TOLERANCE = 0.025;
const MIN_PACE_GAIN_SECONDS = 20;
const MIN_PACE_GAIN_RATIO = 0.08;

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
  officialBestEffortElapsedSeconds?: number;
  officialBestEffortMovingSeconds?: number;
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
  endIndex: number
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
    officialBestEffortElapsedSeconds: officialBestEffort?.elapsed_time,
    officialBestEffortMovingSeconds: officialBestEffort?.moving_time,
  };
}

/**
 * Finds the longest clearly faster continuous 3K/5K/10K block. This captures
 * the main quality segment of mixed workouts without promoting one fast split.
 */
export function getKeySustainedEffort(
  activity: Pick<StravaActivity, 'distance' | 'moving_time' | 'splits_metric' | 'best_efforts'>
): SustainedEffortHighlight | null {
  if (!isPositiveFinite(activity.distance) || !isPositiveFinite(activity.moving_time)) return null;

  const splits = getValidSplits(activity.splits_metric);
  if (splits.length < 3) return null;

  const candidates: SustainedEffortHighlight[] = [];
  for (const targetDistance of STANDARD_DISTANCES) {
    if (targetDistance > activity.distance * 0.9) continue;

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
          endIndex
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
