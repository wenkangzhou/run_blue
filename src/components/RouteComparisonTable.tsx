'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { StravaActivity } from '@/types';
import { formatDistance, formatPace, formatDate } from '@/lib/strava';
import { MiniMap } from './map/MiniMap';
import { TrendingUp } from 'lucide-react';

interface RouteComparisonTableProps {
  activities: StravaActivity[];
}

export function RouteComparisonTable({ activities }: RouteComparisonTableProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  if (activities.length === 0) return null;

  const sorted = [...activities].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  // Find best pace
  let bestPace = Infinity;
  for (const a of sorted) {
    if (a.distance > 0 && a.moving_time > 0) {
      const pace = a.moving_time / (a.distance / 1000);
      if (pace < bestPace) bestPace = pace;
    }
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b-2 border-zinc-200 dark:border-zinc-700">
          <th className="text-left py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500 w-16">
            路线
          </th>
          <th className="text-left py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500">
            日期
          </th>
          <th className="text-right py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500">
            距离
          </th>
          <th className="text-right py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500">
            配速
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((activity) => {
          const paceSecPerKm =
            activity.distance > 0
              ? activity.moving_time / (activity.distance / 1000)
              : 0;
          const isBestPace = paceSecPerKm > 0 && paceSecPerKm === bestPace;

          return (
            <tr
              key={activity.id}
              className={`border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                isBestPace ? 'bg-green-50 dark:bg-green-900/10' : ''
              }`}
            >
              <td className="py-1 px-2 w-16">
                <Link
                  href={`/activities/${activity.id}`}
                  className="block rounded overflow-hidden border border-zinc-200 dark:border-zinc-700"
                  title={activity.name}
                >
                  <MiniMap
                    polyline={activity.map?.summary_polyline || null}
                    height="36px"
                  />
                </Link>
              </td>
              <td className="py-1 px-2 font-mono text-[11px] whitespace-nowrap">
                <Link
                  href={`/activities/${activity.id}`}
                  className="flex items-center gap-1 hover:underline"
                >
                  {isBestPace && (
                    <TrendingUp size={10} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                  )}
                  {formatDate(activity.start_date_local, locale)}
                </Link>
              </td>
              <td className="py-1 px-2 font-mono text-[11px] text-right whitespace-nowrap">
                <Link href={`/activities/${activity.id}`} className="hover:underline">
                  {formatDistance(activity.distance, 'km')}
                </Link>
              </td>
              <td
                className={`py-1 px-2 font-mono text-[11px] text-right whitespace-nowrap font-bold ${
                  isBestPace ? 'text-green-600 dark:text-green-400' : ''
                }`}
              >
                <Link href={`/activities/${activity.id}`} className="hover:underline">
                  {activity.distance > 0 && activity.moving_time > 0
                    ? formatPace(activity.distance, activity.moving_time, 'min/km')
                    : '--'}
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
