import type { StravaActivity } from '@/types';

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * Strava's start_date_local often keeps a trailing "Z", but the value is
 * already local wall-clock time. Dropping that suffix prevents accidental UTC
 * conversion around day/week/month boundaries.
 */
export function parseStravaLocalDate(dateString: string): Date {
  const parts = parseStravaLocalDateParts(dateString);
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
}

export function parseStravaLocalDateParts(dateString: string): LocalDateParts {
  const match = dateString.match(LOCAL_DATE_RE);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4] ?? 0),
      minute: Number(match[5] ?? 0),
      second: Number(match[6] ?? 0),
    };
  }

  const date = new Date(dateString.replace(/Z$/, ''));
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
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

export function getActivityDateParts(
  activity: Pick<StravaActivity, 'start_date'> & Partial<Pick<StravaActivity, 'start_date_local'>>
): LocalDateParts {
  return parseStravaLocalDateParts(activity.start_date_local || activity.start_date);
}

export function getActivityDateKey(
  activity: Pick<StravaActivity, 'start_date'> & Partial<Pick<StravaActivity, 'start_date_local'>>
): string {
  const parts = getActivityDateParts(activity);
  return formatLocalDateKeyParts(parts);
}

export function getActivityYear(
  activity: Pick<StravaActivity, 'start_date'> & Partial<Pick<StravaActivity, 'start_date_local'>>
): number {
  return getActivityDateParts(activity).year;
}

export function getActivityMonth(
  activity: Pick<StravaActivity, 'start_date'> & Partial<Pick<StravaActivity, 'start_date_local'>>
): number {
  return getActivityDateParts(activity).month;
}

export function getActivityHour(
  activity: Pick<StravaActivity, 'start_date'> & Partial<Pick<StravaActivity, 'start_date_local'>>
): number {
  return getActivityDateParts(activity).hour;
}

export function formatLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatLocalDateKeyParts(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>): string {
  return [
    parts.year,
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

export function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((Number(d) - Number(yearStart)) / 86400000 + 1) / 7);
  return { year, week };
}

export function getISOWeekNumber(date: Date): number {
  return getISOWeek(date).week;
}

export function getISOWeekStart(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const firstWeekStart = getLocalWeekStart(jan4);
  return addLocalDays(firstWeekStart, (week - 1) * 7);
}

export function getLocalWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

export function addLocalDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
