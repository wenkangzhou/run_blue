import { StravaActivity } from '@/types';
import {
  formatLocalDateKey,
  getActivityDate,
  getActivityYear,
  getISOWeek,
  getISOWeekNumber,
  getISOWeekStart,
} from './dates';

export type PeriodType = 'week' | 'month' | 'year' | 'all';
export type MetricType = 'distance' | 'duration' | 'count' | 'calories' | 'elevation' | 'pace';

export interface ChartDataPoint {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  activities: StravaActivity[];
  isCurrent: boolean;
}

export interface SummaryStats {
  totalDistance: number;      // meters
  avgPeriodValue: number;     // depends on metric
  avgPace: number;            // seconds per km, 0 if no data
  avgHeartRate: number;       // bpm, 0 if no data
  totalElevation: number;     // meters
  totalCalories: number;
  avgPower: number;           // watts, 0 if no data
  activityCount: number;
  totalDuration: number;      // seconds
  avgDuration: number;        // seconds
  hasHeartRateData: boolean;
  hasPowerData: boolean;
  hasCaloriesData: boolean;
}

const METRIC_LABELS: Record<MetricType, { zh: string; en: string; unit: string }> = {
  distance: { zh: '距离', en: 'Distance', unit: 'km' },
  duration: { zh: '时长', en: 'Duration', unit: 'h' },
  count: { zh: '次数', en: 'Count', unit: '' },
  calories: { zh: '卡路里', en: 'Calories', unit: 'kcal' },
  elevation: { zh: '爬升', en: 'Elevation', unit: 'm' },
  pace: { zh: '配速', en: 'Pace', unit: '/km' },
};

export function getMetricLabel(metric: MetricType, locale: string = 'zh'): string {
  return locale.startsWith('zh') ? METRIC_LABELS[metric].zh : METRIC_LABELS[metric].en;
}

export function getMetricUnit(metric: MetricType): string {
  return METRIC_LABELS[metric].unit;
}

export function formatMetricValue(value: number, metric: MetricType): string {
  switch (metric) {
    case 'distance':
      return `${(value / 1000).toFixed(1)}`;
    case 'duration':
      return `${(value / 3600).toFixed(1)}`;
    case 'count':
      return `${Math.round(value)}`;
    case 'calories':
      return `${Math.round(value)}`;
    case 'elevation':
      return `${Math.round(value)}`;
    case 'pace':
      return formatPaceFromSeconds(value);
    default:
      return `${value}`;
  }
}

function formatMetricDisplay(value: number, metric: MetricType): string {
  const num = formatMetricValue(value, metric);
  const unit = getMetricUnit(metric);
  if (metric === 'pace') return `${num}${unit}`;
  return unit ? `${num} ${unit}` : num;
}

function getMaxWeekOfYear(year: number): number {
  const dec28 = new Date(year, 11, 28);
  return getISOWeekNumber(dec28);
}

function isDateInCurrentPeriod(
  date: Date,
  periodType: PeriodType
): boolean {
  const now = new Date();
  switch (periodType) {
    case 'week': {
      const week = getISOWeek(date);
      const nowWeek = getISOWeek(now);
      return week.year === nowWeek.year && week.week === nowWeek.week;
    }
    case 'month': {
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );
    }
    case 'year': {
      return date.getFullYear() === now.getFullYear();
    }
    case 'all': {
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const nowYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      return yearMonth === nowYearMonth;
    }
  }
}

function getMetricValue(activity: StravaActivity, metric: MetricType): number {
  switch (metric) {
    case 'distance':
      return activity.distance;
    case 'duration':
      return activity.moving_time;
    case 'count':
      return 1;
    case 'calories':
      return activity.calories || 0;
    case 'elevation':
      return activity.total_elevation_gain;
    case 'pace':
      return activity.distance > 0 ? activity.moving_time / (activity.distance / 1000) : 0;
    default:
      return 0;
  }
}

export function aggregateActivities(
  activities: StravaActivity[],
  periodType: PeriodType,
  selectedYear: number,
  metric: MetricType,
  locale: string = 'zh'
): ChartDataPoint[] {
  const runs = activities.filter((a) => a.type === 'Run');

  switch (periodType) {
    case 'week': {
      const maxWeek = getMaxWeekOfYear(selectedYear);
      const weekMap = new Map<number, StravaActivity[]>();

      for (let w = 1; w <= maxWeek; w++) {
        weekMap.set(w, []);
      }

      runs.forEach((a) => {
        const date = getActivityDate(a);
        const { year, week } = getISOWeek(date);
        if (year === selectedYear && weekMap.has(week)) {
          weekMap.get(week)!.push(a);
        }
      });

      return Array.from(weekMap.entries()).map(([week, acts]) => {
        const value = metric === 'pace'
          ? (acts.reduce((sum, a) => sum + a.moving_time, 0) / (acts.reduce((sum, a) => sum + a.distance, 0) / 1000) || 0)
          : acts.reduce((sum, a) => sum + getMetricValue(a, metric), 0);
        const weekStart = getISOWeekStart(selectedYear, week);
        return {
          key: `${selectedYear}-W${week}`,
          label: locale.startsWith('zh') ? `${week}周` : `W${week}`,
          value,
          displayValue: formatMetricDisplay(value, metric),
          activities: acts,
          isCurrent: isDateInCurrentPeriod(weekStart, 'week'),
        };
      });
    }

    case 'month': {
      const monthMap = new Map<number, StravaActivity[]>();
      for (let m = 1; m <= 12; m++) {
        monthMap.set(m, []);
      }

      runs.forEach((a) => {
        const date = getActivityDate(a);
        if (date.getFullYear() === selectedYear) {
          const month = date.getMonth() + 1;
          monthMap.get(month)!.push(a);
        }
      });

      return Array.from(monthMap.entries()).map(([month, acts]) => {
        const value = metric === 'pace'
          ? (acts.reduce((sum, a) => sum + a.moving_time, 0) / (acts.reduce((sum, a) => sum + a.distance, 0) / 1000) || 0)
          : acts.reduce((sum, a) => sum + getMetricValue(a, metric), 0);
        const monthDate = new Date(selectedYear, month - 1, 15);
        return {
          key: `${selectedYear}-${String(month).padStart(2, '0')}`,
          label: locale.startsWith('zh') ? `${month}月` : `${month}`,
          value,
          displayValue: formatMetricDisplay(value, metric),
          activities: acts,
          isCurrent: isDateInCurrentPeriod(monthDate, 'month'),
        };
      });
    }

    case 'year': {
      const yearMap = new Map<number, StravaActivity[]>();

      runs.forEach((a) => {
        const year = getActivityYear(a);
        if (!yearMap.has(year)) yearMap.set(year, []);
        yearMap.get(year)!.push(a);
      });

      return Array.from(yearMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([year, acts]) => {
          const value = metric === 'pace'
            ? (acts.reduce((sum, a) => sum + a.moving_time, 0) / (acts.reduce((sum, a) => sum + a.distance, 0) / 1000) || 0)
            : acts.reduce((sum, a) => sum + getMetricValue(a, metric), 0);
          const yearDate = new Date(year, 6, 1);
          return {
            key: `${year}`,
            label: `${year}`,
            value,
            displayValue: formatMetricDisplay(value, metric),
            activities: acts,
            isCurrent: isDateInCurrentPeriod(yearDate, 'year'),
          };
        });
    }

    case 'all': {
      const monthKeyMap = new Map<string, StravaActivity[]>();

      runs.forEach((a) => {
        const date = getActivityDate(a);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthKeyMap.has(key)) monthKeyMap.set(key, []);
        monthKeyMap.get(key)!.push(a);
      });

      return Array.from(monthKeyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, acts]) => {
          const value = metric === 'pace'
            ? (acts.reduce((sum, a) => sum + a.moving_time, 0) / (acts.reduce((sum, a) => sum + a.distance, 0) / 1000) || 0)
            : acts.reduce((sum, a) => sum + getMetricValue(a, metric), 0);
          const [year, month] = key.split('-').map(Number);
          const monthDate = new Date(year, month - 1, 15);
          return {
            key,
            label: locale.startsWith('zh')
              ? `${year}年${month}月`
              : `${month}/${year}`,
            value,
            displayValue: formatMetricDisplay(value, metric),
            activities: acts,
            isCurrent: isDateInCurrentPeriod(monthDate, 'all'),
          };
        });
    }
  }
}

export function getAvailableYears(activities: StravaActivity[]): number[] {
  const years = new Set<number>();
  activities
    .filter((a) => a.type === 'Run')
    .forEach((a) => {
      years.add(getActivityYear(a));
    });
  return Array.from(years).sort();
}

export function calculateSummaryStats(
  chartData: ChartDataPoint[]
): SummaryStats {
  const allActivities = chartData.flatMap((d) => d.activities);

  const totalDistance = allActivities.reduce((sum, a) => sum + a.distance, 0);
  const totalDuration = allActivities.reduce((sum, a) => sum + a.moving_time, 0);
  const activityCount = allActivities.length;

  // Average pace (seconds per km)
  const avgPace =
    totalDistance > 0 ? totalDuration / (totalDistance / 1000) : 0;

  // Weighted average heart rate
  const hrActivities = allActivities.filter(
    (a) => a.has_heartrate && a.average_heartrate
  );
  const avgHeartRate =
    hrActivities.length > 0
      ? hrActivities.reduce(
          (sum, a) => sum + (a.average_heartrate! * a.moving_time),
          0
        ) /
        hrActivities.reduce((sum, a) => sum + a.moving_time, 0)
      : 0;

  // Weighted average power
  const powerActivities = allActivities.filter((a) => a.average_watts);
  const avgPower =
    powerActivities.length > 0
      ? powerActivities.reduce(
          (sum, a) => sum + (a.average_watts! * a.moving_time),
          0
        ) /
        powerActivities.reduce((sum, a) => sum + a.moving_time, 0)
      : 0;

  const totalElevation = allActivities.reduce(
    (sum, a) => sum + a.total_elevation_gain,
    0
  );
  const totalCalories = allActivities.reduce(
    (sum, a) => sum + (a.calories || 0),
    0
  );

  const avgDuration = activityCount > 0 ? totalDuration / activityCount : 0;

  // Average period value: sum of all values / number of periods shown
  const nonEmptyPeriods = chartData.filter((d) => d.activities.length > 0);
  const avgPeriodValue =
    nonEmptyPeriods.length > 0
      ? nonEmptyPeriods.reduce((sum, d) => sum + d.value, 0) /
        nonEmptyPeriods.length
      : 0;

  const hasHeartRateData = hrActivities.length > 0;
  const hasPowerData = powerActivities.length > 0;
  const hasCaloriesData = allActivities.some((a) => a.calories && a.calories > 0);

  return {
    totalDistance,
    avgPeriodValue,
    avgPace,
    avgHeartRate,
    totalElevation,
    totalCalories,
    avgPower,
    activityCount,
    totalDuration,
    avgDuration,
    hasHeartRateData,
    hasPowerData,
    hasCaloriesData,
  };
}

export function formatPaceFromSeconds(secondsPerKm: number): string {
  if (secondsPerKm <= 0) return '--';
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.floor(secondsPerKm % 60);
  return `${min}'${sec.toString().padStart(2, '0')}"`;
}

export interface DailyAggregate {
  date: string; // YYYY-MM-DD
  value: number;
  activities: StravaActivity[];
}

export function getDailyAggregates(
  activities: StravaActivity[],
  year: number,
  metric: MetricType
): DailyAggregate[] {
  const runs = activities.filter((a) => a.type === 'Run');
  const map = new Map<string, { value: number; activities: StravaActivity[] }>();

  runs.forEach((a) => {
    const date = getActivityDate(a);
    if (getActivityYear(a) !== year) return;
    const key = formatLocalDateKey(date);
    const entry = map.get(key) || { value: 0, activities: [] };
    entry.activities.push(a);
    if (metric === 'pace') {
      const totalTime = entry.activities.reduce((sum, act) => sum + act.moving_time, 0);
      const totalDist = entry.activities.reduce((sum, act) => sum + act.distance, 0);
      entry.value = totalDist > 0 ? totalTime / (totalDist / 1000) : 0;
    } else {
      entry.value += getMetricValue(a, metric);
    }
    map.set(key, entry);
  });

  // Generate all days in the year
  const result: DailyAggregate[] = [];
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  for (let d = 0; d < daysInYear; d++) {
    const date = new Date(year, 0, 1 + d);
    const key = formatLocalDateKey(date);
    const entry = map.get(key);
    result.push({
      date: key,
      value: entry?.value || 0,
      activities: entry?.activities || [],
    });
  }
  return result;
}
