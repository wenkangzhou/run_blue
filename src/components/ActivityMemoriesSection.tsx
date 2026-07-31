'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarClock, ChevronDown, Gauge, HeartPulse, Route, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StravaActivity } from '@/types';
import { findActivityMemories, type ActivityMemoryMatch } from '@/lib/activityMemories';
import { getActivityDateParts } from '@/lib/dates';
import { formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { RouteCanvasThumbnail } from '@/components/map/RouteCanvasThumbnail';
import { useActivitiesStore } from '@/store/activities';
import { useSessionPageState } from '@/hooks/useSessionPageState';

interface ActivityMemoriesSectionProps {
  activity: StravaActivity;
  activities: StravaActivity[];
}

export function ActivityMemoriesSection({ activity, activities }: ActivityMemoriesSectionProps) {
  const { t, i18n } = useTranslation();
  const selectActivity = useActivitiesStore((state) => state.selectActivity);
  const [expanded, setExpanded] = useSessionPageState<boolean>(
    `run_blue_page:activity:${activity.id}:memories-expanded`,
    false,
    (value): value is boolean => typeof value === 'boolean'
  );
  const memories = React.useMemo(
    () => findActivityMemories(activities, activity),
    [activities, activity]
  );

  if (memories.length === 0) return null;

  const isExact = memories[0].kind === 'same-day';

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={expanded
          ? t('activity.memoryCollapse', '收起跑步回忆')
          : t('activity.memoryExpand', '展开跑步回忆')}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-zinc-800/50 sm:p-5"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          <CalendarClock size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">
            {t('activity.memoryKicker', '跑步回忆')}
          </p>
          <h2 className="mt-0.5 text-lg font-black text-zinc-950 dark:text-zinc-50">
            {isExact
              ? t('activity.memoryExactTitle', '历史上的今天')
              : t('activity.memoryNearbyTitle', '去年此时')}
          </h2>
          <p className="mt-1 font-mono text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {isExact
              ? t('activity.memoryExactHint', '找到 {{count}} 次往年同日训练', { count: memories.length })
              : t('activity.memoryNearbyHint', '同日没有记录，展示去年最接近的一次训练')}
          </p>
        </div>
        <ChevronDown
          size={18}
          className={`mt-2 shrink-0 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && <div className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {memories.map((memory) => {
          const memoryActivity = memory.activity;
          const polyline = memoryActivity.map?.summary_polyline || memoryActivity.map?.polyline || null;
          const relation = getMemoryRelation(memory, t);
          const paceComparison = getPaceComparison(memoryActivity, activity, t);
          const primeActivity = () => selectActivity(memoryActivity);

          return (
            <Link
              key={memoryActivity.id}
              href={`/activities/${memoryActivity.id}`}
              prefetch
              onClick={primeActivity}
              onFocus={primeActivity}
              onPointerDown={primeActivity}
              onPointerEnter={primeActivity}
              aria-label={t('activity.openMemory', '查看往年活动：{{name}}', { name: memoryActivity.name })}
              className="group grid min-w-0 grid-cols-[116px_minmax(0,1fr)] bg-white transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:bg-zinc-900 dark:hover:bg-zinc-800/60 sm:grid-cols-[220px_minmax(0,1fr)]"
            >
              <div className="relative min-h-[176px] overflow-hidden border-r border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800 sm:min-h-[156px]">
                <RouteCanvasThumbnail polyline={polyline} />
                <span className="absolute left-2 top-2 rounded-md border border-white/80 bg-white/90 px-2 py-1 font-mono text-[10px] font-bold text-blue-700 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-blue-300">
                  {relation}
                </span>
              </div>

              <div className="flex min-w-0 flex-col justify-center p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] text-zinc-400">
                      {formatMemoryDate(memoryActivity, i18n.resolvedLanguage)}
                    </p>
                    <h3 className="mt-1 line-clamp-2 font-mono text-sm font-bold leading-snug text-zinc-950 dark:text-zinc-50 sm:text-base">
                      {memoryActivity.name}
                    </h3>
                  </div>
                  <ArrowUpRight
                    size={17}
                    className="mt-0.5 shrink-0 text-zinc-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                  />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                  <MemoryMetric
                    icon={<Route size={12} />}
                    label={t('activity.distance')}
                    value={formatDistance(memoryActivity.distance, 'km')}
                  />
                  <MemoryMetric
                    icon={<Gauge size={12} />}
                    label={t('activity.pace')}
                    value={formatPace(memoryActivity.distance, memoryActivity.moving_time, 'min/km')}
                  />
                  <MemoryMetric
                    icon={<Timer size={12} />}
                    label={t('activity.time')}
                    value={formatDuration(memoryActivity.moving_time)}
                  />
                  <MemoryMetric
                    icon={<HeartPulse size={12} />}
                    label={t('activity.averageHeartRate', '平均心率')}
                    value={memoryActivity.average_heartrate
                      ? `${Math.round(memoryActivity.average_heartrate)} bpm`
                      : '--'}
                  />
                </div>

                {paceComparison && (
                  <p className={`mt-3 font-mono text-[10px] font-bold ${paceComparison.tone}`}>
                    {paceComparison.label}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>}
    </section>
  );
}

function MemoryMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 font-mono text-[9px] text-zinc-400">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 truncate font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
        {value}
      </p>
    </div>
  );
}

function formatMemoryDate(activity: StravaActivity, language?: string): string {
  const parts = getActivityDateParts(activity);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return new Intl.DateTimeFormat(language?.startsWith('zh') ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function getMemoryRelation(
  memory: ActivityMemoryMatch,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (memory.kind === 'same-day') {
    return t('activity.memoryYearsAgo', '{{count}} 年前', { count: memory.yearsAgo });
  }
  if (memory.dayOffset < 0) {
    return t('activity.memoryDaysBefore', '去年 · 提前 {{count}} 天', { count: Math.abs(memory.dayOffset) });
  }
  if (memory.dayOffset > 0) {
    return t('activity.memoryDaysAfter', '去年 · 晚 {{count}} 天', { count: memory.dayOffset });
  }
  return t('activity.memoryLastYear', '去年此时');
}

function getPaceComparison(
  memoryActivity: StravaActivity,
  currentActivity: StravaActivity,
  t: ReturnType<typeof useTranslation>['t']
): { label: string; tone: string } | null {
  if (memoryActivity.distance <= 0 || currentActivity.distance <= 0) return null;
  const memoryPace = memoryActivity.moving_time / (memoryActivity.distance / 1000);
  const currentPace = currentActivity.moving_time / (currentActivity.distance / 1000);
  if (!Number.isFinite(memoryPace) || !Number.isFinite(currentPace)) return null;

  const difference = Math.round(memoryPace - currentPace);
  if (Math.abs(difference) <= 1) {
    return {
      label: t('activity.memoryPaceSimilar', '与本次配速接近'),
      tone: 'text-zinc-500 dark:text-zinc-400',
    };
  }
  if (difference < 0) {
    return {
      label: t('activity.memoryPaceFaster', '比本次快 {{count}} 秒/公里', { count: Math.abs(difference) }),
      tone: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  return {
    label: t('activity.memoryPaceSlower', '比本次慢 {{count}} 秒/公里', { count: difference }),
    tone: 'text-orange-600 dark:text-orange-400',
  };
}
