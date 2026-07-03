import type { StravaActivity } from '@/types';
import { getActivityTimestamp } from '@/lib/dates';

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrainingLoadState = 'insufficient' | 'recover' | 'balanced' | 'building' | 'high';

export interface WeeklyTrainingLoad {
  key: string;
  load: number;
  runs: number;
  distance: number;
  isCurrent: boolean;
}

export interface TrainingLoadSummary {
  current7DayLoad: number;
  previous7DayLoad: number;
  averageWeeklyLoad: number;
  loadRatio: number | null;
  changePercent: number | null;
  state: TrainingLoadState;
  heartRateCoverage: number;
  latestRunDaysAgo: number | null;
  weeks: WeeklyTrainingLoad[];
}

function isRun(activity: StravaActivity): boolean {
  return activity.type === 'Run'
    || activity.type === 'TrailRun'
    || activity.sport_type === 'Run'
    || activity.sport_type === 'TrailRun'
    || activity.sport_type === 'VirtualRun';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFallbackIntensity(activity: StravaActivity): number {
  if (activity.workout_type === 1) return 1.05;
  if (activity.workout_type === 3) return 0.9;
  if (activity.workout_type === 2 || activity.distance >= 16000) return 0.74;
  return 0.66;
}

export function calculateActivityTrainingLoad(activity: StravaActivity, lthr?: number | null): number {
  if (!isRun(activity) || activity.moving_time <= 0) return 0;

  const durationMinutes = activity.moving_time / 60;
  const hasUsableHeartRate = Boolean(
    lthr
    && lthr > 0
    && activity.average_heartrate
    && activity.average_heartrate > 0
  );
  const intensity = hasUsableHeartRate
    ? clamp(activity.average_heartrate! / lthr!, 0.5, 1.18)
    : getFallbackIntensity(activity);

  return Math.max(1, Math.round(durationMinutes * intensity * intensity));
}

function getWeekLabel(now: Date, weeksAgo: number): string {
  if (weeksAgo === 0) return 'current';
  const end = new Date(now);
  end.setDate(end.getDate() - weeksAgo * 7);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

export function calculateTrainingLoadSummary(
  activities: StravaActivity[],
  lthr?: number | null,
  now = new Date()
): TrainingLoadSummary {
  const nowTime = now.getTime();
  const recentRuns = activities
    .filter(isRun)
    .map((activity) => ({
      activity,
      timestamp: getActivityTimestamp(activity),
      load: calculateActivityTrainingLoad(activity, lthr),
    }))
    .filter((item) => item.timestamp <= nowTime && item.timestamp > nowTime - 28 * DAY_MS)
    .sort((a, b) => b.timestamp - a.timestamp);

  const weekBuckets = Array.from({ length: 4 }, (_, index) => ({
    key: getWeekLabel(now, 3 - index),
    load: 0,
    runs: 0,
    distance: 0,
    isCurrent: index === 3,
  }));

  recentRuns.forEach(({ activity, timestamp, load }) => {
    const daysAgo = Math.max(0, (nowTime - timestamp) / DAY_MS);
    const weeksAgo = Math.min(3, Math.floor(daysAgo / 7));
    const bucket = weekBuckets[3 - weeksAgo];
    bucket.load += load;
    bucket.runs += 1;
    bucket.distance += activity.distance;
  });

  weekBuckets.forEach((week) => {
    week.load = Math.round(week.load);
  });

  const current7DayLoad = weekBuckets[3].load;
  const previous7DayLoad = weekBuckets[2].load;
  const baselineWeeks = weekBuckets.slice(0, 3);
  const averageWeeklyLoad = Math.round(
    baselineWeeks.reduce((sum, week) => sum + week.load, 0) / baselineWeeks.length
  );
  const loadRatio = averageWeeklyLoad > 0
    ? Number((current7DayLoad / averageWeeklyLoad).toFixed(2))
    : null;
  const changePercent = previous7DayLoad > 0
    ? Math.round(((current7DayLoad - previous7DayLoad) / previous7DayLoad) * 100)
    : null;
  const latestRunDaysAgo = recentRuns.length > 0
    ? Math.max(0, Math.floor((nowTime - recentRuns[0].timestamp) / DAY_MS))
    : null;
  const heartRateRuns = recentRuns.filter(({ activity }) => activity.average_heartrate && activity.average_heartrate > 0).length;
  const heartRateCoverage = recentRuns.length > 0
    ? Math.round((heartRateRuns / recentRuns.length) * 100)
    : 0;

  let state: TrainingLoadState = 'balanced';
  if (recentRuns.length < 4 || averageWeeklyLoad === 0) {
    state = 'insufficient';
  } else if (loadRatio !== null && loadRatio >= 1.35) {
    state = 'high';
  } else if (loadRatio !== null && loadRatio >= 1.05) {
    state = 'building';
  } else if (loadRatio !== null && loadRatio < 0.65) {
    state = 'recover';
  }

  return {
    current7DayLoad,
    previous7DayLoad,
    averageWeeklyLoad,
    loadRatio,
    changePercent,
    state,
    heartRateCoverage,
    latestRunDaysAgo,
    weeks: weekBuckets,
  };
}
