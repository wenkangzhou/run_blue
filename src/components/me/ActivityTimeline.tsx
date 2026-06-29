'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { StravaActivity } from '@/types';
import { formatDistance, formatDuration } from '@/lib/strava';
import { ChevronDown, ChevronRight, Clock, TrendingUp, Mountain, ListOrdered, Route } from 'lucide-react';
import { formatLocalDateKey, getActivityDate, getActivityYear } from '@/lib/dates';
import { useActivitiesStore } from '@/store/activities';
import { formatPaceSeconds } from '@/lib/paceFormat';
import { useSessionPageState } from '@/hooks/useSessionPageState';

interface ActivityTimelineProps {
  activities: StravaActivity[];
}

const INITIAL_VISIBLE_ACTIVITIES = 12;
const ME_TIMELINE_STATE_KEY = 'run_blue_page:me:timeline';

interface TimelinePageState {
  expandedYears: number[];
  showAllYears: number[];
}

function isTimelinePageState(value: unknown): value is TimelinePageState {
  if (!value || typeof value !== 'object') return false;
  const state = value as TimelinePageState;
  return Array.isArray(state.expandedYears)
    && state.expandedYears.every(Number.isInteger)
    && Array.isArray(state.showAllYears)
    && state.showAllYears.every(Number.isInteger);
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const grouped = useMemo(() => {
    const map = new Map<number, StravaActivity[]>();
    activities.forEach((a) => {
      const year = getActivityYear(a);
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(a);
    });
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [activities]);

  const [pageState, setPageState] = useSessionPageState<TimelinePageState>(
    ME_TIMELINE_STATE_KEY,
    () => ({
      expandedYears: grouped[0] ? [grouped[0][0]] : [],
      showAllYears: [],
    }),
    isTimelinePageState
  );
  const expandedYears = useMemo(() => new Set(pageState.expandedYears), [pageState.expandedYears]);
  const showAllYears = useMemo(() => new Set(pageState.showAllYears), [pageState.showAllYears]);

  const toggleYear = (year: number) => {
    setPageState((prev) => {
      const next = new Set(prev.expandedYears);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return { ...prev, expandedYears: Array.from(next) };
    });
  };

  const toggleShowAll = (year: number) => {
    setPageState((prev) => {
      const next = new Set(prev.showAllYears);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return { ...prev, showAllYears: Array.from(next) };
    });
  };

  return (
    <section className="px-4 py-5 sm:py-7">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-fuchsia-300">
              <ListOrdered size={14} />
              activity archive
            </div>
            <h2 className="text-lg font-black text-zinc-100">年度记录</h2>
            <p className="mt-1 text-xs text-zinc-600">{activities.length} 条跑步记录，按年份归档</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
            <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1">
              {grouped.length} 个年份
            </span>
            {grouped[0] && (
              <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2.5 py-1 text-fuchsia-200">
                最近 {grouped[0][0]}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {grouped.map(([year, acts]) => (
            <YearGroup
              key={year}
              year={year}
              acts={acts}
              isExpanded={expandedYears.has(year)}
              showAll={showAllYears.has(year)}
              onToggle={() => toggleYear(year)}
              onToggleShowAll={() => toggleShowAll(year)}
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
  showAll,
  onToggle,
  onToggleShowAll,
}: {
  year: number;
  acts: StravaActivity[];
  isExpanded: boolean;
  showAll: boolean;
  onToggle: () => void;
  onToggleShowAll: () => void;
}) {
  const totalDist = acts.reduce((s, a) => s + a.distance, 0);
  const totalTime = acts.reduce((s, a) => s + a.moving_time, 0);
  const totalElev = acts.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
  const visibleActs = showAll ? acts : acts.slice(0, INITIAL_VISIBLE_ACTIVITIES);
  const hasHiddenActs = acts.length > visibleActs.length;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70 shadow-lg shadow-black/10">
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-900/60 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-black/25 text-zinc-500">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-black text-zinc-200">{year}</span>
              <span className="text-[10px] text-zinc-600">{acts.length} 次跑步</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-zinc-600">
              {formatLocalDateKey(getActivityDate(acts[acts.length - 1]))} - {formatLocalDateKey(getActivityDate(acts[0]))}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[260px]">
          <YearPill icon={<Route size={11} />} label="距离" value={`${(totalDist / 1000).toFixed(0)} km`} />
          <YearPill icon={<Clock size={11} />} label="时间" value={`${Math.floor(totalTime / 3600)}h`} />
          <YearPill icon={<Mountain size={11} />} label="爬升" value={`${Math.round(totalElev)}m`} />
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleActs.map((act) => (
              <ActivityCard key={act.id} act={act} />
            ))}
          </div>
          {acts.length > 30 && (
            <button
              type="button"
              onClick={onToggleShowAll}
              className="mt-3 w-full rounded-md border border-zinc-800 px-3 py-2 text-center text-[10px] font-bold text-zinc-500 transition-colors hover:border-cyan-500/40 hover:text-cyan-200"
            >
              {hasHiddenActs ? `展开剩余 ${acts.length - visibleActs.length} 条 ${year} 年记录` : `收起到最近 ${INITIAL_VISIBLE_ACTIVITIES} 条`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function YearPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="min-w-0 rounded-md border border-zinc-800 bg-black/25 px-2 py-1.5">
      <span className="flex items-center gap-1 text-[9px] text-zinc-600">
        {icon}
        {label}
      </span>
      <span className="mt-0.5 block truncate text-[10px] font-bold text-zinc-300">{value}</span>
    </span>
  );
}

function ActivityCard({ act }: { act: StravaActivity }) {
  const selectActivity = useActivitiesStore((state) => state.selectActivity);
  const date = getActivityDate(act);
  const pace = act.distance > 0 ? act.moving_time / (act.distance / 1000) : 0;
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
          {formatPaceSeconds(pace)} /km
        </div>
      )}
    </Link>
  );
}
