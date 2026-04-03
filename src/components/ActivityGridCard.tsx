'use client';

import React from 'react';
import Link from 'next/link';
import { StravaActivity } from '@/types';
import { RouteOnlyMap } from '@/components/map/RouteOnlyMap';
import { formatDistance, formatDuration } from '@/lib/strava';

interface ActivityGridCardProps {
  activity: StravaActivity;
}

export function ActivityGridCard({ activity }: ActivityGridCardProps) {
  const date = new Date(activity.start_date);
  
  // Format month manually to avoid SSR issues
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();

  return (
    <Link href={`/activities/${activity.id}`} className="block">
      <div className="relative bg-zinc-100 dark:bg-zinc-800 rounded-sm overflow-hidden aspect-[3/4] hover:ring-2 hover:ring-blue-500 transition-all">
        {/* Route Preview - Takes up most of the card */}
        <div className="absolute inset-x-0 top-6 bottom-14">
          <RouteOnlyMap 
            polyline={activity.map?.summary_polyline || null} 
            height="100%"
          />
        </div>

        {/* Date Overlay - Top */}
        <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-start bg-gradient-to-b from-zinc-100/90 dark:from-zinc-800/90 to-transparent">
          <span className="text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300">
            {month}
          </span>
          <span className="text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300">
            {day}
          </span>
        </div>

        {/* Distance & Time Overlay - Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-zinc-100 dark:from-zinc-800 via-zinc-100/95 dark:via-zinc-800/95 to-transparent">
          <div className="text-center pt-2">
            <div className="font-mono font-bold text-base text-zinc-900 dark:text-zinc-100 leading-tight">
              {formatDistance(activity.distance, 'km').toUpperCase()}
            </div>
            <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
              {formatDuration(activity.moving_time)}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
