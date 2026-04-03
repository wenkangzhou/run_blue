'use client';

import React from 'react';
import { StravaLap } from '@/types';
import { formatDistance, formatDuration, formatPace } from '@/lib/strava';

interface LapsTableProps {
  laps: StravaLap[];
  showHeader?: boolean;
}

export function LapsTable({ laps, showHeader = true }: LapsTableProps) {
  return (
    <div className="overflow-x-auto -mx-2 scrollbar-hide">
      <table className="w-full min-w-[400px]">
        {showHeader && (
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="text-left py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">#</th>
              <th className="text-right py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">距离</th>
              <th className="text-right py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">时间</th>
              <th className="text-right py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">配速</th>
              <th className="text-right py-1 px-2 font-mono text-[10px] uppercase text-zinc-500">心率</th>
            </tr>
          </thead>
        )}
        <tbody>
          {laps.map((lap, index) => (
            <tr 
              key={lap.id || index} 
              className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <td className="py-1.5 px-2 font-mono text-xs">
                {lap.lap_index || index + 1}
              </td>
              <td className="py-1.5 px-2 font-mono text-xs text-right">
                {formatDistance(lap.distance, 'km')}
              </td>
              <td className="py-1.5 px-2 font-mono text-xs text-right">
                {formatDuration(lap.moving_time)}
              </td>
              <td className="py-1.5 px-2 font-mono text-xs text-right font-bold">
                {lap.moving_time > 0 ? formatPace(lap.distance, lap.moving_time, 'min/km') : '--:--'}
              </td>
              <td className="py-1.5 px-2 font-mono text-xs text-right">
                {lap.average_heartrate ? Math.round(lap.average_heartrate) : '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
