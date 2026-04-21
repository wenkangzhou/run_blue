'use client';

import React, { useMemo, useState } from 'react';
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
  TrendingUp,
  Clock,
  Calendar,
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
  const { savedRoutes, renameRoute, unsaveRoute, removeActivityFromRoute } = useRoutesStore();

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
      <div className="container mx-auto px-3 py-4">
        <div className="text-center py-16">
          <p className="font-mono text-zinc-500">{t('routes.notFound', '路线不存在')}</p>
          <PixelButton variant="outline" size="sm" className="mt-4" onClick={() => router.push('/routes')}>
            {t('common.back')}
          </PixelButton>
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
    <div className="container mx-auto px-3 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/routes')}
          className="p-2 border-2 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 font-mono text-lg font-bold px-2 py-1 border-2 border-zinc-800 dark:border-zinc-200 bg-white dark:bg-zinc-900"
                autoFocus
              />
              <button
                onClick={handleRename}
                className="p-1.5 border-2 border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => setIsEditingName(false)}
                className="p-1.5 border-2 border-zinc-300 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="font-pixel text-xl font-bold truncate">{route.name}</h1>
              <button
                onClick={() => {
                  setEditName(route.name);
                  setIsEditingName(true);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <Edit2 size={14} />
              </button>
            </div>
          )}
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <MapPin size={12} />
            {route.key}
          </p>
        </div>
        {!isEditingName && (
          <button
            onClick={handleUnsave}
            className="p-2 border-2 border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20 transition-colors shrink-0"
            title={t('common.delete')}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

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
  );
}
