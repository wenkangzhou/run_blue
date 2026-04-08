'use client';

import React from 'react';
import { StravaActivity } from '@/types';
import { formatDistance, formatDuration } from '@/lib/strava';
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
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

  // Calculate stats for different periods (removed 'all')
  const stats = React.useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentWeek = getWeekNumber(now);

    const result: PeriodStats[] = [
      {
        label: t('stats.thisWeek'),
        period: 'week',
        ...calculatePeriodStats(activities, (date) => {
          return getWeekNumber(date) === currentWeek && date.getFullYear() === currentYear;
        }),
      },
      {
        label: t('stats.thisMonth'),
        period: 'month',
        ...calculatePeriodStats(activities, (date) => {
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        }),
      },
      {
        label: t('stats.thisYear'),
        period: 'year',
        ...calculatePeriodStats(activities, (date) => {
          return date.getFullYear() === currentYear;
        }),
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

  // Get current period label
  const periodLabel = {
    week: t('stats.weekShort', '周'),
    month: t('stats.monthShort', '月'),
    year: t('stats.yearShort', '年'),
  }[activePeriod];

  return (
    <div className="relative">
      {/* Compact Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-full text-xs font-mono hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
      >
        <BarChart3 size={12} />
        <span className="text-zinc-500">{periodLabel}</span>
        <span className="font-medium">{formatDistance(activeStats.distance, 'km')} · {activeStats.count}{t('stats.runs')}</span>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Expandable Content - Dropdown Style */}
      {isExpanded && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 rounded-lg p-3 shadow-lg z-50">
          {/* Period Tabs */}
          <div className="flex gap-1 mb-3 p-1 bg-zinc-100 dark:bg-zinc-800 rounded">
            {stats.map((stat) => (
              <button
                key={stat.period}
                onClick={() => setActivePeriod(stat.period)}
                className={`flex-1 py-1 px-1 text-[10px] font-mono rounded transition-colors ${
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
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">{t('stats.distance')}</div>
              <div className="font-mono text-xs font-bold">{formatDistance(activeStats.distance, 'km')}</div>
            </div>
            <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">{t('stats.time')}</div>
              <div className="font-mono text-xs font-bold">{formatDuration(activeStats.time)}</div>
            </div>
            <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">{t('stats.avgPace')}</div>
              <div className="font-mono text-xs font-bold">{avgPace > 0 ? `${avgPace.toFixed(2)}'/km` : '-'}</div>
            </div>
            <div className="text-center p-2 bg-zinc-50 dark:bg-zinc-800 rounded">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">{t('stats.totalRuns')}</div>
              <div className="font-mono text-xs font-bold">{activeStats.count}</div>
            </div>
          </div>
        </div>
      )}
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
