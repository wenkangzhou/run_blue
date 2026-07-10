'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityStream, StravaActivity } from '@/types';
import { formatPace, formatGearDistance } from '@/lib/strava';
import { buildActivityWeatherContext, formatWeatherContextSummary, getThermalContext, getWeatherSourceLabel } from '@/lib/weather';

interface ActivityStatsProps {
  activity: StravaActivity;
  streams?: Record<string, ActivityStream> | null;
}

type ActivityStat = {
  label: string;
  value: string | React.ReactNode;
  title?: string;
  wide?: boolean;
};

export function ActivityStats({ activity, streams }: ActivityStatsProps) {
  const { t, i18n } = useTranslation();
  const gearDistance = activity.gear ? formatGearDistance(activity.gear.distance) : null;
  const weather = buildActivityWeatherContext(activity, streams);
  const thermalContext = getThermalContext(weather, i18n.language);
  
  const stats: ActivityStat[] = [
    { label: t('activity.averagePace', '平均配速'), value: formatPace(activity.distance, activity.moving_time, 'min/km') },
    { label: t('activity.maxPace', '最快配速'), value: activity.max_speed ? formatPace(1000, 1000 / activity.max_speed, 'min/km') : '--' },
    ...(activity.average_heartrate ? [{ label: t('activity.averageHeartRate', '平均心率'), value: `${Math.round(activity.average_heartrate)} bpm` }] : []),
    ...(activity.max_heartrate ? [{ label: t('activity.maxHeartRate', '最大心率'), value: `${Math.round(activity.max_heartrate)} bpm` }] : []),
    ...(activity.average_watts ? [{ label: t('activity.averagePower', '平均功率'), value: `${Math.round(activity.average_watts)} W` }] : []),
    ...(activity.max_watts ? [{ label: t('activity.maxPower', '最大功率'), value: `${Math.round(activity.max_watts)} W` }] : []),
    ...(activity.weighted_average_watts ? [{ label: t('activity.weightedPower', '加权功率'), value: `${Math.round(activity.weighted_average_watts)} W` }] : []),
    { label: t('activity.elevationGain', '爬升'), value: `${Math.round(activity.total_elevation_gain)} m` },
    ...(activity.elev_high ? [{ label: t('activity.maxElevation', '最高海拔'), value: `${Math.round(activity.elev_high)} m` }] : []),
    ...(activity.elev_low ? [{ label: t('activity.minElevation', '最低海拔'), value: `${Math.round(activity.elev_low)} m` }] : []),
    ...(activity.calories ? [{ label: t('activity.calories', '卡路里'), value: `${activity.calories} kcal` }] : []),
    ...(activity.average_cadence ? [{ label: t('activity.cadence', '步频'), value: `${Math.round(activity.average_cadence)} spm` }] : []),
    ...(weather.hasWeather ? [{
      label: t('activity.weather', '天气'),
      title: `${formatWeatherContextSummary(weather, i18n.language)} · ${getWeatherSourceLabel(weather, i18n.language)}`,
      wide: true,
      value: (
        <span className="block min-w-0">
          <span className="block font-mono text-sm font-bold leading-5 text-zinc-900 dark:text-zinc-100">
            {formatWeatherContextSummary(weather, i18n.language)}
          </span>
          <span className="mt-1 block font-mono text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
            {thermalContext.label} · {getWeatherSourceLabel(weather, i18n.language)}
          </span>
        </span>
      ),
    }] : []),
    ...(activity.gear ? [{
      label: t('activity.gear', '装备'),
      title: `${activity.gear.name}${gearDistance ? ` (${gearDistance})` : ''}`,
      wide: true,
      value: (
        <span className="block min-w-0">
          <span className="block whitespace-normal break-words font-mono text-sm font-bold leading-5 text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-100">
            {activity.gear.name}
          </span>
          {gearDistance && (
            <span className="mt-1 block font-mono text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              {t('gear.officialDistance', '官方里程')} {gearDistance}
            </span>
          )}
        </span>
      ),
    }] : []),
    ...(activity.device_name ? [{
      label: t('activity.device', '设备'),
      value: activity.device_name,
      title: activity.device_name,
      wide: true,
    }] : []),
  ];

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs font-bold uppercase text-zinc-500">
          {t('activity.details', '活动资料')}
        </h2>
        <span className="font-mono text-[10px] text-zinc-400">{stats.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-100 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={`${stat.wide ? 'col-span-2' : ''} min-w-0 bg-white p-3 dark:bg-zinc-900`}
          >
            <p className="mb-1 truncate font-mono text-[10px] text-zinc-500">{stat.label}</p>
            {typeof stat.value === 'string' ? (
              <p
                className={`${stat.wide ? 'whitespace-normal break-words text-sm leading-5 [overflow-wrap:anywhere]' : 'truncate text-xs'} font-mono font-bold text-zinc-900 dark:text-zinc-100`}
                title={stat.title || stat.value}
              >
                {stat.value}
              </p>
            ) : (
              <div title={stat.title}>{stat.value}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
