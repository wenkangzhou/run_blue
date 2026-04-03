'use client';

import React from 'react';
import { StravaActivity } from '@/types';
import { formatDistance, formatDuration, formatPace, formatGearDistance } from '@/lib/strava';

interface ActivityStatsProps {
  activity: StravaActivity;
}

export function ActivityStats({ activity }: ActivityStatsProps) {
  const stats = [
    { label: '平均配速', value: formatPace(activity.distance, activity.moving_time, 'min/km') },
    { label: '最快配速', value: activity.max_speed ? formatPace(1000, 1000 / activity.max_speed, 'min/km') : '--' },
    ...(activity.average_heartrate ? [{ label: '平均心率', value: `${Math.round(activity.average_heartrate)} bpm` }] : []),
    ...(activity.max_heartrate ? [{ label: '最大心率', value: `${Math.round(activity.max_heartrate)} bpm` }] : []),
    ...(activity.average_watts ? [{ label: '平均功率', value: `${Math.round(activity.average_watts)} W` }] : []),
    ...(activity.max_watts ? [{ label: '最大功率', value: `${Math.round(activity.max_watts)} W` }] : []),
    ...(activity.weighted_average_watts ? [{ label: '加权功率', value: `${Math.round(activity.weighted_average_watts)} W` }] : []),
    { label: '爬升', value: `${Math.round(activity.total_elevation_gain)} m` },
    ...(activity.elev_high ? [{ label: '最高海拔', value: `${Math.round(activity.elev_high)} m` }] : []),
    ...(activity.elev_low ? [{ label: '最低海拔', value: `${Math.round(activity.elev_low)} m` }] : []),
    ...(activity.calories ? [{ label: '卡路里', value: `${activity.calories} kcal` }] : []),
    ...(activity.average_cadence ? [{ label: '步频', value: `${Math.round(activity.average_cadence)} spm` }] : []),
    ...(activity.average_temp ? [{ label: '温度', value: `${Math.round(activity.average_temp)}°C` }] : []),
  ];

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
      {stats.map((stat, index) => (
        <div 
          key={index}
          className="flex items-center justify-between py-1.5 px-3 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0"
        >
          <span className="font-mono text-xs text-zinc-500">{stat.label}</span>
          <span className="font-mono text-xs font-medium">{stat.value}</span>
        </div>
      ))}
      
      {activity.gear && (
        <div className="flex items-center justify-between py-1.5 px-3 border-t border-zinc-100 dark:border-zinc-800/50">
          <span className="font-mono text-xs text-zinc-500">装备</span>
          <span className="font-mono text-xs text-right truncate max-w-[60%]">
            {activity.gear.name} <span className="text-zinc-400">({formatGearDistance(activity.gear.distance)})</span>
          </span>
        </div>
      )}
      
      {activity.device_name && (
        <div className="flex items-center justify-between py-1.5 px-3 border-t border-zinc-100 dark:border-zinc-800/50">
          <span className="font-mono text-xs text-zinc-500">设备</span>
          <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{activity.device_name}</span>
        </div>
      )}
    </div>
  );
}
