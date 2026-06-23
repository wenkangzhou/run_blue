'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { StravaActivity } from '@/types';
import { ActivityCalendarHeatmap } from '@/components/ActivityCalendarHeatmap';
import { VolumeBarChart } from '@/components/charts/VolumeBarChart';
import { aggregateActivities, getAvailableYears } from '@/lib/stats';
import { ChevronLeft, ChevronRight, CalendarRange, BarChart3, Clock3, Footprints, Gauge, Route } from 'lucide-react';
import { formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { getActivityDate } from '@/lib/dates';

interface MeStatsProps {
  activities: StravaActivity[];
}

export function MeStats({ activities }: MeStatsProps) {
  const years = useMemo(() => getAvailableYears(activities), [activities]);
  const [selectedYear, setSelectedYear] = useState(() => years[years.length - 1] || new Date().getFullYear());

  useEffect(() => {
    if (years.length === 0) return;
    setSelectedYear((year) => years.includes(year) ? year : years[years.length - 1]);
  }, [years]);

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
  const selectedYearPace = selectedYearDistance > 0
    ? formatPace(selectedYearDistance, selectedYearDuration, 'min/km')
    : '--';
  const selectedYearLongestRun = selectedYearActivities.reduce<StravaActivity | null>(
    (longest, activity) => !longest || activity.distance > longest.distance ? activity : longest,
    null
  );

  const yearIndex = years.indexOf(selectedYear);
  const canPrev = yearIndex > 0;
  const canNext = yearIndex < years.length - 1;

  return (
    <section className="px-4 py-5 sm:py-7">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80">
          <div className="flex flex-col gap-4 border-b border-zinc-800 bg-zinc-950 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
                <BarChart3 size={14} />
                training stats
              </div>
              <h2 className="text-lg font-black text-zinc-100">训练统计</h2>
              <p className="mt-1 text-xs text-zinc-600">按年份查看跑量、密度和节奏变化</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => canPrev && setSelectedYear(years[yearIndex - 1])}
                disabled={!canPrev}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300 disabled:opacity-30"
                aria-label="上一年"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-[76px] rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-center text-xs font-black text-amber-100">
                {selectedYear}
              </span>
              <button
                onClick={() => canNext && setSelectedYear(years[yearIndex + 1])}
                disabled={!canNext}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300 disabled:opacity-30"
                aria-label="下一年"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-4">
            <YearStat icon={<Route size={14} />} label="年度跑量" value={formatDistance(selectedYearDistance)} />
            <YearStat icon={<Footprints size={14} />} label="跑步次数" value={`${selectedYearActivities.length} 次`} />
            <YearStat icon={<Gauge size={14} />} label="平均配速" value={selectedYearPace} />
            <YearStat icon={<Clock3 size={14} />} label="累计时长" value={formatDuration(selectedYearDuration)} />
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-zinc-800 px-3 py-3 text-[10px] text-zinc-500 sm:grid-cols-4">
            <span>{selectedYear} 年</span>
            <span>{formatDistance(selectedYearDistance)}</span>
            <span>{formatDuration(selectedYearDuration)}</span>
            <span>{selectedYearLongestRun ? `最长 ${formatDistance(selectedYearLongestRun.distance)}` : '最长 --'}</span>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 shadow-lg shadow-black/10">
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

          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 shadow-lg shadow-black/10">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
                  <CalendarRange size={14} className="text-amber-300" />
                  训练日历
                </div>
                <p className="mt-1 text-[10px] text-zinc-600">查看每一年的训练密度</p>
              </div>
              <span className="rounded-md border border-zinc-800 bg-black/30 px-2.5 py-1.5 text-xs font-bold text-zinc-300">
                {selectedYear}
              </span>
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
      </div>
    </section>
  );
}

function YearStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-amber-300">
        {icon}
        <span className="text-[10px] text-zinc-500">{label}</span>
      </div>
      <div className="truncate text-sm font-black text-zinc-100">{value}</div>
    </div>
  );
}
