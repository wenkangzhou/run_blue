import { StravaActivity } from '@/types';

export type PeriodType = 'week' | 'month' | 'year' | 'all';
export type MetricType = 'distance' | 'duration' | 'count' | 'calories' | 'elevation';

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
    default:
      return `${value}`;
  }
}

function formatMetricDisplay(value: number, metric: MetricType): string {
  const num = formatMetricValue(value, metric);
  const unit = getMetricUnit(metric);
  return unit ? `${num} ${unit}` : num;
}

function getActivityDate(a: StravaActivity): Date {
  // Use start_date_local if available, otherwise start_date
  const dateStr = a.start_date_local || a.start_date;
  return new Date(dateStr);
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((Number(d) - Number(yearStart)) / 86400000 + 1) / 7);
}

function getMaxWeekOfYear(year: number): number {
  const dec28 = new Date(year, 11, 28);
  return getWeekNumber(dec28);
}

function isDateInCurrentPeriod(
  date: Date,
  periodType: PeriodType,
  periodKey: string
): boolean {
  const now = new Date();
  switch (periodType) {
    case 'week': {
      const week = getWeekNumber(date);
      const nowWeek = getWeekNumber(now);
      return date.getFullYear() === now.getFullYear() && week === nowWeek;
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
  const now = new Date();

  switch (periodType) {
    case 'week': {
      const maxWeek = getMaxWeekOfYear(selectedYear);
      const weekMap = new Map<number, StravaActivity[]>();

      for (let w = 1; w <= maxWeek; w++) {
        weekMap.set(w, []);
      }

      runs.forEach((a) => {
        const date = getActivityDate(a);
        const year = date.getFullYear();
        const week = getWeekNumber(date);
        if (year === selectedYear && weekMap.has(week)) {
          weekMap.get(week)!.push(a);
        }
      });

      return Array.from(weekMap.entries()).map(([week, acts]) => {
        const value = acts.reduce((sum, a) => sum + getMetricValue(a, metric), 0);
        // Find a representative date in this week for isCurrent check
        const weekStart = new Date(selectedYear, 0, 1);
        weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
        return {
          key: `${selectedYear}-W${week}`,
          label: locale.startsWith('zh') ? `${week}周` : `W${week}`,
          value,
          displayValue: formatMetricDisplay(value, metric),
          activities: acts,
          isCurrent: isDateInCurrentPeriod(weekStart, 'week', ''),
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
        const value = acts.reduce((sum, a) => sum + getMetricValue(a, metric), 0);
        const monthDate = new Date(selectedYear, month - 1, 15);
        return {
          key: `${selectedYear}-${String(month).padStart(2, '0')}`,
          label: locale.startsWith('zh') ? `${month}月` : `${month}`,
          value,
          displayValue: formatMetricDisplay(value, metric),
          activities: acts,
          isCurrent: isDateInCurrentPeriod(monthDate, 'month', ''),
        };
      });
    }

    case 'year': {
      const yearMap = new Map<number, StravaActivity[]>();

      runs.forEach((a) => {
        const date = getActivityDate(a);
        const year = date.getFullYear();
        if (!yearMap.has(year)) yearMap.set(year, []);
        yearMap.get(year)!.push(a);
      });

      return Array.from(yearMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([year, acts]) => {
          const value = acts.reduce((sum, a) => sum + getMetricValue(a, metric), 0);
          const yearDate = new Date(year, 6, 1);
          return {
            key: `${year}`,
            label: `${year}`,
            value,
            displayValue: formatMetricDisplay(value, metric),
            activities: acts,
            isCurrent: isDateInCurrentPeriod(yearDate, 'year', ''),
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
          const value = acts.reduce((sum, a) => sum + getMetricValue(a, metric), 0);
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
            isCurrent: isDateInCurrentPeriod(monthDate, 'all', key),
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
      years.add(getActivityDate(a).getFullYear());
    });
  return Array.from(years).sort();
}

export function calculateSummaryStats(
  chartData: ChartDataPoint[],
  metric: MetricType
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
