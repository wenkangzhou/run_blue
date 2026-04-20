'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StravaActivity } from '@/types';
import {
  PeriodType,
  MetricType,
  aggregateActivities,
  calculateSummaryStats,
  getAvailableYears,
  formatMetricValue,
  getMetricUnit,
  formatPaceFromSeconds,
} from '@/lib/stats';
import { VolumeBarChart } from './charts/VolumeBarChart';
import { StatsCard } from './StatsCard';
import { PixelCard } from './ui';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trophy,
  Timer,
  Heart,
  Mountain,
  Flame,
  Zap,
  Footprints,
  Clock,
  Activity,
  BarChart3,
} from 'lucide-react';
import { formatDistance, formatDuration } from '@/lib/strava';

interface VolumeDashboardProps {
  activities: StravaActivity[];
}

const PERIOD_TYPES: PeriodType[] = ['week', 'month', 'year', 'all'];
const METRICS: MetricType[] = ['distance', 'duration', 'count', 'calories', 'elevation'];

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
  const [showMetricDropdown, setShowMetricDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const metricButtonRef = useRef<HTMLButtonElement>(null);

  // Close metric dropdown on outside click
  useEffect(() => {
    if (!showMetricDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !metricButtonRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setShowMetricDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMetricDropdown]);

  const chartData = useMemo(
    () => aggregateActivities(activities, periodType, selectedYear, metric, locale),
    [activities, periodType, selectedYear, metric, locale]
  );

  const summary = useMemo(
    () => calculateSummaryStats(chartData, metric),
    [chartData, metric]
  );

  const showYearNav = periodType === 'week' || periodType === 'month';

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
    };
    return t(keys[m]);
  };

  const metricUnitLabel = getMetricUnit(metric);

  return (
    <div className="space-y-6">
      {/* Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Period Tabs */}
        <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700">
          {PERIOD_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setPeriodType(type)}
              className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-mono transition-colors ${
                periodType === type
                  ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 border-2 border-zinc-800 dark:border-zinc-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)]'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {periodLabel(type)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Year Navigation */}
          {showYearNav && (
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevYear}
                disabled={availableYears.indexOf(selectedYear) <= 0}
                className="p-1 border-2 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-mono text-sm font-bold px-2 min-w-[72px] text-center">
                {selectedYear}{t('stats.year', '年')}
              </span>
              <button
                onClick={handleNextYear}
                disabled={availableYears.indexOf(selectedYear) >= availableYears.length - 1}
                className="p-1 border-2 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Metric Selector */}
          <div className="relative">
            <button
              ref={metricButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                setShowMetricDropdown(!showMetricDropdown);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 text-xs font-mono hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <BarChart3 size={14} />
              <span>{metricLabel(metric)}</span>
              {showMetricDropdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showMetricDropdown && (
              <div
                ref={dropdownRef}
                className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-900 border-2 border-zinc-800 dark:border-zinc-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] z-50 min-w-[120px]"
              >
                {METRICS.map((m) => (
                  <button
                    key={m}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMetric(m);
                      setShowMetricDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${
                      metric === m
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {metricLabel(m)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <PixelCard className="p-4">
        <VolumeBarChart data={chartData} metric={metric} />
      </PixelCard>

      {/* Summary Stats */}
      <div>
        <h2 className="font-pixel text-lg font-bold mb-3">
          {t('stats.summary', '统计汇总')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatsCard
            title={t('stats.totalDistance')}
            value={formatDistance(summary.totalDistance, 'km')}
            icon={Trophy}
            variant="primary"
          />
          <StatsCard
            title={
              periodType === 'week'
                ? t('stats.avgWeeklyValue', '平均周{{unit}}', { unit: metricUnitLabel })
                : periodType === 'month'
                ? t('stats.avgMonthlyValue', '平均月{{unit}}', { unit: metricUnitLabel })
                : t('stats.avgPeriodValue', '平均{{unit}}', { unit: metricUnitLabel })
            }
            value={`${formatMetricValue(summary.avgPeriodValue, metric)} ${metricUnitLabel}`}
            icon={BarChart3}
            variant="default"
          />
          <StatsCard
            title={t('stats.avgPace')}
            value={formatPaceFromSeconds(summary.avgPace) + '/km'}
            icon={Timer}
            variant="default"
          />
          <StatsCard
            title={t('activity.averageHeartRate')}
            value={
              summary.avgHeartRate > 0
                ? `${Math.round(summary.avgHeartRate)} bpm`
                : '--'
            }
            icon={Heart}
            variant="warning"
          />
          <StatsCard
            title={t('stats.totalElevation')}
            value={`${Math.round(summary.totalElevation)} m`}
            icon={Mountain}
            variant="default"
          />
          <StatsCard
            title={t('stats.totalCalories')}
            value={`${Math.round(summary.totalCalories)} kcal`}
            icon={Flame}
            variant="warning"
          />
          <StatsCard
            title={t('activity.averagePower')}
            value={
              summary.avgPower > 0
                ? `${Math.round(summary.avgPower)} W`
                : '--'
            }
            icon={Zap}
            variant="primary"
          />
          <StatsCard
            title={t('stats.totalActivities')}
            value={`${summary.activityCount}`}
            icon={Footprints}
            variant="default"
          />
          <StatsCard
            title={t('stats.totalTime')}
            value={formatDuration(summary.totalDuration)}
            icon={Clock}
            variant="default"
          />
          <StatsCard
            title={t('stats.avgTime')}
            value={formatDuration(Math.round(summary.avgDuration))}
            icon={Activity}
            variant="default"
          />
        </div>
      </div>
    </div>
  );
}
