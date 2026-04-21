'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { SavedRoute } from '@/store/routes';
import { StravaActivity } from '@/types';
import { PixelCard } from './ui';
import { RouteOnlyMap } from './map/RouteOnlyMap';
import { MapPin, TrendingUp, Clock, Calendar } from 'lucide-react';
import { formatDistance, formatPace, formatDuration } from '@/lib/strava';
import { getBestPaceActivity } from '@/lib/routeClustering';

interface RouteCardProps {
  route: SavedRoute;
  activities: StravaActivity[];
}

export function RouteCard({ route, activities }: RouteCardProps) {
  const { t } = useTranslation();

  const routeActivities = activities.filter((a) => route.activityIds.includes(a.id));
  const count = routeActivities.length;

  if (count === 0) {
    return (
      <PixelCard className="p-4">
        <p className="font-mono text-sm text-zinc-500">{t('routes.noActivities')}</p>
      </PixelCard>
    );
  }

  const sorted = [...routeActivities].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  const latest = sorted[0];
  const totalDistance = routeActivities.reduce((sum, a) => sum + a.distance, 0);
  const totalDuration = routeActivities.reduce((sum, a) => sum + a.moving_time, 0);
  const bestPaceActivity = getBestPaceActivity(routeActivities);
  const bestPace = bestPaceActivity
    ? formatPace(bestPaceActivity.distance, bestPaceActivity.moving_time, 'min/km')
    : '--';

  const polyline = latest.map?.summary_polyline || null;

  return (
    <Link href={`/routes/${encodeURIComponent(route.key)}`}>
      <PixelCard className="overflow-hidden hover:-translate-y-0.5 transition-transform">
        {/* Map Preview */}
        <div className="h-36 bg-zinc-100 dark:bg-zinc-800">
          {polyline && (
            <RouteOnlyMap polyline={polyline} height="100%" />
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h3 className="font-mono font-bold text-base truncate">{route.name}</h3>
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1">
                <MapPin size={12} />
                {route.key}
              </p>
            </div>
            <span className="shrink-0 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-mono text-xs border-2 border-blue-200 dark:border-blue-700">
              {count}{t('routes.runs', '次')}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-zinc-500">{t('stats.avgPace')}</p>
                <p className="font-mono text-xs font-bold truncate">{bestPace}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-zinc-500">{t('stats.totalTime')}</p>
                <p className="font-mono text-xs font-bold truncate">{formatDuration(totalDuration)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-orange-600 dark:text-orange-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-zinc-500">{t('stats.totalDistance')}</p>
                <p className="font-mono text-xs font-bold truncate">{formatDistance(totalDistance, 'km')}</p>
              </div>
            </div>
          </div>
        </div>
      </PixelCard>
    </Link>
  );
}
