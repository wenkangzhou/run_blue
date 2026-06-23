'use client';

import React from 'react';
import { StravaActivity } from '@/types';
import { ActivityGridCard } from './ActivityGridCard';
import { formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { Clock, Route, Calendar, ImageIcon, Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { addLocalDays, getActivityDate, getISOWeek, getLocalWeekStart } from '@/lib/dates';

type GroupBy = 'week' | 'month' | 'year';

interface GroupedActivitiesProps {
  activities: StravaActivity[];
  hasMore?: boolean;
  isLoading?: boolean;
  onOpenPeriodShare?: () => void;

}

interface ActivityGroup {
  key: string;
  label: string;
  startDate: Date;
  endDate: Date;
  activities: StravaActivity[];
  totalDistance: number;
  totalTime: number;
}

export function GroupedActivities({ activities, onOpenPeriodShare }: GroupedActivitiesProps) {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = React.useState<GroupBy>('week');

  const groups = React.useMemo(() => {
    return groupActivities(activities, groupBy, t);
  }, [activities, groupBy, t]);

  return (
    <div>
      {/* Group By Tabs + Actions */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 sm:inline">
            分组
          </span>
          <div className="flex min-w-0 gap-1 overflow-x-auto rounded-lg bg-zinc-50 p-1 dark:bg-zinc-900">
            {(['week', 'month', 'year'] as GroupBy[]).map((type) => (
              <button
                key={type}
                onClick={() => setGroupBy(type)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 font-mono text-[11px] font-bold transition-colors sm:text-xs ${
                  groupBy === type
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-300'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {type === 'week' && t('stats.byWeek')}
                {type === 'month' && t('stats.byMonth')}
                {type === 'year' && t('stats.byYear')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onOpenPeriodShare && (
            <button
              onClick={onOpenPeriodShare}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 font-mono text-[11px] font-bold text-zinc-700 transition-colors hover:border-blue-300 hover:text-blue-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-blue-800 dark:hover:text-blue-300 sm:text-xs"
              title={t('periodShare.title', '周期海报')}
            >
              <ImageIcon size={14} />
              <span>{t('periodShare.title', '周期海报')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Grouped Lists */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.key} className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            {/* Group Header */}
            <div className="mb-3 flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar size={14} className="text-blue-500 flex-shrink-0" />
                <span className="truncate font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{group.label}</span>
              </div>
              <div className="ml-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-zinc-500 sm:ml-0 sm:shrink-0 sm:whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <Route size={12} />
                  {formatDistance(group.totalDistance, 'km')}
                </span>
                <span className="flex items-center gap-1">
                  <Gauge size={12} />
                  {formatPace(group.totalDistance, group.totalTime, 'min/km')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {formatDuration(group.totalTime)}
                </span>
                <span className="text-zinc-400">
                  {group.activities.length}{t('stats.runs', '')}
                </span>
              </div>
            </div>

            {/* Activity Grid - Responsive columns */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {group.activities.map((activity) => (
                <ActivityGridCard
                  key={activity.id}
                  activity={activity}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupActivities(
  activities: StravaActivity[],
  groupBy: GroupBy,
  t: TFunction
): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();

  activities.forEach((activity) => {
    const date = getActivityDate(activity);
    let key: string;
    let label: string;
    let startDate: Date;
    let endDate: Date;

    if (groupBy === 'week') {
      const { year, week: weekNum } = getISOWeek(date);
      key = `${year}-W${weekNum}`;
      
      // Calculate week start and end
      const weekStart = getLocalWeekStart(date);
      const weekEnd = addLocalDays(weekStart, 6);
      
      startDate = weekStart;
      endDate = weekEnd;
      label = formatWeekLabel(weekStart, weekEnd);
    } else if (groupBy === 'month') {
      const year = date.getFullYear();
      const month = date.getMonth();
      key = `${year}-${month}`;
      
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0);
      label = formatMonthLabel(year, month, t);
    } else {
      const year = date.getFullYear();
      key = `${year}`;
      
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31);
      label = formatYearLabel(year);
    }

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        startDate,
        endDate,
        activities: [],
        totalDistance: 0,
        totalTime: 0,
      });
    }

    const group = groups.get(key)!;
    group.activities.push(activity);
    group.totalDistance += activity.distance;
    group.totalTime += activity.moving_time;
  });

  // Sort by date descending
  return Array.from(groups.values()).sort(
    (a, b) => b.startDate.getTime() - a.startDate.getTime()
  );
}

function formatWeekLabel(start: Date, end: Date): string {
  const startStr = `${start.getMonth() + 1}/${start.getDate()}`;
  const endStr = `${end.getMonth() + 1}/${end.getDate()}`;
  const yearStr = start.getFullYear();
  return `${yearStr} ${startStr}-${endStr}`;
}

function formatMonthLabel(year: number, month: number, t: TFunction): string {
  const monthNames = [
    t('months.jan', '1月'),
    t('months.feb', '2月'),
    t('months.mar', '3月'),
    t('months.apr', '4月'),
    t('months.may', '5月'),
    t('months.jun', '6月'),
    t('months.jul', '7月'),
    t('months.aug', '8月'),
    t('months.sep', '9月'),
    t('months.oct', '10月'),
    t('months.nov', '11月'),
    t('months.dec', '12月'),
  ];
  return `${year}年 ${monthNames[month]}`;
}

function formatYearLabel(year: number): string {
  return `${year}年`;
}
