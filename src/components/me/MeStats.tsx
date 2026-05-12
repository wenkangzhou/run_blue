'use client';

import React, { useMemo, useState } from 'react';
import { StravaActivity } from '@/types';
import { ActivityCalendarHeatmap } from '@/components/ActivityCalendarHeatmap';
import { VolumeBarChart } from '@/components/charts/VolumeBarChart';
import { aggregateActivities, getAvailableYears } from '@/lib/stats';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MeStatsProps {
  activities: StravaActivity[];
}

export function MeStats({ activities }: MeStatsProps) {
  const years = useMemo(() => getAvailableYears(activities), [activities]);
  const [selectedYear, setSelectedYear] = useState(() => years[years.length - 1] || new Date().getFullYear());

  const yearChartData = useMemo(
    () => aggregateActivities(activities, 'year', selectedYear, 'distance', 'zh'),
    [activities]
  );

  const yearIndex = years.indexOf(selectedYear);
  const canPrev = yearIndex > 0;
  const canNext = yearIndex < years.length - 1;

  return (
    <section className="px-4 py-8 sm:py-12">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Year-over-year Chart */}
        <div className="border border-zinc-700 bg-zinc-950/80">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
              yearly_comparison — distance
            </span>
          </div>
          <div className="p-4">
            <VolumeBarChart
              data={yearChartData}
              metric="distance"
              colors={{
                bar: 'rgba(74, 222, 128, 0.6)',
                barStroke: 'rgba(74, 222, 128, 0.8)',
                currentBar: 'rgba(34, 197, 94, 0.8)',
                currentBarStroke: 'rgba(34, 197, 94, 1)',
              }}
            />
          </div>
        </div>

        {/* Calendar Heatmap */}
        <div className="border border-zinc-700 bg-zinc-950/80">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
              activity_calendar
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => canPrev && setSelectedYear(years[yearIndex - 1])}
                disabled={!canPrev}
                className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-bold text-zinc-200 min-w-[48px] text-center">
                {selectedYear}
              </span>
              <button
                onClick={() => canNext && setSelectedYear(years[yearIndex + 1])}
                disabled={!canNext}
                className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
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
                'bg-zinc-800',              // 0
                'bg-green-900/40',          // 1
                'bg-green-700',             // 2
                'bg-green-500',             // 3
                'bg-green-300',             // 4
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
