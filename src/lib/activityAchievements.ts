import type { StravaActivity } from '@/types';

export interface ActivityPersonalRecord {
  name: string;
  distanceMeters: number;
  elapsedTimeSeconds: number;
  rank: 1;
}

export interface ActivityBestEffortSummary {
  name: string;
  distanceMeters: number;
  elapsedTimeSeconds: number;
  movingTimeSeconds?: number;
  rank?: number | null;
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getActivityPersonalRecords(
  activity: Pick<StravaActivity, 'best_efforts'>
): ActivityPersonalRecord[] {
  return (activity.best_efforts ?? [])
    .filter((effort) =>
      effort.pr_rank === 1 &&
      isPositiveFinite(effort.distance) &&
      isPositiveFinite(effort.elapsed_time)
    )
    .map((effort) => ({
      name: effort.name,
      distanceMeters: effort.distance,
      elapsedTimeSeconds: effort.elapsed_time,
      rank: 1 as const,
    }))
    .sort((a, b) => b.distanceMeters - a.distanceMeters);
}

export function getActivityBestEfforts(
  activity: Pick<StravaActivity, 'best_efforts'>
): ActivityBestEffortSummary[] {
  return (activity.best_efforts ?? [])
    .filter((effort) =>
      isPositiveFinite(effort.distance) &&
      isPositiveFinite(effort.elapsed_time)
    )
    .map((effort) => ({
      name: effort.name,
      distanceMeters: effort.distance,
      elapsedTimeSeconds: effort.elapsed_time,
      movingTimeSeconds: isPositiveFinite(effort.moving_time) ? effort.moving_time : undefined,
      rank: effort.pr_rank,
    }))
    .sort((a, b) => b.distanceMeters - a.distanceMeters);
}

export function getPrimaryPersonalRecord(
  activity: Pick<StravaActivity, 'best_efforts'>
): ActivityPersonalRecord | null {
  return getActivityPersonalRecords(activity)[0] ?? null;
}

export function mergePersonalBestTimes(
  ...sources: Array<Record<string, number> | null | undefined>
): Record<string, number> | null {
  const merged: Record<string, number> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [distance, seconds] of Object.entries(source)) {
      if (!isPositiveFinite(seconds)) continue;
      merged[distance] = merged[distance] === undefined
        ? seconds
        : Math.min(merged[distance], seconds);
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}
