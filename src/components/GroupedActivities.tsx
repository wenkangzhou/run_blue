'use client';

import React from 'react';
import { StravaActivity } from '@/types';
import { ActivityGridCard } from './ActivityGridCard';
import { formatDistance, formatDuration } from '@/lib/strava';
import { Clock, Route, Calendar, ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

export function GroupedActivities({ activities, hasMore, isLoading, onOpenPeriodShare }: GroupedActivitiesProps) {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = React.useState<GroupBy>('week');

  const groups = React.useMemo(() => {
    return groupActivities(activities, groupBy, t);
  }, [activities, groupBy, t]);

  return (
    <div>
      {/* Group By Tabs + Actions */}
      <div className="flex items-center justify-between gap-3 mb-4 px-1">
        <div className="flex gap-2">
          {(['week', 'month', 'year'] as GroupBy[]).map((type) => (
            <button
              key={type}
              onClick={() => setGroupBy(type)}
              className={`px-3 py-1.5 text-xs font-mono rounded-full transition-colors ${
                groupBy === type
                  ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {type === 'week' && t('stats.byWeek')}
              {type === 'month' && t('stats.byMonth')}
              {type === 'year' && t('stats.byYear')}
            </button>
          ))}
        </div>

        {onOpenPeriodShare && (
          <button
            onClick={onOpenPeriodShare}
            className="inline-flex items-center gap-1 px-3 py-1.5 font-mono text-xs font-bold uppercase border-2 border-zinc-800 dark:border-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title={t('periodShare.title', '周期海报')}
          >
            <ImageIcon size={14} />
            <span className="hidden sm:inline">{t('periodShare.title', '周期海报')}</span>
          </button>
        )}
      </div>

      {/* Grouped Lists */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.key} className="border-t-2 border-zinc-200 dark:border-zinc-700 pt-4">
            {/* Group Header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-zinc-400" />
                <span className="font-pixel text-sm font-bold">{group.label}</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
                <span className="flex items-center gap-1">
                  <Route size={12} />
                  {formatDistance(group.totalDistance, 'km')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {formatDuration(group.totalTime)}
                </span>
                <span className="text-zinc-400">
                  {group.activities.length}{t('stats.runs', '次')}
                </span>
              </div>
            </div>

            {/* Activity Grid - Responsive columns */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
              {group.activities.map((activity, index) => (
                <ActivityGridCard
                  key={`${activity.id}-${index}`}
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
  t: any
): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();

  activities.forEach((activity) => {
    const date = new Date(activity.start_date);
    let key: string;
    let label: string;
    let startDate: Date;
    let endDate: Date;

    if (groupBy === 'week') {
      const weekNum = getWeekNumber(date);
      const year = date.getFullYear();
      key = `${year}-W${weekNum}`;
      
      // Calculate week start and end
      const weekStart = getWeekStart(date);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      startDate = weekStart;
      endDate = weekEnd;
      label = formatWeekLabel(weekStart, weekEnd, t);
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
      label = formatYearLabel(year, t);
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

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((Number(d) - Number(yearStart)) / 86400000 + 1) / 7);
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatWeekLabel(start: Date, end: Date, t: any): string {
  const startStr = `${start.getMonth() + 1}/${start.getDate()}`;
  const endStr = `${end.getMonth() + 1}/${end.getDate()}`;
  const yearStr = start.getFullYear();
  return `${yearStr}: ${startStr} - ${endStr}`;
}

function formatMonthLabel(year: number, month: number, t: any): string {
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

function formatYearLabel(year: number, t: any): string {
  return `${year}年`;
}
