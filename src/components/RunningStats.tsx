'use client';

import React from 'react';
import { StravaActivity } from '@/types';
import { formatDistance, formatDuration } from '@/lib/strava';
import { Calendar, Clock, Route, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type PeriodType = 'week' | 'month' | 'year' | 'all';

interface ActivityStatsProps {
  activities: StravaActivity[];
}

interface PeriodStats {
  label: string;
  distance: number;
  time: number;
  count: number;
  period: PeriodType;
}

export function RunningStats({ activities }: ActivityStatsProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [activePeriod, setActivePeriod] = React.useState<PeriodType>('week');

  // Calculate stats for different periods
  const stats = React.useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentWeek = getWeekNumber(now);

    const result: PeriodStats[] = [
      {
        label: t('stats.thisWeek', '本周'),
        period: 'week',
        ...calculatePeriodStats(activities, (date) => {
          return getWeekNumber(date) === currentWeek && date.getFullYear() === currentYear;
        }),
      },
      {
        label: t('stats.thisMonth', '本月'),
        period: 'month',
        ...calculatePeriodStats(activities, (date) => {
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        }),
      },
      {
        label: t('stats.thisYear', '今年'),
        period: 'year',
        ...calculatePeriodStats(activities, (date) => {
          return date.getFullYear() === currentYear;
        }),
      },
      {
        label: t('stats.allTime', '全部'),
        period: 'all',
        ...calculatePeriodStats(activities, () => true),
      },
    ];

    return result;
  }, [activities, t]);

  const activeStats = stats.find((s) => s.period === activePeriod) || stats[0];

  // Calculate averages
  const avgPace =
    activeStats.distance > 0
      ? (activeStats.time / 60) / (activeStats.distance / 1000)
      : 0;

  return (
    <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 rounded-lg mb-4 overflow-hidden">
      {/* Header - Click to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-pixel text-sm font-bold">{t('stats.title', '统计数据')}</span>
          <span className="text-xs font-mono text-zinc-400">
            {formatDistance(activeStats.distance, 'km')} · {activeStats.count}{t('stats.runs', '次')}
          </span>
        </div>
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="p-3 pt-0 border-t border-zinc-100 dark:border-zinc-800">
          {/* Period Tabs */}
          <div className="flex gap-1 mt-3 mb-3 p-1 bg-zinc-100 dark:bg-zinc-800 rounded">
            {stats.map((stat) => (
              <button
                key={stat.period}
                onClick={() => setActivePeriod(stat.period)}
                className={`flex-1 py-1.5 px-2 text-xs font-mono rounded transition-colors ${
                  activePeriod === stat.period
                    ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {stat.label}
              </button>
            ))}
          </div>

          {/* Main Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Route size={16} />}
              label={t('stats.distance', '距离')}
              value={formatDistance(activeStats.distance, 'km')}
            />
            <StatCard
              icon={<Clock size={16} />}
              label={t('stats.time', '时间')}
              value={formatDuration(activeStats.time)}
            />
            <StatCard
              icon={<TrendingUp size={16} />}
              label={t('stats.avgPace', '平均配速')}
              value={avgPace > 0 ? `${avgPace.toFixed(2)}'/${t('stats.km', 'km')}` : '-'}
            />
            <StatCard
              icon={<Calendar size={16} />}
              label={t('stats.totalRuns', '次数')}
              value={`${activeStats.count}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-zinc-500 mb-1">
        {icon}
        <span className="text-xs font-mono">{label}</span>
      </div>
      <div className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}

// Helper functions
function calculatePeriodStats(
  activities: StravaActivity[],
  filterFn: (date: Date) => boolean
) {
  const filtered = activities.filter((a) => {
    const date = new Date(a.start_date);
    return filterFn(date);
  });

  return {
    distance: filtered.reduce((sum, a) => sum + a.distance, 0),
    time: filtered.reduce((sum, a) => sum + a.moving_time, 0),
    count: filtered.length,
  };
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((Number(d) - Number(yearStart)) / 86400000 + 1) / 7);
}
