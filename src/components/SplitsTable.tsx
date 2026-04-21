'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StravaSplit } from '@/types';
import { formatDuration, formatPace } from '@/lib/strava';

interface SplitsTableProps {
  splits: StravaSplit[];
  showHeader?: boolean;
}

export function SplitsTable({ splits, showHeader = true }: SplitsTableProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto -mx-2 scrollbar-hide">
      <table className="w-full min-w-[400px]">
        {showHeader && (
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="text-left py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">km</th>
              <th className="text-right py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">{t('activity.time')}</th>
              <th className="text-right py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">{t('activity.pace')}</th>
              <th className="text-right py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">{t('activity.elevation')}</th>
              <th className="text-right py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">{t('activity.heartRate')}</th>
            </tr>
          </thead>
        )}
        <tbody>
          {splits.map((split, index) => (
            <tr 
              key={index} 
              className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <td className="py-1.5 px-2 font-mono text-xs">
                {split.split}
              </td>
              <td className="py-1.5 px-2 font-mono text-xs text-right">
                {formatDuration(split.moving_time)}
              </td>
              <td className="py-1.5 px-2 font-mono text-xs text-right font-bold">
                {split.moving_time > 0 ? formatPace(split.distance, split.moving_time, 'min/km') : '--:--'}
              </td>
              <td className="py-1.5 px-2 font-mono text-xs text-right">
                {split.elevation_difference > 0 ? `+${Math.round(split.elevation_difference)}` : Math.round(split.elevation_difference)}
              </td>
              <td className="py-1.5 px-2 font-mono text-xs text-right">
                {split.average_heartrate ? Math.round(split.average_heartrate) : '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
