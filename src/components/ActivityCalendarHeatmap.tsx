'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ChevronRight, X } from 'lucide-react';
import { StravaActivity } from '@/types';
import { MetricType, getDailyAggregates, formatMetricValue, getMetricUnit } from '@/lib/stats';
import { getCalendarHeatmapLevelMap } from '@/lib/calendarHeatmap';
import { formatDistance, formatPace } from '@/lib/strava';

interface ActivityCalendarHeatmapProps {
  activities: StravaActivity[];
  year: number;
  metric: MetricType;
  colorClasses?: string[];
}

const WEEKS_TO_SHOW = 53;
const DAY_LABELS_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const DAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEFAULT_COLOR_CLASSES = [
  'bg-zinc-100 dark:bg-zinc-800',
  'bg-sky-100 dark:bg-sky-950/50',
  'bg-sky-300 dark:bg-sky-800',
  'bg-blue-500 dark:bg-blue-600',
  'bg-indigo-600 dark:bg-indigo-400',
];

const REVERSE_COLOR_CLASSES = [
  'bg-zinc-100 dark:bg-zinc-800',
  'bg-cyan-100 dark:bg-cyan-950/50',
  'bg-cyan-300 dark:bg-cyan-800',
  'bg-teal-500 dark:bg-teal-600',
  'bg-emerald-600 dark:bg-emerald-400',
];

export function ActivityCalendarHeatmap({ activities, year, metric, colorClasses }: ActivityCalendarHeatmapProps) {

  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const isZh = locale.startsWith('zh');
  const [hovered, setHovered] = useState<{ date: string; value: number; x: number; y: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dailyData = useMemo(() => {
    return getDailyAggregates(activities, year, metric);
  }, [activities, year, metric]);

  const { weeks, totalRuns, activeDays, levelMap, aggregateMap } = useMemo(() => {
    const byDate = new Map(dailyData.map((day) => [day.date, day]));

    const runs = dailyData.reduce((sum, day) => sum + day.activities.length, 0);
    const days = dailyData.filter((day) => day.activities.length > 0).length;
    const values = dailyData.map((day) => day.value).filter((value) => value > 0);

    // Find calendar start date (first Monday before or on Jan 1)
    const jan1 = new Date(year, 0, 1);
    const jan1Day = jan1.getDay(); // 0=Sun, 1=Mon...
    // If Jan 1 is Monday (1), offset = 0. If Sunday (0), offset = -6.
    const offset = jan1Day === 0 ? -6 : 1 - jan1Day;
    const startDate = new Date(year, 0, 1 + offset);

    // Generate weeks
    const w: Date[][] = [];

    for (let wi = 0; wi < WEEKS_TO_SHOW; wi++) {
      const week: Date[] = [];
      for (let di = 0; di < 7; di++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + wi * 7 + di);
        week.push(d);
      }
      w.push(week);
    }

    return {
      weeks: w,
      totalRuns: runs,
      activeDays: days,
      levelMap: getCalendarHeatmapLevelMap(values, metric === 'pace'),
      aggregateMap: byDate,
    };
  }, [dailyData, metric, year]);

  const isReverseMetric = metric === 'pace';
  const COLOR_CLASSES = colorClasses || (isReverseMetric ? REVERSE_COLOR_CLASSES : DEFAULT_COLOR_CLASSES);

  const formatDateLabel = (date: Date) => {
    return isZh
      ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
      : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleMouseEnter = (date: Date, value: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHovered({
      date: formatDateLabel(date),
      value,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const selectedDay = selectedDate ? aggregateMap.get(selectedDate) : undefined;
  const selectedDateValue = selectedDate
    ? (() => {
        const [selectedYear, month, day] = selectedDate.split('-').map(Number);
        return new Date(selectedYear, month - 1, day);
      })()
    : null;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-sm font-bold text-zinc-700 dark:text-zinc-300">
          {t('stats.yearRunSummary', '{{year}} · {{count}} 次跑步 · {{days}} 个训练日', {
            year,
            count: totalRuns,
            days: activeDays,
          })}
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px] ml-5 mb-1">
          <div className="w-4 flex-shrink-0" />
          {weeks.map((week, wi) => {
            const midDay = week[3];
            const isFirstWeekOfMonth = midDay.getDate() <= 7;
            const shouldShow = isFirstWeekOfMonth;
            return (
              <div key={wi} className="w-[10px] flex-shrink-0">
                {shouldShow && (
                  <span className="font-mono text-[9px] text-zinc-400 whitespace-nowrap">
                    {isZh
                      ? `${midDay.getMonth() + 1}月`
                      : midDay.toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-[3px]">
          <div className="flex flex-col gap-[3px] mr-1 flex-shrink-0">
            {(isZh ? DAY_LABELS_ZH : DAY_LABELS_EN).map((label, i) => (
              <div key={i} className="h-[10px] flex items-center">
                <span className="font-mono text-[9px] text-zinc-400 w-4 text-right">{label}</span>
              </div>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px] flex-shrink-0">
              {week.map((date, di) => {
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const aggregate = aggregateMap.get(key);
                const value = aggregate?.value || 0;
                const level = levelMap.get(value) ?? 0;
                const isInYear = date.getFullYear() === year;
                const hasActivities = Boolean(aggregate?.activities.length);
                const isSelected = selectedDate === key;
                const title = value > 0
                  ? `${formatDateLabel(date)} · ${formatMetricValue(value, metric)} ${getMetricUnit(metric)}`
                  : formatDateLabel(date);
                return (
                  <button
                    type="button"
                    key={di}
                    title={isInYear ? title : undefined}
                    aria-label={isInYear ? title : undefined}
                    aria-pressed={isSelected}
                    disabled={!isInYear}
                    className={`h-[11px] w-[11px] rounded-[3px] p-0 ${isInYear ? COLOR_CLASSES[level] : 'bg-transparent'} ${hasActivities ? 'cursor-pointer' : 'cursor-default'} ring-1 transition-transform hover:scale-125 hover:ring-white dark:hover:ring-zinc-950 ${isSelected ? 'ring-2 ring-blue-600 dark:ring-blue-300' : 'ring-transparent'}`}
                    onMouseEnter={(e) => isInYear && handleMouseEnter(date, value, e)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      if (!hasActivities) return;
                      setSelectedDate((current) => current === key ? null : key);
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {hovered && (
        <div
          className="fixed z-50 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 font-mono text-[10px] text-zinc-700 shadow-lg shadow-zinc-200/70 pointer-events-none whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:shadow-black/30"
          style={{
            left: hovered.x,
            top: hovered.y - 38,
            transform: 'translateX(-50%)',
          }}
        >
          {hovered.date}
          {hovered.value > 0 && (
            <span className="ml-1 text-blue-600 dark:text-blue-300">
              · {formatMetricValue(hovered.value, metric)} {getMetricUnit(metric)}
            </span>
          )}
        </div>
      )}

      {selectedDay && selectedDay.activities.length > 0 && selectedDateValue && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                {formatDateLabel(selectedDateValue)}
              </p>
              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                {t('stats.dayRunSummary', '{{count}} 次跑步 · {{value}} {{unit}}', {
                  count: selectedDay.activities.length,
                  value: formatMetricValue(selectedDay.value, metric),
                  unit: getMetricUnit(metric),
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label={t('common.close', '关闭')}
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-2 space-y-1.5">
            {selectedDay.activities.map((activity) => (
              <Link
                key={activity.id}
                href={`/activities/${activity.id}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    {activity.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                    {formatDistance(activity.distance, 'km')} · {formatPace(activity.distance, activity.moving_time, 'min/km')}
                  </p>
                </div>
                <ChevronRight size={14} className="shrink-0 text-zinc-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-3">
        <span className="font-mono text-[9px] text-zinc-400">
          {isReverseMetric ? (isZh ? '慢' : 'Slow') : (isZh ? '少' : 'Less')}
        </span>
        {COLOR_CLASSES.map((cls, i) => (
          <div key={i} className={`h-[11px] w-[11px] rounded-[3px] ${cls}`} />
        ))}
        <span className="font-mono text-[9px] text-zinc-400">
          {isReverseMetric ? (isZh ? '快' : 'Fast') : (isZh ? '多' : 'More')}
        </span>
      </div>
    </div>
  );
}
