'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { StravaActivity } from '@/types';
import { formatDistance, formatDuration } from '@/lib/strava';
import { ChevronDown, ChevronRight, Clock, TrendingUp, Mountain } from 'lucide-react';

interface ActivityTimelineProps {
  activities: StravaActivity[];
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  // All collapsed by default

  const grouped = useMemo(() => {
    const map = new Map<number, StravaActivity[]>();
    activities.forEach((a) => {
      const year = new Date(a.start_date).getFullYear();
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [activities]);

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <section className="px-4 py-8 sm:py-12">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-zinc-200 tracking-wider">ARCHIVE_BY_YEAR</h2>
          <p className="text-[10px] text-zinc-600 mt-1">{activities.length} RECORDS // GROUPED</p>
        </div>

        <div className="space-y-3">
          {grouped.map(([year, acts]) => (
            <YearGroup
              key={year}
              year={year}
              acts={acts}
              isExpanded={expandedYears.has(year)}
              onToggle={() => toggleYear(year)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function YearGroup({
  year,
  acts,
  isExpanded,
  onToggle,
}: {
  year: number;
  acts: StravaActivity[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const totalDist = acts.reduce((s, a) => s + a.distance, 0);
  const totalTime = acts.reduce((s, a) => s + a.moving_time, 0);
  const totalElev = acts.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);

  return (
    <div className="border border-zinc-800 bg-zinc-950/40">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-900/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          <span className="text-sm font-bold text-zinc-300">{year}</span>
          <span className="text-[10px] text-zinc-600">{acts.length} runs</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[10px] text-zinc-600">
          <span>{(totalDist / 1000).toFixed(0)} km</span>
          <span>{Math.floor(totalTime / 3600)}h</span>
          <span>{Math.round(totalElev)}m</span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {acts.slice(0, 30).map((act) => (
            <ActivityCard key={act.id} act={act} />
          ))}
          {acts.length > 30 && (
            <div className="text-[10px] text-zinc-600 py-2 text-center sm:col-span-2 lg:col-span-3">
              + {acts.length - 30} more runs in {year}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityCard({ act }: { act: StravaActivity }) {
  const date = new Date(act.start_date);
  const pace = act.distance > 0 ? act.moving_time / (act.distance / 1000) : 0;
  const min = Math.floor(pace / 60);
  const sec = Math.floor(pace % 60);

  return (
    <div className="border border-zinc-800/60 bg-zinc-900/20 p-3 hover:border-zinc-600 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-zinc-300 truncate group-hover:text-green-400 transition-colors">
            {act.name}
          </div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            {date.getFullYear()}-{String(date.getMonth() + 1).padStart(2, '0')}-{String(date.getDate()).padStart(2, '0')}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <TrendingUp size={10} />
          {formatDistance(act.distance)}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {formatDuration(act.moving_time)}
        </span>
        <span className="flex items-center gap-1">
          <Mountain size={10} />
          {Math.round(act.total_elevation_gain || 0)}m
        </span>
      </div>
      {pace > 0 && (
        <div className="mt-1 text-[10px] text-zinc-600">
          {min}'{sec.toString().padStart(2, '0')}" /km
        </div>
      )}
    </div>
  );
}
