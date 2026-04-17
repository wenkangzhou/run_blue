import type { StravaActivity } from '@/types';

export type WrappedPeriod = 'year' | 'quarter';

export interface WrappedData {
  year: number;
  quarter?: number; // 1-4, only for quarter
  totalDistanceKm: number;
  totalRuns: number;
  totalDurationSec: number;
  longestRunKm: number;
  longestRunDate: string;
  avgPaceSecPerKm: number;
  totalElevationGainM: number;
  favoriteMonth: { month: number; distanceKm: number };
  timeOfDay: {
    morning: number; // 05-11
    afternoon: number; // 11-17
    evening: number; // 17-22
    night: number; // 22-05
  };
  longestStreakDays: number;
  monthlyDistances: { month: number; distanceKm: number }[];
  bestPaceSecPerKm: number;
  bestPaceDate: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function secToPaceSec(distanceM: number, movingTimeSec: number): number {
  if (!distanceM || !movingTimeSec) return 0;
  return movingTimeSec / (distanceM / 1000);
}

export function calculateWrapped(
  activities: StravaActivity[],
  period: WrappedPeriod,
  year: number,
  quarter?: number
): WrappedData | null {
  const runs = activities.filter((a) => {
    if (a.type !== 'Run') return false;
    const date = new Date(a.start_date_local);
    if (date.getFullYear() !== year) return false;
    if (period === 'quarter' && quarter) {
      const m = date.getMonth() + 1;
      const q = Math.ceil(m / 3);
      if (q !== quarter) return false;
    }
    return true;
  });

  if (runs.length === 0) return null;

  let totalDistance = 0;
  let totalDuration = 0;
  let totalElevation = 0;
  let longestRun = 0;
  let longestRunDate = '';
  let bestPace = Infinity;
  let bestPaceDate = '';
  const monthMap = new Map<number, number>();
  const timeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const dateSet = new Set<string>();

  runs.forEach((run) => {
    const distKm = run.distance / 1000;
    totalDistance += distKm;
    totalDuration += run.moving_time;
    totalElevation += run.total_elevation_gain || 0;

    if (distKm > longestRun) {
      longestRun = distKm;
      longestRunDate = formatDate(run.start_date_local);
    }

    const pace = secToPaceSec(run.distance, run.moving_time);
    if (pace > 0 && pace < bestPace) {
      bestPace = pace;
      bestPaceDate = formatDate(run.start_date_local);
    }

    const date = new Date(run.start_date_local);
    const month = date.getMonth() + 1;
    monthMap.set(month, (monthMap.get(month) || 0) + distKm);

    const hour = date.getHours();
    if (hour >= 5 && hour < 11) timeOfDay.morning += distKm;
    else if (hour >= 11 && hour < 17) timeOfDay.afternoon += distKm;
    else if (hour >= 17 && hour < 22) timeOfDay.evening += distKm;
    else timeOfDay.night += distKm;

    const dateKey = run.start_date_local.split('T')[0];
    dateSet.add(dateKey);
  });

  // streak calculation
  const sortedDates = Array.from(dateSet).sort();
  let longestStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  if (sortedDates.length === 0) longestStreak = 0;

  let favoriteMonth = { month: 1, distanceKm: 0 };
  monthMap.forEach((dist, m) => {
    if (dist > favoriteMonth.distanceKm) {
      favoriteMonth = { month: m, distanceKm: dist };
    }
  });

  const monthlyDistances: { month: number; distanceKm: number }[] = [];
  if (period === 'year') {
    for (let m = 1; m <= 12; m++) {
      monthlyDistances.push({ month: m, distanceKm: Math.round((monthMap.get(m) || 0) * 10) / 10 });
    }
  } else if (quarter) {
    const startMonth = (quarter - 1) * 3 + 1;
    for (let m = startMonth; m <= startMonth + 2; m++) {
      monthlyDistances.push({ month: m, distanceKm: Math.round((monthMap.get(m) || 0) * 10) / 10 });
    }
  }

  return {
    year,
    quarter,
    totalDistanceKm: Math.round(totalDistance * 10) / 10,
    totalRuns: runs.length,
    totalDurationSec: totalDuration,
    longestRunKm: Math.round(longestRun * 10) / 10,
    longestRunDate,
    avgPaceSecPerKm: totalDistance > 0 ? Math.round(totalDuration / totalDistance) : 0,
    totalElevationGainM: Math.round(totalElevation),
    favoriteMonth,
    timeOfDay,
    longestStreakDays: longestStreak,
    monthlyDistances,
    bestPaceSecPerKm: bestPace === Infinity ? 0 : Math.round(bestPace),
    bestPaceDate: bestPace === Infinity ? '' : bestPaceDate,
  };
}

export function getAvailableWrappedYears(activities: StravaActivity[]): number[] {
  const years = new Set<number>();
  activities.forEach((a) => {
    if (a.type === 'Run') {
      years.add(new Date(a.start_date_local).getFullYear());
    }
  });
  return Array.from(years).sort((a, b) => b - a);
}
