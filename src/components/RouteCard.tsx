'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { SavedRoute } from '@/store/routes';
import { StravaActivity } from '@/types';
import { PixelCard } from './ui';
import { RouteCardMap } from './map/RouteCardMap';
import { MapPin, TrendingUp, Calendar, Ruler, Layers, ShieldCheck } from 'lucide-react';
import { formatDistance, formatPace } from '@/lib/strava';
import { getBestPaceActivity } from '@/lib/routeClustering';
import { formatLocalDateKey, getActivityDate, getActivityTimestamp } from '@/lib/dates';

interface RouteCardProps {
  route: SavedRoute;
  activities: StravaActivity[];
  familySize?: number;
  familyRuns?: number;
  isFamilyTarget?: boolean;
}

export function RouteCard({
  route,
  activities,
  familySize = 1,
  familyRuns,
  isFamilyTarget = false,
}: RouteCardProps) {
  const { t } = useTranslation();

  const routeActivities = activities.filter((a) => route.activityIds.includes(a.id));
  const count = routeActivities.length;
  const hasRouteFamily = familySize > 1;
  const hasManualReview = Boolean(route.manualUpdatedAt || route.excludedActivityIds?.length);

  const sorted = count > 0
    ? [...routeActivities].sort(
        (a, b) => getActivityTimestamp(b) - getActivityTimestamp(a)
      )
    : [];

  const latest = sorted[0];
  const totalDistance = routeActivities.reduce((sum, a) => sum + a.distance, 0);
  const avgDistance = count > 0 ? totalDistance / count : route.distance;
  const bestPaceActivity = getBestPaceActivity(routeActivities);
  const bestPace = bestPaceActivity
    ? formatPace(bestPaceActivity.distance, bestPaceActivity.moving_time, 'min/km')
    : '--';
  const latestDate = latest ? formatLocalDateKey(getActivityDate(latest)) : '--';

  const polyline = latest?.map?.summary_polyline || route.polyline || null;

  return (
    <Link
      href={`/routes/${encodeURIComponent(route.key)}`}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
      aria-label={`${route.name}，${count}${t('routes.runs')}，${t('routes.averageSingleDistance', '单次约')} ${formatDistance(avgDistance, 'km')}`}
    >
      <PixelCard className="overflow-hidden rounded-xl border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-800">
        {/* Map Preview */}
        <div className="relative h-40 bg-zinc-100 dark:bg-zinc-800">
          {polyline ? (
            <RouteCardMap polyline={polyline} height="100%" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <MapPin size={32} className="text-zinc-300 dark:text-zinc-700" />
            </div>
          )}
          <div className="absolute left-2 top-2 rounded-lg border border-white/80 bg-white/90 px-2 py-1 font-mono text-[10px] font-bold text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-200">
            {formatDistance(avgDistance, 'km')}
          </div>
          {hasRouteFamily && (
            <div className={[
              'absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[10px] font-bold shadow-sm backdrop-blur',
              isFamilyTarget
                ? 'border border-blue-200 bg-blue-50/95 text-blue-700 dark:border-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                : 'border border-amber-200 bg-amber-50/95 text-amber-700 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
            ].join(' ')}>
              <Layers size={11} />
              {isFamilyTarget
                ? t('routes.routePrimaryVersion', '主版本')
                : t('routes.routePendingVersion', '待整理')}
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-mono font-bold text-base truncate">{route.name}</h3>
              </div>
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1">
                <MapPin size={12} />
                {count > 0
                  ? t('routes.routeCardMeta', '最近 {{date}} · 单次约 {{distance}}', {
                      date: latestDate,
                      distance: formatDistance(avgDistance, 'km'),
                    })
                  : t('routes.routePreview', '路线')}
              </p>
            </div>
            <span className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-xs font-bold text-blue-600 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
              {count > 0 ? `${count}${t('routes.runs')}` : t('routes.noActivities')}
            </span>
          </div>

          {(hasRouteFamily || hasManualReview) && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {hasRouteFamily && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-[10px] text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300">
                  <Layers size={10} />
                  {t('routes.routeFamilyCardHint', '{{versions}} 个版本 · 共 {{runs}} 次', {
                    versions: familySize,
                    runs: familyRuns ?? count,
                  })}
                </span>
              )}
              {hasManualReview && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <ShieldCheck size={10} />
                  {t('routes.manualReviewed', '手工整理')}
                </span>
              )}
            </div>
          )}

          {count > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-zinc-500">{t('routes.bestPace', '最快配速')}</p>
                  <p className="font-mono text-xs font-bold truncate">{bestPace}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Ruler size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-zinc-500">{t('routes.cumulativeDistance', '累计')}</p>
                  <p className="font-mono text-xs font-bold truncate">{formatDistance(totalDistance, 'km')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-orange-600 dark:text-orange-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-zinc-500">{t('routes.latestRun', '最近一次')}</p>
                  <p className="font-mono text-xs font-bold truncate">{latestDate}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </PixelCard>
    </Link>
  );
}
