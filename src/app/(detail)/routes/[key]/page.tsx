'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { useRoutesStore, type SavedRoute } from '@/store/routes';
import { MiniMap } from '@/components/map/MiniMap';
import { RouteComparisonTable } from '@/components/RouteComparisonTable';
import { RouteTrendChart } from '@/components/RouteTrendChart';
import { PixelCard, PixelButton } from '@/components/ui';
import { formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { areActivitiesSameRoute, createActivityFromRouteReference, getBestPaceActivity } from '@/lib/routeClustering';
import { getActivityTimestamp } from '@/lib/dates';
import {
  ChevronLeft,
  MapPin,
  Edit2,
  Check,
  X,
  Trash2,
  Merge,
} from 'lucide-react';

function getRouteBaseKey(key: string) {
  return key.split('#')[0];
}

type Activities = ReturnType<typeof useActivitiesStore.getState>['activities'];

function getRouteReferenceActivity(route: SavedRoute, activities: Activities) {
  return (
    activities.find((activity) => activity.id === route.referenceActivityId) ??
    activities.find((activity) => route.activityIds.includes(activity.id)) ??
    createActivityFromRouteReference(route)
  );
}

function areRoutesSameFamily(route: SavedRoute, candidate: SavedRoute, activities: Activities) {
  if (getRouteBaseKey(route.key) === getRouteBaseKey(candidate.key)) return true;

  const routeReference = getRouteReferenceActivity(route, activities);
  const candidateReference = getRouteReferenceActivity(candidate, activities);
  if (!routeReference || !candidateReference) return false;
  if (routeReference.id === candidateReference.id) return true;

  return areActivitiesSameRoute(routeReference, candidateReference);
}

function getSavedRouteActivities(route: SavedRoute, activities: Activities) {
  return activities.filter((activity) => route.activityIds.includes(activity.id));
}

function getSavedRoutePolyline(route: SavedRoute, activities: Activities) {
  const latestActivity = getSavedRouteActivities(route, activities)
    .sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a))[0];
  return latestActivity?.map?.summary_polyline || route.polyline || null;
}

export default function RouteDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { activities } = useActivitiesStore();
  const {
    savedRoutes,
    renameRoute,
    unsaveRoute,
    mergeRoutes,
    splitActivityToRoute,
  } = useRoutesStore();

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
      .sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));
  }, [route, activities]);
  const siblingRoutes = useMemo(() => {
    if (!route) return [];
    return savedRoutes
      .filter((candidate) => candidate.key !== route.key && areRoutesSameFamily(route, candidate, activities))
      .sort((a, b) => b.activityIds.length - a.activityIds.length);
  }, [route, savedRoutes, activities]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [selectedSiblingKeys, setSelectedSiblingKeys] = useState<string[]>([]);

  React.useEffect(() => {
    setSelectedSiblingKeys((keys) => {
      const nextKeys = keys.filter((key) => siblingRoutes.some((sibling) => sibling.key === key));
      return nextKeys.length === keys.length ? keys : nextKeys;
    });
  }, [siblingRoutes]);

  React.useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) return null;

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
  const polyline = latestActivity?.map?.summary_polyline || route.polyline || null;

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

  const handleMergeRoute = (sourceKey: string) => {
    if (confirm(t('routes.mergeSimilarRouteConfirm', '会把这条相似路线的历史记录并入当前路线，原活动不会删除。确定继续吗？'))) {
      mergeRoutes(route.key, sourceKey);
    }
  };

  const toggleSiblingSelection = (sourceKey: string) => {
    setSelectedSiblingKeys((keys) =>
      keys.includes(sourceKey)
        ? keys.filter((key) => key !== sourceKey)
        : [...keys, sourceKey]
    );
  };

  const handleSelectAllSiblings = () => {
    setSelectedSiblingKeys((keys) =>
      keys.length === siblingRoutes.length ? [] : siblingRoutes.map((sibling) => sibling.key)
    );
  };

  const handleMergeSelectedRoutes = () => {
    if (selectedSiblingKeys.length === 0) return;
    if (confirm(t('routes.mergeSelectedSimilarConfirm', '会把选中的 {{count}} 条相似路线并入当前路线，原活动不会删除。确定继续吗？', {
      count: selectedSiblingKeys.length,
    }))) {
      selectedSiblingKeys.forEach((sourceKey) => mergeRoutes(route.key, sourceKey));
      setSelectedSiblingKeys([]);
    }
  };

  const handleSplitActivity = (activity: typeof routeActivities[number]) => {
    if (routeActivities.length <= 1) return;
    if (confirm(t('routes.splitConfirm', '确定将这次活动拆出为新的路线版本吗？'))) {
      splitActivityToRoute(route.key, activity);
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
              <MiniMap polyline={polyline} height="100%" />
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

        {siblingRoutes.length > 0 && (
          <PixelCard className="p-4 mb-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-pixel text-sm font-bold">{t('routes.similarRoutesDetected', '发现相似路线')}</h2>
                <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  {t('routes.similarRoutesDetailHint', '这些路线可能因为 GPS 漂移被拆开。先看轨迹，勾选确认属于同一条的路线，再并入当前路线。')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSelectAllSiblings}
                className="shrink-0 px-2 py-1 border-2 border-zinc-200 dark:border-zinc-700 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {selectedSiblingKeys.length === siblingRoutes.length
                  ? t('routes.clearSelection', '清空')
                  : t('routes.selectAll', '全选')}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {siblingRoutes.map((sibling) => {
                const siblingActivities = getSavedRouteActivities(sibling, activities);
                const totalSiblingDistance = siblingActivities.reduce((sum, activity) => sum + activity.distance, 0);
                const selected = selectedSiblingKeys.includes(sibling.key);
                return (
                  <div
                    key={sibling.key}
                    className={[
                      'overflow-hidden border-2 bg-white dark:bg-zinc-900 transition-colors',
                      selected
                        ? 'border-blue-500 dark:border-blue-400'
                        : 'border-zinc-200 dark:border-zinc-800',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSiblingSelection(sibling.key)}
                      className="block w-full text-left"
                    >
                      <div className="h-24 bg-zinc-100 dark:bg-zinc-800">
                        <MiniMap polyline={getSavedRoutePolyline(sibling, activities)} height="100%" />
                      </div>
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-bold truncate">{sibling.name}</p>
                            <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                              {sibling.activityIds.length}{t('routes.runs', '次')} · {formatDistance(totalSiblingDistance, 'km')}
                            </p>
                          </div>
                          <span className={[
                            'shrink-0 inline-flex h-5 min-w-5 items-center justify-center border-2 px-1 font-mono text-[10px] font-bold',
                            selected
                              ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                              : 'border-zinc-200 text-zinc-400 dark:border-zinc-700',
                          ].join(' ')}>
                            {selected ? t('routes.selected', '已选') : t('routes.select', '选择')}
                          </span>
                        </div>
                      </div>
                    </button>
                    <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 py-2 flex items-center justify-between gap-2">
                      <Link
                        href={`/routes/${encodeURIComponent(sibling.key)}`}
                        className="font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        {t('common.view', '查看')}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleMergeRoute(sibling.key)}
                        className="inline-flex items-center gap-1 px-2 py-1 border border-zinc-200 dark:border-zinc-700 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <Merge size={11} />
                        {t('routes.mergeIntoThisRoute', '并入这条')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-zinc-100 dark:border-zinc-800 pt-3">
              <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {t('routes.selectedSimilarCount', '已选择 {{count}} 条', { count: selectedSiblingKeys.length })}
              </p>
              <button
                type="button"
                onClick={handleMergeSelectedRoutes}
                disabled={selectedSiblingKeys.length === 0}
                className="inline-flex items-center gap-1 px-3 py-2 border-2 border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-xs font-bold transition-colors"
              >
                <Merge size={13} />
                {t('routes.mergeSelectedSimilar', '并入选中')}
              </button>
            </div>
          </PixelCard>
        )}

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
          <RouteComparisonTable
            activities={routeActivities}
            onSplitActivity={routeActivities.length > 1 ? handleSplitActivity : undefined}
          />
        </PixelCard>
      </div>
    </div>
  );
}
