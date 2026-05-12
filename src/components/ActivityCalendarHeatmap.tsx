'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StravaActivity } from '@/types';
import { MetricType, getDailyAggregates, formatMetricValue, getMetricUnit } from '@/lib/stats';

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
  'bg-zinc-100 dark:bg-zinc-800',                           // 0
  'bg-blue-200 dark:bg-blue-900/40',                        // 1
  'bg-blue-400 dark:bg-blue-700',                           // 2
  'bg-blue-600 dark:bg-blue-500',                           // 3
  'bg-blue-800 dark:bg-blue-400',                           // 4
];

export function ActivityCalendarHeatmap({ activities, year, metric, colorClasses }: ActivityCalendarHeatmapProps) {
  const COLOR_CLASSES = colorClasses || DEFAULT_COLOR_CLASSES;
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const isZh = locale.startsWith('zh');
  const [hovered, setHovered] = useState<{ date: string; value: number; x: number; y: number } | null>(null);

  const dailyData = useMemo(() => {
    return getDailyAggregates(activities, year, metric);
  }, [activities, year, metric]);

  const { weeks, monthLabels, maxValue, totalRuns } = useMemo(() => {
    // Build date → value map
    const valueMap = new Map<string, number>();
    dailyData.forEach((d) => valueMap.set(d.date, d.value));

    // Find max value for color scaling
    const max = Math.max(...dailyData.map((d) => d.value), 1);

    // Count runs in this year
    const runs = dailyData.filter((d) => d.value > 0).length;

    // Find calendar start date (first Monday before or on Jan 1)
    const jan1 = new Date(year, 0, 1);
    const jan1Day = jan1.getDay(); // 0=Sun, 1=Mon...
    // If Jan 1 is Monday (1), offset = 0. If Sunday (0), offset = -6.
    const offset = jan1Day === 0 ? -6 : 1 - jan1Day;
    const startDate = new Date(year, 0, 1 + offset);

    // Generate weeks
    const w: Date[][] = [];
    const ml: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;

    for (let wi = 0; wi < WEEKS_TO_SHOW; wi++) {
      const week: Date[] = [];
      for (let di = 0; di < 7; di++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + wi * 7 + di);
        week.push(d);
      }
      w.push(week);

      // Month label: if this week contains the 1st of a month
      const midDay = week[3]; // Thursday of this week
      if (midDay.getDate() <= 7 && midDay.getMonth() !== lastMonth) {
        lastMonth = midDay.getMonth();
        ml.push({
          weekIndex: wi,
          label: isZh
            ? `${midDay.getMonth() + 1}月`
            : midDay.toLocaleDateString('en-US', { month: 'short' }),
        });
      }
    }

    return { weeks: w, monthLabels: ml, maxValue: max, totalRuns: runs };
  }, [dailyData, year, isZh]);

  const getLevel = (value: number) => {
    if (value <= 0) return 0;
    const ratio = value / maxValue;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  const formatDateLabel = (date: Date) => {
    return isZh
      ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
      : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleMouseEnter = (date: Date, value: number, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setHovered({
      date: formatDateLabel(date),
      value,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-sm font-bold text-zinc-700 dark:text-zinc-300">
          {isZh ? `今年共跑步 ${totalRuns} 次` : `${totalRuns} runs this year`}
        </span>
      </div>

      {/* Grid with month labels */}
      <div className="overflow-x-auto pb-1">
        {/* Month labels row - aligned with week columns */}
        <div className="flex gap-[3px] ml-5 mb-1">
          {/* Spacer for day labels */}
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

        {/* Day labels + grid */}
        <div className="flex gap-[3px]">
          {/* Day labels */}
          <div className="flex flex-col gap-[3px] mr-1 flex-shrink-0">
            {(isZh ? DAY_LABELS_ZH : DAY_LABELS_EN).map((label, i) => (
              <div key={i} className="h-[10px] flex items-center">
                <span className="font-mono text-[9px] text-zinc-400 w-4 text-right">{label}</span>
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px] flex-shrink-0">
              {week.map((date, di) => {
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const value = dailyData.find((d) => d.date === key)?.value || 0;
                const level = getLevel(value);
                const isInYear = date.getFullYear() === year;
                return (
                  <div
                    key={di}
                    className={`w-[10px] h-[10px] rounded-[2px] ${isInYear ? COLOR_CLASSES[level] : 'bg-transparent'} cursor-pointer`}
                    onMouseEnter={(e) => isInYear && handleMouseEnter(date, value, e)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {hovered && (
        <div
          className="fixed z-50 bg-zinc-800 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            left: hovered.x,
            top: hovered.y - 32,
            transform: 'translateX(-50%)',
          }}
        >
          {hovered.date}
          {hovered.value > 0 && (
            <span className="ml-1 text-blue-300">
              · {formatMetricValue(hovered.value, metric)} {getMetricUnit(metric)}
            </span>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-3">
        <span className="font-mono text-[9px] text-zinc-400">{isZh ? '少' : 'Less'}</span>
        {COLOR_CLASSES.map((cls, i) => (
          <div key={i} className={`w-[10px] h-[10px] rounded-[2px] ${cls}`} />
        ))}
        <span className="font-mono text-[9px] text-zinc-400">{isZh ? '多' : 'More'}</span>
      </div>
    </div>
  );
}
