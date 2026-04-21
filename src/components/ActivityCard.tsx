'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { StravaActivity } from '@/types';
import { PixelCard, PixelBadge } from '@/components/ui';
import { MiniMap } from '@/components/map';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatDate,
} from '@/lib/strava';
import { useSettingsStore } from '@/store/settings';
import { MapPin, Clock, TrendingUp, Flame } from 'lucide-react';

interface ActivityCardProps {
  activity: StravaActivity;
  showMap?: boolean;
  compact?: boolean;
}

export function ActivityCard({ activity, showMap = false, compact = false }: ActivityCardProps) {
  const { t, i18n } = useTranslation();
  const { unit } = useSettingsStore();

  const isRun = activity.type === 'Run';
  const pace = unit === 'imperial' 
    ? formatPace(activity.distance, activity.moving_time, 'min/mi')
    : formatPace(activity.distance, activity.moving_time, 'min/km');

  if (compact) {
    return (
      <Link href={`/activities/${activity.id}`} className="block">
        <div className="flex items-center gap-3 p-3 border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
          <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
            {activity.map?.summary_polyline && (
              <MiniMap polyline={activity.map.summary_polyline} height="100%" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-mono font-bold text-sm truncate">{activity.name}</h3>
            <p className="font-mono text-xs text-zinc-500">
              {formatDate(activity.start_date_local, i18n.language === 'zh' ? 'zh-CN' : 'en-US')}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono font-bold text-sm">
              {formatDistance(activity.distance, unit === 'imperial' ? 'mi' : 'km')}
            </p>
            <p className="font-mono text-xs text-zinc-500">
              {formatDuration(activity.moving_time)}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <PixelCard className="overflow-hidden">
      {showMap && activity.map?.summary_polyline && (
        <MiniMap polyline={activity.map.summary_polyline} height="150px" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-mono font-bold text-lg truncate">
              {activity.name}
            </h3>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {formatDate(activity.start_date_local, i18n.language === 'zh' ? 'zh-CN' : 'en-US')}
            </p>
          </div>
          <PixelBadge variant={isRun ? 'primary' : 'default'}>
            {t(`activity.${activity.type.toLowerCase()}` as any) || activity.type}
          </PixelBadge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {t('activity.distance')}
              </p>
              <p className="font-mono font-bold truncate">
                {formatDistance(activity.distance, unit === 'imperial' ? 'mi' : 'km')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {t('activity.time')}
              </p>
              <p className="font-mono font-bold truncate">
                {formatDuration(activity.moving_time)}
              </p>
            </div>
          </div>

          {isRun && (
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {t('activity.pace')}
                </p>
                <p className="font-mono font-bold truncate">{pace}</p>
              </div>
            </div>
          )}

          {activity.total_elevation_gain > 0 && (
            <div className="flex items-center gap-2">
              <Flame size={16} className="text-orange-600 dark:text-orange-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {t('activity.elevation')}
                </p>
                <p className="font-mono font-bold truncate">
                  {Math.round(activity.total_elevation_gain)}m
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PixelCard>
  );
}
