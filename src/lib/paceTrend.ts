import { StravaActivity } from '@/types';
import { getActivityDate } from './dates';

export interface PaceTrendResult {
  currentPace: number; // sec/km
  currentPaceStr: string;
  days7Avg: number;
  days7AvgStr: string;
  days7Diff: number; // sec, positive = slower
  days7DiffStr: string;
  days28Avg: number;
  days28AvgStr: string;
  days28Diff: number;
  days28DiffStr: string;
  monthly: MonthlyPace[];
}

export interface MonthlyPace {
  year: number;
  month: number;
  label: string;
  avgPace: number;
  avgPaceStr: string;
  count: number;
  totalDistance: number; // km
}

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

function diffStr(diffSec: number): string {
  const sign = diffSec > 0 ? '▼' : diffSec < 0 ? '▲' : '—';
  const abs = Math.round(Math.abs(diffSec));
  return `${sign} ${abs}s`;
}

/**
 * Calculate pace trend for an activity against recent history.
 * All runs included, no type filtering.
 */
export function calculatePaceTrend(
  allActivities: StravaActivity[],
  targetActivityId: number
): PaceTrendResult | null {
  const target = allActivities.find((a) => a.id === targetActivityId);
  if (!target || !target.distance || !target.moving_time) return null;

  const currentPace = target.moving_time / (target.distance / 1000);
  const targetDate = getActivityDate(target);

  // Filter runs with valid pace
  const validRuns = allActivities.filter(
    (a) => a.distance > 0 && a.moving_time > 0
  );

  // 7-day window
  const days7Ago = new Date(targetDate);
  days7Ago.setDate(days7Ago.getDate() - 7);
  const days7Runs = validRuns.filter((a) => {
    const d = getActivityDate(a);
    return d >= days7Ago && d <= targetDate && a.id !== targetActivityId;
  });

  // 28-day window
  const days28Ago = new Date(targetDate);
  days28Ago.setDate(days28Ago.getDate() - 28);
  const days28Runs = validRuns.filter((a) => {
    const d = getActivityDate(a);
    return d >= days28Ago && d <= targetDate && a.id !== targetActivityId;
  });

  const avgPace = (runs: StravaActivity[]) => {
    if (runs.length === 0) return 0;
    const totalTime = runs.reduce((s, a) => s + a.moving_time, 0);
    const totalDist = runs.reduce((s, a) => s + a.distance, 0);
    return totalDist > 0 ? totalTime / (totalDist / 1000) : 0;
  };

  const days7Avg = avgPace(days7Runs);
  const days28Avg = avgPace(days28Runs);

  // Monthly grouping (all time)
  const monthMap = new Map<string, StravaActivity[]>();
  validRuns.forEach((a) => {
    const d = getActivityDate(a);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(a);
  });

  const monthly: MonthlyPace[] = Array.from(monthMap.entries())
    .map(([key, runs]) => {
      const [year, month] = key.split('-').map(Number);
      const totalTime = runs.reduce((s, a) => s + a.moving_time, 0);
      const totalDist = runs.reduce((s, a) => s + a.distance, 0);
      const avg = totalDist > 0 ? totalTime / (totalDist / 1000) : 0;
      return {
        year,
        month,
        label: `${year}.${String(month + 1).padStart(2, '0')}`,
        avgPace: avg,
        avgPaceStr: fmtPace(avg),
        count: runs.length,
        totalDistance: Math.round(totalDist / 1000),
      };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  return {
    currentPace,
    currentPaceStr: fmtPace(currentPace),
    days7Avg,
    days7AvgStr: fmtPace(days7Avg),
    days7Diff: days7Avg > 0 ? currentPace - days7Avg : 0,
    days7DiffStr: days7Avg > 0 ? diffStr(currentPace - days7Avg) : '—',
    days28Avg,
    days28AvgStr: fmtPace(days28Avg),
    days28Diff: days28Avg > 0 ? currentPace - days28Avg : 0,
    days28DiffStr: days28Avg > 0 ? diffStr(currentPace - days28Avg) : '—',
    monthly,
  };
}
