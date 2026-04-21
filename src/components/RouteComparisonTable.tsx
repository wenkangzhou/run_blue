'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StravaActivity } from '@/types';
import { formatDistance, formatDuration, formatPace, formatDate } from '@/lib/strava';
import { TrendingUp } from 'lucide-react';

interface RouteComparisonTableProps {
  activities: StravaActivity[];
}

export function RouteComparisonTable({ activities }: RouteComparisonTableProps) {
  const { t, i18n } = useTranslation();
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
    <div className="overflow-x-auto -mx-2 scrollbar-hide">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="border-b-2 border-zinc-200 dark:border-zinc-700">
            <th className="text-left py-2 px-3 font-mono text-[10px] uppercase text-zinc-500">
              {t('activity.date')}
            </th>
            <th className="text-right py-2 px-3 font-mono text-[10px] uppercase text-zinc-500">
              {t('activity.distance')}
            </th>
            <th className="text-right py-2 px-3 font-mono text-[10px] uppercase text-zinc-500">
              {t('activity.time')}
            </th>
            <th className="text-right py-2 px-3 font-mono text-[10px] uppercase text-zinc-500">
              {t('activity.pace')}
            </th>
            <th className="text-right py-2 px-3 font-mono text-[10px] uppercase text-zinc-500">
              {t('activity.heartRate')}
            </th>
            <th className="text-right py-2 px-3 font-mono text-[10px] uppercase text-zinc-500">
              {t('activity.elevation')}
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
                <td className="py-2 px-3 font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    {isBestPace && (
                      <TrendingUp size={12} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                    )}
                    {formatDate(activity.start_date_local, locale)}
                  </div>
                </td>
                <td className="py-2 px-3 font-mono text-xs text-right">
                  {formatDistance(activity.distance, 'km')}
                </td>
                <td className="py-2 px-3 font-mono text-xs text-right">
                  {formatDuration(activity.moving_time)}
                </td>
                <td className={`py-2 px-3 font-mono text-xs text-right font-bold ${isBestPace ? 'text-green-600 dark:text-green-400' : ''}`}>
                  {activity.distance > 0 && activity.moving_time > 0
                    ? formatPace(activity.distance, activity.moving_time, 'min/km')
                    : '--'}
                </td>
                <td className="py-2 px-3 font-mono text-xs text-right">
                  {activity.has_heartrate && activity.average_heartrate
                    ? `${Math.round(activity.average_heartrate)} bpm`
                    : '--'}
                </td>
                <td className="py-2 px-3 font-mono text-xs text-right">
                  {activity.total_elevation_gain > 0
                    ? `${Math.round(activity.total_elevation_gain)} m`
                    : '--'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
