'use client';

import React from 'react';
import { ActivityLap } from '@/types';
import { formatDuration, formatDistance, formatPace } from '@/lib/strava';

interface LapsTableProps {
  laps: ActivityLap[];
}

export function LapsTable({ laps }: LapsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-zinc-800 dark:border-zinc-200">
            <th className="text-left py-2 px-2 font-mono text-xs uppercase">圈</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase">距离</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase">时间</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase">配速</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase hidden sm:table-cell">爬升</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase hidden sm:table-cell">心率</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap, index) => (
            <tr 
              key={lap.id || index}
              className="border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <td className="py-3 px-2 font-mono text-sm">{lap.name || index + 1}</td>
              <td className="text-right py-3 px-2 font-mono text-sm">
                {formatDistance(lap.distance, 'km')}
              </td>
              <td className="text-right py-3 px-2 font-mono text-sm">
                {formatDuration(lap.moving_time)}
              </td>
              <td className="text-right py-3 px-2 font-mono text-sm font-bold">
                {formatPace(lap.distance, lap.moving_time, 'min/km')}
              </td>
              <td className="text-right py-3 px-2 font-mono text-sm hidden sm:table-cell">
                +{Math.round(lap.total_elevation_gain)} m
              </td>
              <td className="text-right py-3 px-2 font-mono text-sm hidden sm:table-cell">
                {lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
