'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
import {
  Activity,
  BarChart3,
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
    accent: string;
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
      accent: 'text-blue-600 dark:text-blue-400',
      soft: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-900',
      chart: { bar: '#3b82f6', barStroke: '#2563eb', currentBar: '#f97316', currentBarStroke: '#ea580c' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-blue-200 dark:bg-blue-900/40', 'bg-blue-400 dark:bg-blue-700', 'bg-blue-600 dark:bg-blue-500', 'bg-blue-800 dark:bg-blue-400'],
    },
    duration: {
      accent: 'text-emerald-600 dark:text-emerald-400',
      soft: 'bg-emerald-50 dark:bg-emerald-950/30',
      border: 'border-emerald-200 dark:border-emerald-900',
      chart: { bar: '#10b981', barStroke: '#059669', currentBar: '#f97316', currentBarStroke: '#ea580c' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-emerald-200 dark:bg-emerald-900/40', 'bg-emerald-400 dark:bg-emerald-700', 'bg-emerald-600 dark:bg-emerald-500', 'bg-emerald-800 dark:bg-emerald-400'],
    },
    count: {
      accent: 'text-violet-600 dark:text-violet-400',
      soft: 'bg-violet-50 dark:bg-violet-950/30',
      border: 'border-violet-200 dark:border-violet-900',
      chart: { bar: '#8b5cf6', barStroke: '#7c3aed', currentBar: '#f97316', currentBarStroke: '#ea580c' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-violet-200 dark:bg-violet-900/40', 'bg-violet-400 dark:bg-violet-700', 'bg-violet-600 dark:bg-violet-500', 'bg-violet-800 dark:bg-violet-400'],
    },
    calories: {
      accent: 'text-rose-600 dark:text-rose-400',
      soft: 'bg-rose-50 dark:bg-rose-950/30',
      border: 'border-rose-200 dark:border-rose-900',
      chart: { bar: '#f43f5e', barStroke: '#e11d48', currentBar: '#f97316', currentBarStroke: '#ea580c' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-rose-200 dark:bg-rose-900/40', 'bg-rose-400 dark:bg-rose-700', 'bg-rose-600 dark:bg-rose-500', 'bg-rose-800 dark:bg-rose-400'],
    },
    elevation: {
      accent: 'text-amber-600 dark:text-amber-400',
      soft: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-900',
      chart: { bar: '#f59e0b', barStroke: '#d97706', currentBar: '#2563eb', currentBarStroke: '#1d4ed8' },
      calendar: ['bg-zinc-100 dark:bg-zinc-800', 'bg-amber-200 dark:bg-amber-900/40', 'bg-amber-400 dark:bg-amber-700', 'bg-amber-600 dark:bg-amber-500', 'bg-amber-800 dark:bg-amber-400'],
    },
    pace: {
      accent: 'text-cyan-600 dark:text-cyan-400',
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

  const diff = current.value - previous.value;
  const percent = Math.round(Math.abs(diff / previous.value) * 100);
  if (percent === 0) return null;

  const improved = metric === 'pace' ? diff < 0 : diff > 0;
  return {
    current,
    previous,
    percent,
    improved,
  };
}

function formatCompactDistance(meters: number) {
  if (meters >= 100000) return `${Math.round(meters / 1000)} km`;
  return `${(meters / 1000).toFixed(1)} km`;
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

export function VolumeDashboard({ activities }: VolumeDashboardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const availableYears = useMemo(() => getAvailableYears(activities), [activities]);
  const currentYear = new Date().getFullYear();
  const defaultYear = availableYears.includes(currentYear)
    ? currentYear
    : availableYears[availableYears.length - 1] || currentYear;

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [metric, setMetric] = useState<MetricType>('distance');

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

  const allTimeSummary = useMemo(() => {
    const years = getAvailableYears(activities);
    const referenceYear = years[years.length - 1] || selectedYear;
    return calculateSummaryStats(
      aggregateActivities(activities, 'all', referenceYear, 'distance', locale)
    );
  }, [activities, locale, selectedYear]);

  const bestPeriod = useMemo(() => getBestPeriod(chartData, metric), [chartData, metric]);
  const trend = useMemo(() => getRecentTrend(chartData, metric), [chartData, metric]);
  const activePeriods = useMemo(
    () => chartData.filter((item) => item.activities.length > 0).length,
    [chartData]
  );
  const tone = getMetricTone(metric);
  const hasYearNav = availableYears.length > 0;
  const showYearNav = hasYearNav && (periodType === 'week' || periodType === 'month');

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
  const trendText = trend
    ? metric === 'pace'
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
      <div className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="grid grid-cols-1 md:grid-cols-[1.15fr_0.85fr]">
          <div className="p-4 md:p-5 border-b-2 md:border-b-0 md:border-r-2 border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 mb-4">
              <div className={`p-1.5 border ${tone.border} ${tone.soft}`}>
                <Sparkles size={16} className={tone.accent} />
              </div>
              <p className="font-mono text-xs uppercase text-zinc-500 dark:text-zinc-400">
                {t('stats.trainingOverview', '训练概览')}
              </p>
            </div>

            <div className="flex items-end gap-2 mb-2">
              <span className="font-pixel text-4xl leading-none">
                {formatCompactDistance(allTimeSummary.totalDistance)}
              </span>
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 pb-1">
                {t('stats.allTimeDistance', '累计距离')}
              </span>
            </div>
            <p className="font-mono text-sm text-zinc-600 dark:text-zinc-300">
              {t('stats.trainingOverviewDesc', '共 {{count}} 次跑步，累计 {{time}}，平均配速 {{pace}}/km。', {
                count: allTimeSummary.activityCount,
                time: formatDuration(allTimeSummary.totalDuration),
                pace: formatPaceFromSeconds(allTimeSummary.avgPace),
              })}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-0">
            <div className="p-4 border-r-2 border-b-2 border-zinc-200 dark:border-zinc-800">
              <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400 mb-1">
                {t('stats.activePeriods', '活跃周期')}
              </p>
              <p className="font-mono text-2xl font-bold">{activePeriods}</p>
              <p className="font-mono text-[10px] text-zinc-400 mt-1">
                {t('stats.periodsCount', '共 {{count}} 个周期', { count: chartData.length })}
              </p>
            </div>
            <div className="p-4 border-b-2 border-zinc-200 dark:border-zinc-800">
              <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400 mb-1">
                {t('stats.bestPeriod', '最佳周期')}
              </p>
              <p className="font-mono text-lg font-bold truncate">{bestPeriod?.label || '--'}</p>
              <p className={`font-mono text-[10px] mt-1 ${tone.accent}`}>{bestPeriodValue}</p>
            </div>
            <div className="p-4 border-r-2 border-zinc-200 dark:border-zinc-800">
              <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400 mb-1">
                {t('stats.periodAverage', '周期均值')}
              </p>
              <p className="font-mono text-lg font-bold truncate">
                {`${formatMetricValue(summary.avgPeriodValue, metric)} ${metricUnitLabel}`.trim()}
              </p>
            </div>
            <div className="p-4">
              <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400 mb-1">
                {t('stats.recentTrend', '最近趋势')}
              </p>
              <p className={`font-mono text-xs font-bold ${trend?.improved ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-300'}`}>
                {trendText}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800">
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

          {showYearNav && (
            yearNavigator
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {METRIC_OPTIONS.map(({ value, icon: Icon }) => {
            const itemTone = getMetricTone(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => setMetric(value)}
                aria-pressed={metric === value}
                className={[
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 border-2 font-mono text-[11px] transition-colors',
                  metric === value
                    ? `${itemTone.soft} ${itemTone.border} ${itemTone.accent}`
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

      <section className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <SectionHeader icon={BarChart3} title={t('stats.periodTrend', '周期趋势')} />
        <VolumeBarChart data={chartData} metric={metric} colors={tone.chart} />
      </section>

      <section className="border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <SectionHeader
          icon={CalendarDays}
          title={t('stats.trainingCalendar', '训练日历')}
          action={!showYearNav ? yearNavigator : null}
        />
        <ActivityCalendarHeatmap activities={activities} year={selectedYear} metric={metric} colorClasses={tone.calendar} />
      </section>

      <section>
        <SectionHeader icon={Gauge} title={t('stats.keyMetrics', '关键指标')} />
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
