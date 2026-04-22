'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { useRoutesStore } from '@/store/routes';
import { RouteOnlyMap } from '@/components/map/RouteOnlyMap';
import { RouteComparisonTable } from '@/components/RouteComparisonTable';
import { RouteTrendChart } from '@/components/RouteTrendChart';
import { ActivityCard } from '@/components/ActivityCard';
import { PixelCard, PixelButton } from '@/components/ui';
import { formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { getBestPaceActivity } from '@/lib/routeClustering';
import {
  ChevronLeft,
  MapPin,
  Edit2,
  Check,
  X,
  Trash2,
} from 'lucide-react';

export default function RouteDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated } = useAuth();
  const { activities } = useActivitiesStore();
  const { savedRoutes, renameRoute, unsaveRoute } = useRoutesStore();

  const rawKey = params.key as string;
  const routeKey = decodeURIComponent(rawKey);

  const route = useMemo(
    () => savedRoutes.find((r) => r.key === routeKey),
    [savedRoutes, routeKey]
  );

  const routeActivities = useMemo(() => {
    if (!route) return [];
    return activities
      .filter((a) => route.activityIds.includes(a.id))
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  }, [route, activities]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  if (!route) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="container mx-auto px-4 py-4 max-w-2xl">
            <Link
              href="/routes"
              className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              {t('common.back')}
            </Link>
          </div>
        </div>
        <div className="container mx-auto px-3 py-4 max-w-2xl">
          <div className="text-center py-16">
            <p className="font-mono text-zinc-500">{t('routes.notFound', '路线不存在')}</p>
            <PixelButton variant="outline" size="sm" className="mt-4">
              <Link href="/routes">{t('common.back')}</Link>
            </PixelButton>
          </div>
        </div>
      </div>
    );
  }

  const totalDistance = routeActivities.reduce((sum, a) => sum + a.distance, 0);
  const totalDuration = routeActivities.reduce((sum, a) => sum + a.moving_time, 0);
  const bestPaceActivity = getBestPaceActivity(routeActivities);
  const bestPace = bestPaceActivity
    ? formatPace(bestPaceActivity.distance, bestPaceActivity.moving_time, 'min/km')
    : '--';

  const latestActivity = routeActivities[0];
  const polyline = latestActivity?.map?.summary_polyline || null;

  const handleRename = () => {
    if (editName.trim()) {
      renameRoute(route.key, editName.trim());
      setIsEditingName(false);
    }
  };

  const handleUnsave = () => {
    if (confirm(t('routes.deleteConfirm', '确定取消收藏这条路线吗？'))) {
      unsaveRoute(route.key);
      router.push('/routes');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-2xl flex items-center justify-between">
          <Link
            href="/routes"
            className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </Link>

          <div className="flex-1 min-w-0 mx-3 text-center">
            {isEditingName ? (
              <div className="flex items-center justify-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="font-mono text-base font-bold px-2 py-1 border-2 border-zinc-800 dark:border-zinc-200 bg-white dark:bg-zinc-900 w-full max-w-[200px]"
                  autoFocus
                />
                <button
                  onClick={handleRename}
                  className="p-1 border-2 border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setIsEditingName(false)}
                  className="p-1 border-2 border-zinc-300 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <h1 className="font-pixel text-base font-bold truncate">{route.name}</h1>
                <button
                  onClick={() => {
                    setEditName(route.name);
                    setIsEditingName(true);
                  }}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0"
                >
                  <Edit2 size={12} />
                </button>
              </div>
            )}
          </div>

          {!isEditingName && (
            <button
              onClick={handleUnsave}
              className="inline-flex items-center gap-1 px-3 py-1.5 font-mono text-xs font-bold uppercase border-2 border-zinc-200 dark:border-zinc-700 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
              title={t('common.delete')}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">{t('common.delete')}</span>
            </button>
          )}
          {isEditingName && <div className="w-16" />}
        </div>
      </div>

      <div className="container mx-auto px-3 py-4 max-w-2xl">
        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mb-4">
          <MapPin size={12} />
          {route.key}
        </p>

        {/* Map + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <PixelCard className="lg:col-span-2 h-64 overflow-hidden p-0">
            {polyline ? (
              <RouteOnlyMap polyline={polyline} height="100%" />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-400 font-mono text-sm">
                {t('errors.noData')}
              </div>
            )}
          </PixelCard>

          <div className="space-y-3">
            <PixelCard className="p-3">
              <p className="font-mono text-[10px] text-zinc-500 uppercase">{t('stats.totalActivities')}</p>
              <p className="font-mono text-2xl font-bold">{routeActivities.length}{t('routes.runs', '次')}</p>
            </PixelCard>
            <PixelCard className="p-3">
              <p className="font-mono text-[10px] text-zinc-500 uppercase">{t('stats.totalDistance')}</p>
              <p className="font-mono text-2xl font-bold">{formatDistance(totalDistance, 'km')}</p>
            </PixelCard>
            <PixelCard className="p-3">
              <p className="font-mono text-[10px] text-zinc-500 uppercase">{t('stats.totalTime')}</p>
              <p className="font-mono text-2xl font-bold">{formatDuration(totalDuration)}</p>
            </PixelCard>
            <PixelCard className="p-3">
              <p className="font-mono text-[10px] text-zinc-500 uppercase">{t('routes.avgPace', '平均配速')}</p>
              <p className="font-mono text-2xl font-bold">
                {routeActivities.length > 0 && totalDistance > 0
                  ? formatPace(totalDistance, totalDuration, 'min/km')
                  : '--'}
              </p>
            </PixelCard>
            <PixelCard className="p-3">
              <p className="font-mono text-[10px] text-zinc-500 uppercase">{t('routes.bestPace', '最快配速')}</p>
              <p className="font-mono text-2xl font-bold text-green-600 dark:text-green-400">{bestPace}</p>
            </PixelCard>
          </div>
        </div>

        {/* Trend Chart */}
        {routeActivities.length >= 2 && (
          <PixelCard className="p-4 mb-6">
            <h2 className="font-pixel text-sm font-bold mb-3">{t('routes.paceTrend', '配速趋势')}</h2>
            <RouteTrendChart activities={routeActivities} />
          </PixelCard>
        )}

        {/* Comparison Table */}
        <PixelCard className="p-4 mb-6">
          <h2 className="font-pixel text-sm font-bold mb-3">{t('routes.comparison', '历史对比')}</h2>
          <RouteComparisonTable activities={routeActivities} />
        </PixelCard>

        {/* Activity Cards */}
        <div>
          <h2 className="font-pixel text-sm font-bold mb-3">{t('routes.activities', '关联活动')}</h2>
          <div className="space-y-3">
            {routeActivities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} compact />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
