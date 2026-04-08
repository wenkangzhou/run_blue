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
      <div className="relative bg-white dark:bg-zinc-900 rounded-sm overflow-hidden aspect-[3/4] hover:ring-2 hover:ring-blue-500 transition-all border border-zinc-200 dark:border-zinc-700">
        {/* Route Preview - Takes up most of the card */}
        <div className="absolute inset-x-0 top-6 bottom-14 bg-zinc-50 dark:bg-zinc-800">
          <RouteOnlyMap 
            polyline={activity.map?.summary_polyline || null} 
            height="100%"
          />
        </div>

        {/* Date Overlay - Top */}
        <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-start bg-white/90 dark:bg-zinc-900/90">
          <span className="text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300">
            {month}
          </span>
          <span className="text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300">
            {day}
          </span>
        </div>

        {/* Distance & Time Overlay - Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-white dark:bg-zinc-900">
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
