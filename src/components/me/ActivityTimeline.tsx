'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { StravaActivity } from '@/types';
import { formatDistance, formatDuration } from '@/lib/strava';
import { ChevronDown, ChevronRight, Clock, TrendingUp, Mountain, ListOrdered } from 'lucide-react';
import { formatLocalDateKey, getActivityDate, getActivityYear } from '@/lib/dates';
import { useActivitiesStore } from '@/store/activities';

interface ActivityTimelineProps {
  activities: StravaActivity[];
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const [expandedYears, setExpandedYears] = useState<Set<number>>(
    () => new Set(activities[0] ? [getActivityYear(activities[0])] : [])
  );

  const grouped = useMemo(() => {
    const map = new Map<number, StravaActivity[]>();
    activities.forEach((a) => {
      const year = getActivityYear(a);
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
    <section className="px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase text-fuchsia-300">
            <ListOrdered size={14} />
            activity archive
          </div>
          <h2 className="text-lg font-black text-zinc-100">年度记录</h2>
          <p className="mt-1 text-xs text-zinc-600">{activities.length} 条跑步记录，按年份归档</p>
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
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-zinc-900/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          {isExpanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
          <span className="text-sm font-bold text-zinc-300">{year}</span>
          <span className="text-[10px] text-zinc-600">{acts.length} 次跑步</span>
        </div>
        <div className="hidden items-center gap-4 text-[10px] text-zinc-600 sm:flex">
          <span>{(totalDist / 1000).toFixed(0)} km</span>
          <span>{Math.floor(totalTime / 3600)}h</span>
          <span>{Math.round(totalElev)}m</span>
        </div>
      </button>

      {isExpanded && (
        <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {acts.slice(0, 30).map((act) => (
            <ActivityCard key={act.id} act={act} />
          ))}
          {acts.length > 30 && (
            <div className="py-2 text-center text-[10px] text-zinc-600 sm:col-span-2 lg:col-span-3">
              还有 {acts.length - 30} 条 {year} 年记录
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityCard({ act }: { act: StravaActivity }) {
  const selectActivity = useActivitiesStore((state) => state.selectActivity);
  const date = getActivityDate(act);
  const pace = act.distance > 0 ? act.moving_time / (act.distance / 1000) : 0;
  const min = Math.floor(pace / 60);
  const sec = Math.floor(pace % 60);
  const primeActivity = React.useCallback(() => {
    selectActivity(act);
  }, [act, selectActivity]);

  return (
    <Link
      href={`/activities/${act.id}`}
      className="group block rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3 transition-colors hover:border-cyan-500/40 hover:bg-zinc-900/70"
      onClick={primeActivity}
      onFocus={primeActivity}
      onPointerDown={primeActivity}
      onPointerEnter={primeActivity}
      prefetch
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs text-zinc-300 transition-colors group-hover:text-cyan-200">
            {act.name}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-600">
            {formatLocalDateKey(date)}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
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
          {`${min}'${sec.toString().padStart(2, '0')}" /km`}
        </div>
      )}
    </Link>
  );
}
