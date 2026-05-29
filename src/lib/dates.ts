import type { StravaActivity } from '@/types';

/**
 * Strava's start_date_local often keeps a trailing "Z", but the value is
 * already local wall-clock time. Dropping that suffix prevents accidental UTC
 * conversion around day/week/month boundaries.
 */
export function parseStravaLocalDate(dateString: string): Date {
  return new Date(dateString.replace(/Z$/, ''));
}

export function getActivityDate(
  activity: Pick<StravaActivity, 'start_date'> & Partial<Pick<StravaActivity, 'start_date_local'>>
): Date {
  return parseStravaLocalDate(activity.start_date_local || activity.start_date);
}

export function getActivityTimestamp(
  activity: Pick<StravaActivity, 'start_date'> & Partial<Pick<StravaActivity, 'start_date_local'>>
): number {
  const timestamp = getActivityDate(activity).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
