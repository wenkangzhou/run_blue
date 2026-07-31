import type { StravaActivity } from '@/types';
import { getActivityDateParts, getActivityTimestamp } from '@/lib/dates';

export type ActivityMemoryKind = 'same-day' | 'last-year-nearby';

export interface ActivityMemoryMatch {
  activity: StravaActivity;
  kind: ActivityMemoryKind;
  yearsAgo: number;
  dayOffset: number;
}

interface ActivityMemoryOptions {
  maxItems?: number;
  nearbyDayRange?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function calendarDayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function getComparableDay(year: number, month: number, day: number): number {
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(day, lastDayOfMonth);
}

function newestFirst(a: StravaActivity, b: StravaActivity): number {
  return getActivityTimestamp(b) - getActivityTimestamp(a);
}

function getSportFamily(activity: StravaActivity): string | null {
  const sport = activity.type || activity.sport_type || '';
  if (/run/i.test(sport)) return 'run';
  if (/ride|cycling/i.test(sport)) return 'ride';
  if (/walk|hike/i.test(sport)) return 'foot';
  if (/swim/i.test(sport)) return 'swim';
  return sport.toLowerCase() || null;
}

/**
 * Find earlier activities worth resurfacing beside an activity detail.
 * Exact calendar-day memories always win. When none exist, use the closest
 * activity date from the previous year within a small, explicitly labelled
 * window so a nearby run is never presented as the exact same day.
 */
export function findActivityMemories(
  activities: StravaActivity[],
  currentActivity: StravaActivity,
  options: ActivityMemoryOptions = {}
): ActivityMemoryMatch[] {
  const maxItems = Math.max(1, options.maxItems ?? 3);
  const nearbyDayRange = Math.max(0, options.nearbyDayRange ?? 7);
  const current = getActivityDateParts(currentActivity);
  const currentSportFamily = getSportFamily(currentActivity);

  const earlierActivities = activities.filter((candidate) => {
    if (candidate.id === currentActivity.id) return false;
    if (currentSportFamily && getSportFamily(candidate) !== currentSportFamily) return false;
    return getActivityDateParts(candidate).year < current.year;
  });

  const exactMatches = earlierActivities
    .filter((candidate) => {
      const parts = getActivityDateParts(candidate);
      return parts.month === current.month && parts.day === current.day;
    })
    .sort(newestFirst)
    .slice(0, maxItems)
    .map((candidate): ActivityMemoryMatch => ({
      activity: candidate,
      kind: 'same-day',
      yearsAgo: current.year - getActivityDateParts(candidate).year,
      dayOffset: 0,
    }));

  if (exactMatches.length > 0) return exactMatches;

  const targetYear = current.year - 1;
  const targetDay = getComparableDay(targetYear, current.month, current.day);
  const targetDayNumber = calendarDayNumber(targetYear, current.month, targetDay);

  const nearbyCandidates = earlierActivities
    .filter((candidate) => getActivityDateParts(candidate).year === targetYear)
    .map((candidate) => {
      const parts = getActivityDateParts(candidate);
      const dayOffset = calendarDayNumber(parts.year, parts.month, parts.day) - targetDayNumber;
      return { candidate, dayOffset };
    })
    .filter(({ dayOffset }) => Math.abs(dayOffset) <= nearbyDayRange)
    .sort((a, b) => {
      const distance = Math.abs(a.dayOffset) - Math.abs(b.dayOffset);
      if (distance !== 0) return distance;
      if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
      return newestFirst(a.candidate, b.candidate);
    });

  const nearestOffset = nearbyCandidates[0]?.dayOffset;
  if (nearestOffset === undefined) return [];

  return nearbyCandidates
    .filter(({ dayOffset }) => dayOffset === nearestOffset)
    .slice(0, maxItems)
    .map(({ candidate, dayOffset }): ActivityMemoryMatch => ({
      activity: candidate,
      kind: 'last-year-nearby',
      yearsAgo: 1,
      dayOffset,
    }));
}
