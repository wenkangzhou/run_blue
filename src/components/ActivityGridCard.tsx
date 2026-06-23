'use client';

import React from 'react';
import Link from 'next/link';
import { StravaActivity } from '@/types';
import { RouteCanvasThumbnail } from '@/components/map/RouteCanvasThumbnail';
import { formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { getActivityDate } from '@/lib/dates';
import { useActivitiesStore } from '@/store/activities';

interface ActivityGridCardProps {
  activity: StravaActivity;
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function getActivityTag(activity: StravaActivity): string | null {
  const distanceKm = activity.distance / 1000;

  if (activity.workout_type === 1) return '比赛';
  if (activity.workout_type === 2 || distanceKm >= 15) return '长跑';
  if (activity.workout_type === 0) return '带娃';

  return null;
}

export const ActivityGridCard = React.memo(function ActivityGridCard({ activity }: ActivityGridCardProps) {
  const selectActivity = useActivitiesStore((state) => state.selectActivity);
  const date = getActivityDate(activity);
  const primeActivity = React.useCallback(() => {
    selectActivity(activity);
  }, [activity, selectActivity]);
  
  const month = MONTH_NAMES[date.getMonth()];
  const day = date.getDate();
  const distance = formatDistance(activity.distance, 'km');
  const duration = formatDuration(activity.moving_time);
  const pace = formatPace(activity.distance, activity.moving_time, 'min/km').replace('/km', '');
  const tag = getActivityTag(activity);

  return (
    <Link
      href={`/activities/${activity.id}`}
      className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
      onClick={primeActivity}
      onFocus={primeActivity}
      onPointerDown={primeActivity}
      onPointerEnter={primeActivity}
      aria-label={`${activity.name}，${distance}，${duration}`}
      prefetch
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-800">
        <div className="absolute inset-x-0 top-0 h-[58%] bg-zinc-100 dark:bg-zinc-800">
          <RouteCanvasThumbnail
            polyline={activity.map?.summary_polyline || null}
          />
        </div>

        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-lg border border-white/80 bg-white/90 px-1.5 py-1 shadow-sm backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-900/90">
          <span className="font-mono text-[9px] font-bold leading-none text-zinc-500 dark:text-zinc-400">{month}</span>
          <span className="font-mono text-xs font-bold leading-none text-zinc-900 dark:text-zinc-100">{day}</span>
        </div>

        {tag && (
          <div className="absolute right-2 top-2 rounded-lg bg-blue-600 px-1.5 py-1 font-mono text-[9px] font-bold leading-none text-white shadow-sm">
            {tag}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 min-h-[43%] border-t border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="min-w-0">
            <h3 className="truncate font-mono text-xs font-bold leading-tight text-zinc-950 dark:text-zinc-50">
              {activity.name}
            </h3>
            <p className="mt-1 font-mono text-[10px] text-zinc-400">
              {duration}
            </p>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="font-mono text-[9px] text-zinc-400">距离</p>
              <p className="truncate font-mono text-sm font-bold leading-tight text-zinc-950 dark:text-zinc-50">
                {distance}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] text-zinc-400">配速</p>
              <p className="truncate font-mono text-sm font-bold leading-tight text-blue-600 dark:text-blue-300">
                {pace}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
});
