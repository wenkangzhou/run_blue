'use client';

import React from 'react';
import { ActivitySplit } from '@/types';
import { formatDuration, formatPace } from '@/lib/strava';

interface SplitsTableProps {
  splits: ActivitySplit[];
}

export function SplitsTable({ splits }: SplitsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-zinc-800 dark:border-zinc-200">
            <th className="text-left py-2 px-2 font-mono text-xs uppercase">分段</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase">距离</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase">时间</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase">配速</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase hidden sm:table-cell">爬升</th>
            <th className="text-right py-2 px-2 font-mono text-xs uppercase hidden sm:table-cell">心率</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split, index) => (
            <tr 
              key={index}
              className="border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <td className="py-3 px-2 font-mono text-sm">{split.split}</td>
              <td className="text-right py-3 px-2 font-mono text-sm">
                {(split.distance / 1000).toFixed(2)} km
              </td>
              <td className="text-right py-3 px-2 font-mono text-sm">
                {formatDuration(split.moving_time)}
              </td>
              <td className="text-right py-3 px-2 font-mono text-sm font-bold">
                {formatPace(split.distance, split.moving_time, 'min/km')}
              </td>
              <td className="text-right py-3 px-2 font-mono text-sm hidden sm:table-cell">
                {split.elevation_difference > 0 ? '+' : ''}{Math.round(split.elevation_difference)} m
              </td>
              <td className="text-right py-3 px-2 font-mono text-sm hidden sm:table-cell">
                {split.average_heartrate ? `${Math.round(split.average_heartrate)} bpm` : '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
