'use client';

import React, { useMemo, useState } from 'react';
import { StravaActivity } from '@/types';
import { ActivityCalendarHeatmap } from '@/components/ActivityCalendarHeatmap';
import { VolumeBarChart } from '@/components/charts/VolumeBarChart';
import { aggregateActivities, getAvailableYears } from '@/lib/stats';
import { ChevronLeft, ChevronRight, CalendarRange, BarChart3 } from 'lucide-react';
import { formatDistance, formatDuration } from '@/lib/strava';
import { getActivityDate } from '@/lib/dates';

interface MeStatsProps {
  activities: StravaActivity[];
}

export function MeStats({ activities }: MeStatsProps) {
  const years = useMemo(() => getAvailableYears(activities), [activities]);
  const [selectedYear, setSelectedYear] = useState(() => years[years.length - 1] || new Date().getFullYear());

  const yearChartData = useMemo(
    () => aggregateActivities(activities, 'year', selectedYear, 'distance', 'zh'),
    [activities, selectedYear]
  );
  const selectedYearActivities = useMemo(
    () => activities.filter((activity) => getActivityDate(activity).getFullYear() === selectedYear),
    [activities, selectedYear]
  );
  const selectedYearDistance = selectedYearActivities.reduce((sum, activity) => sum + activity.distance, 0);
  const selectedYearDuration = selectedYearActivities.reduce((sum, activity) => sum + activity.moving_time, 0);

  const yearIndex = years.indexOf(selectedYear);
  const canPrev = yearIndex > 0;
  const canNext = yearIndex < years.length - 1;

  return (
    <section className="px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase text-amber-300">
              <BarChart3 size={14} />
              training stats
            </div>
            <h2 className="text-lg font-black text-zinc-100">训练统计</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right text-[10px] text-zinc-500">
            <span>{selectedYear} 年</span>
            <span>{formatDistance(selectedYearDistance)}</span>
            <span>{formatDuration(selectedYearDuration)}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80">
          <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            <span className="text-xs font-bold text-zinc-300">年度跑量对比</span>
            <p className="mt-1 text-[10px] text-zinc-600">按年份汇总全部跑步距离</p>
          </div>
          <div className="p-3 sm:p-4">
            <VolumeBarChart
              data={yearChartData}
              metric="distance"
              colors={{
                bar: 'rgba(34, 211, 238, 0.46)',
                barStroke: 'rgba(34, 211, 238, 0.72)',
                currentBar: 'rgba(251, 191, 36, 0.86)',
                currentBarStroke: 'rgba(251, 191, 36, 1)',
              }}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
                <CalendarRange size={14} className="text-amber-300" />
                训练日历
              </div>
              <p className="mt-1 text-[10px] text-zinc-600">查看每一年的训练密度</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => canPrev && setSelectedYear(years[yearIndex - 1])}
                disabled={!canPrev}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-30"
                aria-label="上一年"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-[56px] rounded-md border border-zinc-800 bg-black/30 px-2 py-1.5 text-center text-xs font-bold text-zinc-200">
                {selectedYear}
              </span>
              <button
                onClick={() => canNext && setSelectedYear(years[yearIndex + 1])}
                disabled={!canNext}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-30"
                aria-label="下一年"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="p-4 overflow-x-auto">
            <ActivityCalendarHeatmap
              activities={activities}
              year={selectedYear}
              metric="distance"
              colorClasses={[
                'bg-zinc-800',
                'bg-cyan-950/70',
                'bg-cyan-700',
                'bg-cyan-400',
                'bg-amber-300',
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
