'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { StravaActivity } from '@/types';
import {
  PeriodType,
  MetricType,
  ChartDataPoint,
  aggregateActivities,
  calculateSummaryStats,
  getAvailableYears,
  formatMetricValue,
  getMetricUnit,
  formatPaceFromSeconds,
} from '@/lib/stats';
import { VolumeBarChart } from './charts/VolumeBarChart';
import { ActivityCalendarHeatmap } from './ActivityCalendarHeatmap';
import { formatLocalDateKey, getActivityDate, getActivityTimestamp, getActivityYear } from '@/lib/dates';
import {
  Activity,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Mountain,
  Route,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react';
import { formatDuration } from '@/lib/strava';
import type { LucideIcon } from 'lucide-react';

interface VolumeDashboardProps {
  activities: StravaActivity[];
}

const PERIOD_TYPES: PeriodType[] = ['week', 'month', 'year', 'all'];
const METRIC_OPTIONS: Array<{ value: MetricType; icon: LucideIcon }> = [
  { value: 'distance', icon: Route },
  { value: 'duration', icon: Clock },
  { value: 'count', icon: Footprints },
  { value: 'pace', icon: Timer },
  { value: 'elevation', icon: Mountain },
  { value: 'calories', icon: Flame },
];

function getMetricTone(metric: MetricType) {
  const tones: Record<MetricType, {
    text: string;
    soft: string;
    border: string;
    chart: {
      bar: string;
      barStroke: string;
      currentBar: string;
      currentBarStroke: string;
    };
    calendar: string[];
  }> = {
    distance: {
      text: 'text-blue-600 dark:text-blue-400',
      soft: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-900',
      chart: { bar: '#3b82f6', barStroke: '#2563eb', currentBar: '#f97316', currentBarStroke: '#ea580c' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-blue-200 dark:bg-blue-900/40', 'bg-blue-400 dark:bg-blue-700', 'bg-blue-600 dark:bg-blue-500', 'bg-blue-800 dark:bg-blue-400'],
    },
    duration: {
      text: 'text-emerald-600 dark:text-emerald-400',
      soft: 'bg-emerald-50 dark:bg-emerald-950/30',
      border: 'border-emerald-200 dark:border-emerald-900',
      chart: { bar: '#10b981', barStroke: '#059669', currentBar: '#f97316', currentBarStroke: '#ea580c' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-emerald-200 dark:bg-emerald-900/40', 'bg-emerald-400 dark:bg-emerald-700', 'bg-emerald-600 dark:bg-emerald-500', 'bg-emerald-800 dark:bg-emerald-400'],
    },
    count: {
      text: 'text-violet-600 dark:text-violet-400',
      soft: 'bg-violet-50 dark:bg-violet-950/30',
      border: 'border-violet-200 dark:border-violet-900',
      chart: { bar: '#8b5cf6', barStroke: '#7c3aed', currentBar: '#f97316', currentBarStroke: '#ea580c' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-violet-200 dark:bg-violet-900/40', 'bg-violet-400 dark:bg-violet-700', 'bg-violet-600 dark:bg-violet-500', 'bg-violet-800 dark:bg-violet-400'],
    },
    calories: {
      text: 'text-rose-600 dark:text-rose-400',
      soft: 'bg-rose-50 dark:bg-rose-950/30',
      border: 'border-rose-200 dark:border-rose-900',
      chart: { bar: '#f43f5e', barStroke: '#e11d48', currentBar: '#f97316', currentBarStroke: '#ea580c' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-rose-200 dark:bg-rose-900/40', 'bg-rose-400 dark:bg-rose-700', 'bg-rose-600 dark:bg-rose-500', 'bg-rose-800 dark:bg-rose-400'],
    },
    elevation: {
      text: 'text-amber-600 dark:text-amber-400',
      soft: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-900',
      chart: { bar: '#f59e0b', barStroke: '#d97706', currentBar: '#2563eb', currentBarStroke: '#1d4ed8' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-amber-200 dark:bg-amber-900/40', 'bg-amber-400 dark:bg-amber-700', 'bg-amber-600 dark:bg-amber-500', 'bg-amber-800 dark:bg-amber-400'],
    },
    pace: {
      text: 'text-cyan-600 dark:text-cyan-400',
      soft: 'bg-cyan-50 dark:bg-cyan-950/30',
      border: 'border-cyan-200 dark:border-cyan-900',
      chart: { bar: '#06b6d4', barStroke: '#0891b2', currentBar: '#f97316', currentBarStroke: '#ea580c' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-cyan-200 dark:bg-cyan-900/40', 'bg-cyan-400 dark:bg-cyan-700', 'bg-cyan-600 dark:bg-cyan-500', 'bg-cyan-800 dark:bg-cyan-400'],
    },
  };

  return tones[metric];
}

function getBestPeriod(data: ChartDataPoint[], metric: MetricType) {
  const nonEmpty = data.filter((item) => item.activities.length > 0 && item.value > 0);
  if (nonEmpty.length === 0) return null;
  return nonEmpty.reduce((best, item) => {
    if (metric === 'pace') return item.value < best.value ? item : best;
    return item.value > best.value ? item : best;
  }, nonEmpty[0]);
}

function getRecentTrend(data: ChartDataPoint[], metric: MetricType) {
  const nonEmpty = data.filter((item) => item.activities.length > 0 && item.value > 0);
  if (nonEmpty.length < 2) return null;

  const current = nonEmpty[nonEmpty.length - 1];
  const previous = nonEmpty[nonEmpty.length - 2];
  if (!previous.value) return null;

  if (current.isCurrent) {
    return {
      current,
      previous,
      percent: 0,
      improved: false,
      isCurrentPeriod: true,
    };
  }

  const diff = current.value - previous.value;
  const percent = Math.round(Math.abs(diff / previous.value) * 100);
  if (percent === 0) return null;

  const improved = metric === 'pace' ? diff < 0 : diff > 0;
  return { current, previous, percent, improved, isCurrentPeriod: false };
}

function makeSummary(activities: StravaActivity[]) {
  return calculateSummaryStats([
    {
      key: 'scope',
      label: 'scope',
      value: activities.reduce((sum, activity) => sum + activity.distance, 0),
      displayValue: '',
      activities,
      isCurrent: false,
    },
  ]);
}

function formatCompactDistance(meters: number) {
  if (meters >= 100000) return `${Math.round(meters / 1000)} km`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatActivityDistance(meters: number) {
  return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`;
}

function formatActivityDate(activity: StravaActivity, locale: string) {
  const date = getActivityDate(activity);
  if (locale.startsWith('zh')) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatActivityPace(activity: StravaActivity) {
  return formatPaceFromSeconds(
    activity.distance > 0 ? activity.moving_time / (activity.distance / 1000) : 0
  );
}

function getFastestActivity(activities: StravaActivity[]) {
  const valid = activities.filter((activity) => activity.distance > 0 && activity.moving_time > 0);
  if (valid.length === 0) return null;
  return valid.reduce((fastest, activity) => {
    const activityPace = activity.moving_time / (activity.distance / 1000);
    const fastestPace = fastest.moving_time / (fastest.distance / 1000);
    return activityPace < fastestPace ? activity : fastest;
  }, valid[0]);
}

function getLongestActivity(activities: StravaActivity[]) {
  if (activities.length === 0) return null;
  return activities.reduce((longest, activity) => activity.distance > longest.distance ? activity : longest, activities[0]);
}

function getActivitiesSince(activities: StravaActivity[], days: number, now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return activities.filter((activity) => getActivityTimestamp(activity) >= start.getTime());
}

function getActivitiesBetween(activities: StravaActivity[], start: Date, end: Date) {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return activities.filter((activity) => {
    const time = getActivityTimestamp(activity);
    return time >= startTime && time < endTime;
  });
}

function getYearTimeline(year: number) {
  const now = new Date();
  if (year < now.getFullYear()) {
    return { elapsedPercent: 100, remainingPercent: 0, state: 'past' as const };
  }
  if (year > now.getFullYear()) {
    return { elapsedPercent: 0, remainingPercent: 100, state: 'future' as const };
  }
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const elapsedPercent = Math.max(1, Math.min(100, Math.round(((now.getTime() - start) / (end - start)) * 100)));
  return { elapsedPercent, remainingPercent: Math.max(0, 100 - elapsedPercent), state: 'current' as const };
}

function getTrainingMix(activities: StravaActivity[], t: ReturnType<typeof useTranslation>['t']) {
  const buckets = [
    { key: 'short', label: t('stats.mixShort', '短距离'), color: 'bg-blue-500', min: 0, max: 8000 },
    { key: 'steady', label: t('stats.mixSteady', '有氧'), color: 'bg-emerald-500', min: 8000, max: 16000 },
    { key: 'long', label: t('stats.mixLong', '长距离'), color: 'bg-orange-500', min: 16000, max: Infinity },
  ];
  const total = Math.max(activities.length, 1);
  return buckets.map((bucket) => {
    const count = activities.filter((activity) => activity.distance >= bucket.min && activity.distance < bucket.max).length;
    return {
      ...bucket,
      count,
      percent: Math.round((count / total) * 100),
    };
  });
}

function SummaryTile({
  title,
  value,
  helper,
  icon: Icon,
  tone = 'default',
}: {
  title: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  tone?: 'default' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet';
}) {
  const toneClasses = {
    default: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
    blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
    violet: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
  };

  return (
    <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-3">
      <div className="flex items-start gap-2">
        <div className={`shrink-0 p-1.5 ${toneClasses[tone]}`}>
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400 truncate">
            {title}
          </p>
          <p className="font-mono text-lg font-bold leading-tight truncate">
            {value}
          </p>
          {helper && (
            <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
              {helper}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, action }: { icon: LucideIcon; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={15} className="text-zinc-500 dark:text-zinc-400 shrink-0" />
        <h2 className="font-mono text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 text-right">{value}</span>
    </div>
  );
}

function PeriodInspector({
  period,
  summary,
  metricLabel,
  metricValue,
  activities,
  locale,
}: {
  period: ChartDataPoint | null;
  summary: ReturnType<typeof calculateSummaryStats> | null;
  metricLabel: string;
  metricValue: string;
  activities: StravaActivity[];
  locale: string;
}) {
  const { t } = useTranslation();

  if (!period || !summary) {
    return (
      <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {t('stats.selectPeriodHint', '选择一个有训练记录的周期查看细节')}
        </p>
      </div>
    );
  }

  const longestActivity = getLongestActivity(period.activities);
  const fastestActivity = getFastestActivity(period.activities);
  const highestClimbActivity = period.activities.reduce(
    (highest, activity) => activity.total_elevation_gain > highest.total_elevation_gain ? activity : highest,
    period.activities[0]
  );

  return (
    <aside className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="p-4 border-b-2 border-zinc-200 dark:border-zinc-800">
        <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400 mb-1">
          {t('stats.selectedPeriod', '选中周期')}
        </p>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-mono text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {period.label}
            </h3>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {metricLabel}: <span className="font-bold text-zinc-900 dark:text-zinc-100">{metricValue}</span>
            </p>
          </div>
          <span className="shrink-0 border border-zinc-200 dark:border-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
            {summary.activityCount}{t('stats.runs')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b-2 border-zinc-200 dark:border-zinc-800">
        <div className="p-3 border-r-2 border-zinc-200 dark:border-zinc-800">
          <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.totalDistance')}</p>
          <p className="font-mono text-base font-bold">{formatCompactDistance(summary.totalDistance)}</p>
        </div>
        <div className="p-3">
          <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.avgPace')}</p>
          <p className="font-mono text-base font-bold">{formatPaceFromSeconds(summary.avgPace)}/km</p>
        </div>
        <div className="p-3 border-t-2 border-r-2 border-zinc-200 dark:border-zinc-800">
          <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.totalTime')}</p>
          <p className="font-mono text-base font-bold">{formatDuration(summary.totalDuration)}</p>
        </div>
        <div className="p-3 border-t-2 border-zinc-200 dark:border-zinc-800">
          <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.totalElevation')}</p>
          <p className="font-mono text-base font-bold">{Math.round(summary.totalElevation)} m</p>
        </div>
      </div>

      <div className="p-4 border-b-2 border-zinc-200 dark:border-zinc-800">
        <StatLine label={t('stats.longestInPeriod', '本周期最长')} value={longestActivity ? `${formatActivityDistance(longestActivity.distance)} · ${longestActivity.name}` : '--'} />
        <StatLine label={t('stats.fastestInPeriod', '本周期最快')} value={fastestActivity ? `${formatActivityPace(fastestActivity)}/km · ${fastestActivity.name}` : '--'} />
        <StatLine label={t('stats.climbInPeriod', '最高爬升')} value={highestClimbActivity ? `${Math.round(highestClimbActivity.total_elevation_gain)} m · ${highestClimbActivity.name}` : '--'} />
      </div>

      {activities.length > 0 && (
        <div className="p-4">
          <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400 mb-2">
            {t('stats.recentRuns', '最近训练')}
          </p>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {activities.map((activity) => (
              <Link
                key={activity.id}
                href={`/activities/${activity.id}`}
                className="grid grid-cols-[42px_1fr_14px] items-center gap-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
              >
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                  {formatActivityDate(activity, locale)}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">
                    {activity.name}
                  </span>
                  <span className="block font-mono text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                    {formatActivityDistance(activity.distance)} · {formatActivityPace(activity)}/km
                  </span>
                </span>
                <ChevronRight size={14} className="text-zinc-400" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

export function VolumeDashboard({ activities }: VolumeDashboardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const runs = useMemo(
    () => activities.filter((activity) => activity.type === 'Run' || activity.sport_type === 'Run'),
    [activities]
  );
  const availableYears = useMemo(() => getAvailableYears(activities), [activities]);
  const currentYear = new Date().getFullYear();
  const defaultYear = availableYears.includes(currentYear)
    ? currentYear
    : availableYears[availableYears.length - 1] || currentYear;

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [metric, setMetric] = useState<MetricType>('distance');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);

  useEffect(() => {
    if (availableYears.length === 0) return;
    setSelectedYear((prev) => availableYears.includes(prev) ? prev : defaultYear);
  }, [availableYears, defaultYear]);

  const chartData = useMemo(
    () => aggregateActivities(activities, periodType, selectedYear, metric, locale),
    [activities, periodType, selectedYear, metric, locale]
  );

  const summary = useMemo(
    () => calculateSummaryStats(chartData),
    [chartData]
  );

  const yearRuns = useMemo(
    () => runs.filter((activity) => getActivityYear(activity) === selectedYear),
    [runs, selectedYear]
  );
  const yearSummary = useMemo(() => makeSummary(yearRuns), [yearRuns]);
  const last7Runs = useMemo(() => getActivitiesSince(runs, 7), [runs]);
  const last30Runs = useMemo(() => getActivitiesSince(runs, 30), [runs]);
  const previous30Runs = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() - 29);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return getActivitiesBetween(runs, start, end);
  }, [runs]);
  const last7Summary = useMemo(() => makeSummary(last7Runs), [last7Runs]);
  const last30Summary = useMemo(() => makeSummary(last30Runs), [last30Runs]);
  const previous30Summary = useMemo(() => makeSummary(previous30Runs), [previous30Runs]);
  const longestYearActivity = useMemo(() => getLongestActivity(yearRuns), [yearRuns]);
  const fastestYearActivity = useMemo(() => getFastestActivity(yearRuns), [yearRuns]);
  const latestRun = useMemo(
    () => [...runs].sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a))[0] ?? null,
    [runs]
  );
  const activeDays = useMemo(
    () => new Set(yearRuns.map((activity) => formatLocalDateKey(getActivityDate(activity)))).size,
    [yearRuns]
  );
  const trainingMix = useMemo(() => getTrainingMix(yearRuns, t), [yearRuns, t]);

  const bestPeriod = useMemo(() => getBestPeriod(chartData, metric), [chartData, metric]);
  const trend = useMemo(() => getRecentTrend(chartData, metric), [chartData, metric]);
  const activePeriods = useMemo(
    () => chartData.filter((item) => item.activities.length > 0).length,
    [chartData]
  );
  const selectedPeriod = useMemo(() => {
    const selected = chartData.find((item) => item.key === selectedPeriodKey && item.activities.length > 0);
    if (selected) return selected;
    const current = chartData.find((item) => item.isCurrent && item.activities.length > 0);
    if (current) return current;
    return [...chartData].reverse().find((item) => item.activities.length > 0) ?? null;
  }, [chartData, selectedPeriodKey]);
  const selectedPeriodSummary = useMemo(
    () => selectedPeriod ? calculateSummaryStats([selectedPeriod]) : null,
    [selectedPeriod]
  );
  const selectedPeriodActivities = useMemo(
    () => selectedPeriod
      ? [...selectedPeriod.activities]
          .sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a))
          .slice(0, 4)
      : [],
    [selectedPeriod]
  );
  const tone = getMetricTone(metric);
  const hasYearNav = availableYears.length > 0;
  const showYearNav = hasYearNav && (periodType === 'week' || periodType === 'month');
  const yearTimeline = getYearTimeline(selectedYear);
  const yearRemainingText = yearTimeline.state === 'past'
    ? t('stats.yearFinished', '已结束')
    : yearTimeline.state === 'future'
      ? t('stats.yearNotStarted', '未开始')
      : t('stats.yearRemaining', '还剩 {{percent}}%', { percent: yearTimeline.remainingPercent });
  const last30DistanceDelta = last30Summary.totalDistance - previous30Summary.totalDistance;
  const last30DistanceDeltaText = previous30Summary.totalDistance > 0
    ? `${last30DistanceDelta >= 0 ? '+' : '-'}${formatCompactDistance(Math.abs(last30DistanceDelta))}`
    : t('stats.newBaseline', '新基线');

  useEffect(() => {
    setSelectedPeriodKey((prev) => {
      if (prev && chartData.some((item) => item.key === prev && item.activities.length > 0)) {
        return prev;
      }
      return selectedPeriod?.key ?? null;
    });
  }, [chartData, selectedPeriod?.key]);

  const handlePrevYear = () => {
    const idx = availableYears.indexOf(selectedYear);
    if (idx > 0) setSelectedYear(availableYears[idx - 1]);
  };

  const handleNextYear = () => {
    const idx = availableYears.indexOf(selectedYear);
    if (idx < availableYears.length - 1) setSelectedYear(availableYears[idx + 1]);
  };

  const periodLabel = (type: PeriodType) => {
    const keys: Record<PeriodType, string> = {
      week: 'stats.byWeek',
      month: 'stats.byMonth',
      year: 'stats.byYear',
      all: 'stats.allTime',
    };
    return t(keys[type]);
  };

  const metricLabel = (m: MetricType) => {
    const keys: Record<MetricType, string> = {
      distance: 'stats.metricDistance',
      duration: 'stats.metricDuration',
      count: 'stats.metricCount',
      calories: 'stats.metricCalories',
      elevation: 'stats.metricElevation',
      pace: 'stats.metricPace',
    };
    return t(keys[m]);
  };

  const metricUnitLabel = getMetricUnit(metric);
  const bestPeriodValue = bestPeriod
    ? `${formatMetricValue(bestPeriod.value, metric)} ${metricUnitLabel}`.trim()
    : '--';
  const selectedMetricLabel = metricLabel(metric);
  const selectedMetricValue = selectedPeriod
    ? `${formatMetricValue(selectedPeriod.value, metric)} ${metricUnitLabel}`.trim()
    : '--';
  const trendText = trend
    ? trend.isCurrentPeriod
      ? t('stats.trendCurrentPeriod', '本周期仍在进行')
      : metric === 'pace'
      ? trend.improved
        ? t('stats.trendFaster', '较上一周期快 {{percent}}%', { percent: trend.percent })
        : t('stats.trendSlower', '较上一周期慢 {{percent}}%', { percent: trend.percent })
      : trend.improved
        ? t('stats.trendHigher', '较上一周期高 {{percent}}%', { percent: trend.percent })
        : t('stats.trendLower', '较上一周期低 {{percent}}%', { percent: trend.percent })
    : t('stats.trendStable', '等待更多周期数据');
  const currentYearIndex = availableYears.indexOf(selectedYear);
  const yearNavigator = hasYearNav ? (
    <div className="flex items-center justify-between sm:justify-start gap-1">
      <button
        type="button"
        onClick={handlePrevYear}
        disabled={currentYearIndex <= 0}
        className="p-2 border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
        title={t('common.previous', '上一项')}
      >
        <ChevronLeft size={16} />
      </button>
      <span className="font-mono text-sm font-bold px-3 min-w-[84px] text-center">
        {selectedYear}{t('stats.year', '年')}
      </span>
      <button
        type="button"
        onClick={handleNextYear}
        disabled={currentYearIndex >= availableYears.length - 1}
        className="p-2 border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
        title={t('common.next', '下一项')}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  ) : null;

  return (
    <div className="space-y-5">
      <section className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="p-4 sm:p-5 lg:p-6 border-b-2 lg:border-b-0 lg:border-r-2 border-zinc-200 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase text-orange-600 dark:text-orange-400 mb-2">
                  {t('stats.trainingDashboard', '训练统计工作台')}
                </p>
                <h2 className="font-pixel text-4xl sm:text-5xl leading-none text-zinc-950 dark:text-zinc-50">
                  {formatCompactDistance(yearSummary.totalDistance)}
                </h2>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                  {selectedYear}{t('stats.year', '年')} · {yearSummary.activityCount}{t('stats.runs')} · {formatPaceFromSeconds(yearSummary.avgPace)}/km
                </p>
              </div>
              <div className="hidden sm:flex size-12 items-center justify-center border-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <Sparkles size={20} className="text-orange-600 dark:text-orange-400" />
              </div>
            </div>

            <div className="grid grid-cols-3 border-y-2 border-zinc-200 dark:border-zinc-800">
              <div className="py-3 pr-2 border-r-2 border-zinc-200 dark:border-zinc-800">
                <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.last7Days', '近 7 天')}</p>
                <p className="font-mono text-lg font-bold">{formatCompactDistance(last7Summary.totalDistance)}</p>
                <p className="font-mono text-[10px] text-zinc-400">{last7Summary.activityCount}{t('stats.runs')}</p>
              </div>
              <div className="py-3 px-2 border-r-2 border-zinc-200 dark:border-zinc-800">
                <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.activeDays', '活跃天数')}</p>
                <p className="font-mono text-lg font-bold">{activeDays}</p>
                <p className="font-mono text-[10px] text-zinc-400">{yearRemainingText}</p>
              </div>
              <div className="py-3 pl-2">
                <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.avgRunDistance', '单次均距')}</p>
                <p className="font-mono text-lg font-bold">
                  {yearSummary.activityCount > 0 ? formatCompactDistance(yearSummary.totalDistance / yearSummary.activityCount) : '--'}
                </p>
                <p className="font-mono text-[10px] text-zinc-400">{formatDuration(Math.round(yearSummary.avgDuration))}</p>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400">
                  {t('stats.yearElapsed', '今年已过')}
                </p>
                <p className="font-mono text-[10px] font-bold text-zinc-700 dark:text-zinc-200">
                  {yearTimeline.elapsedPercent}% · {yearRemainingText}
                </p>
              </div>
              <div className="h-2 bg-zinc-100 dark:bg-zinc-800">
                <div className="h-full bg-zinc-950 dark:bg-zinc-100" style={{ width: `${yearTimeline.elapsedPercent}%` }} />
              </div>
            </div>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-950">
            <div className="grid grid-cols-2 lg:grid-cols-1">
              <div className="p-4 sm:p-5 border-r-2 lg:border-r-0 lg:border-b-2 border-zinc-200 dark:border-zinc-800">
                <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400 mb-1">
                  {t('stats.last30Days', '近 30 天')}
                </p>
                <p className="font-mono text-2xl font-bold text-zinc-950 dark:text-zinc-50">{formatCompactDistance(last30Summary.totalDistance)}</p>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {last30Summary.activityCount}{t('stats.runs')} · {last30DistanceDeltaText}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400 mb-1">
                  {t('stats.latestRun', '最近一次')}
                </p>
                <p className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50 truncate">
                  {latestRun?.name || t('stats.noRecentRun', '暂无记录')}
                </p>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {latestRun ? `${formatActivityDistance(latestRun.distance)} · ${formatActivityPace(latestRun)}/km · ${formatActivityDate(latestRun, locale)}` : '--'}
                </p>
              </div>
            </div>
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <div className="grid grid-cols-2 gap-2">
                <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                  <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.longestRun')}</p>
                  <p className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50 truncate">{longestYearActivity ? formatActivityDistance(longestYearActivity.distance) : '--'}</p>
                </div>
                <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                  <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.fastestPace')}</p>
                  <p className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50 truncate">{fastestYearActivity ? `${formatActivityPace(fastestYearActivity)}/km` : '--'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-800">
            {PERIOD_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPeriodType(type)}
                aria-pressed={periodType === type}
                className={`px-2 py-1.5 text-xs font-mono transition-colors ${
                  periodType === type
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {periodLabel(type)}
              </button>
            ))}
          </div>

          {showYearNav && yearNavigator}

          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {METRIC_OPTIONS.map(({ value, icon: Icon }) => {
              const itemTone = getMetricTone(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMetric(value)}
                  aria-pressed={metric === value}
                  className={[
                    'inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 border-2 font-mono text-[11px] transition-colors',
                    metric === value
                      ? `${itemTone.soft} ${itemTone.border} ${itemTone.text}`
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
                  ].join(' ')}
                >
                  <Icon size={13} />
                  {metricLabel(value)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px] gap-5">
        <section className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <SectionHeader
            icon={BarChart3}
            title={t('stats.periodTrend', '周期趋势')}
            action={(
              <span className={`font-mono text-[11px] font-bold ${trend?.improved ? 'text-emerald-600 dark:text-emerald-400' : tone.text}`}>
                {trendText}
              </span>
            )}
          />
          <VolumeBarChart
            data={chartData}
            metric={metric}
            selectedKey={selectedPeriodKey}
            onSelect={(item) => setSelectedPeriodKey(item.key)}
            colors={tone.chart}
          />
        </section>

        <div className="space-y-5">
          <PeriodInspector
            period={selectedPeriod}
            summary={selectedPeriodSummary}
            metricLabel={selectedMetricLabel}
            metricValue={selectedMetricValue}
            activities={selectedPeriodActivities}
            locale={locale}
          />

          <section className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <SectionHeader icon={Gauge} title={t('stats.trainingMix', '训练结构')} />
            <div className="space-y-3">
              {trainingMix.map((item) => (
                <div key={item.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{item.label}</span>
                    <span className="font-mono text-[11px] font-bold">{item.count}{t('stats.runs')} · {item.percent}%</span>
                  </div>
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800">
                    <div className={`h-full ${item.color}`} style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="border border-zinc-200 dark:border-zinc-800 p-2">
                <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.bestPeriod', '最佳周期')}</p>
                <p className="font-mono text-sm font-bold truncate">{bestPeriod?.label || '--'}</p>
                <p className={`font-mono text-[10px] ${tone.text}`}>{bestPeriodValue}</p>
              </div>
              <div className="border border-zinc-200 dark:border-zinc-800 p-2">
                <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('stats.activePeriods', '活跃周期')}</p>
                <p className="font-mono text-sm font-bold">{activePeriods}</p>
                <p className="font-mono text-[10px] text-zinc-400">{t('stats.periodsCount', '共 {{count}} 个周期', { count: chartData.length })}</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <SectionHeader
          icon={CalendarDays}
          title={t('stats.trainingCalendar', '训练日历')}
          action={!showYearNav ? yearNavigator : null}
        />
        <ActivityCalendarHeatmap activities={activities} year={selectedYear} metric={metric} colorClasses={tone.calendar} />
      </section>

      <section>
        <SectionHeader icon={CalendarCheck} title={t('stats.keyMetrics', '关键指标')} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SummaryTile
            title={t('stats.totalDistance')}
            value={formatCompactDistance(summary.totalDistance)}
            helper={t('stats.selectedScope', '当前范围')}
            icon={Route}
            tone="blue"
          />
          <SummaryTile
            title={t('stats.totalActivities')}
            value={`${summary.activityCount}`}
            helper={t('stats.runUnit', '次跑步')}
            icon={Footprints}
            tone="violet"
          />
          <SummaryTile
            title={t('stats.totalTime')}
            value={formatDuration(summary.totalDuration)}
            icon={Clock}
            tone="emerald"
          />
          <SummaryTile
            title={t('stats.avgPace')}
            value={`${formatPaceFromSeconds(summary.avgPace)}/km`}
            icon={Timer}
            tone="blue"
          />
          <SummaryTile
            title={t('activity.averageHeartRate')}
            value={summary.hasHeartRateData ? `${Math.round(summary.avgHeartRate)} bpm` : '--'}
            icon={HeartPulse}
            tone="rose"
          />
          <SummaryTile
            title={t('stats.totalElevation')}
            value={`${Math.round(summary.totalElevation)} m`}
            icon={Mountain}
            tone="amber"
          />
          <SummaryTile
            title={t('stats.totalCalories')}
            value={summary.hasCaloriesData ? `${Math.round(summary.totalCalories)} kcal` : '--'}
            icon={Flame}
            tone="rose"
          />
          <SummaryTile
            title={t('activity.averagePower')}
            value={summary.hasPowerData ? `${Math.round(summary.avgPower)} W` : '--'}
            icon={Zap}
            tone="amber"
          />
          <SummaryTile
            title={t('stats.avgTime')}
            value={formatDuration(Math.round(summary.avgDuration))}
            icon={Activity}
            tone="default"
          />
        </div>
      </section>
    </div>
  );
}
