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
import { PageLoadingShell } from '@/components/PageLoadingShell';
import { RouteConfirmSheet, type RouteConfirmAction } from '@/components/RouteConfirmSheet';
import { PixelCard, PixelButton } from '@/components/ui';
import { formatDate, formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { areActivitiesSameRoute, createActivityFromRouteReference, getBestPaceActivity } from '@/lib/routeClustering';
import { getActivityTimestamp } from '@/lib/dates';
import { getGuestActivities, getGuestSavedRoutes, isGuestUser } from '@/lib/guestMode';
import { useSessionPageState } from '@/hooks/useSessionPageState';
import {
  ChevronLeft,
  MapPin,
  Activity,
  Clock3,
  Edit2,
  Check,
  X,
  Trash2,
  Merge,
  Undo2,
  CheckCircle2,
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

function getSavedRouteStats(route: SavedRoute, activities: Activities, locale: string) {
  const routeActivities = getSavedRouteActivities(route, activities);
  const sortedActivities = [...routeActivities].sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));
  const latestActivity = sortedActivities[0];
  const totalDistance = routeActivities.reduce((sum, activity) => sum + activity.distance, 0);
  const avgDistance = routeActivities.length > 0 ? totalDistance / routeActivities.length : route.distance;

  return {
    avgDistance,
    latestDate: latestActivity ? formatDate(latestActivity.start_date_local, locale) : '--',
    runCount: routeActivities.length || route.activityIds.length,
    totalDistance,
  };
}

type RouteActionNotice = {
  title: string;
  description: string;
};

export default function RouteDetailPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const isGuest = isGuestUser(user);
  const { activities } = useActivitiesStore();
  const {
    savedRoutes,
    renameRoute,
    unsaveRoute,
    mergeRoutesBatch,
    splitActivityToRoute,
    splitActivitiesToRoute,
    restoreLastRoutesBackup,
    lastRoutesBackup,
  } = useRoutesStore();

  const rawKey = params.key as string;
  const routeKey = decodeURIComponent(rawKey);
  const sourceActivities = useMemo(
    () => (isGuest ? getGuestActivities() : activities),
    [isGuest, activities]
  );
  const sourceSavedRoutes = useMemo(
    () => (isGuest ? getGuestSavedRoutes() : savedRoutes),
    [isGuest, savedRoutes]
  );

  const route = useMemo(
    () => sourceSavedRoutes.find((r) => r.key === routeKey),
    [sourceSavedRoutes, routeKey]
  );

  const routeActivities = useMemo(() => {
    if (!route) return [];
    return sourceActivities
      .filter((a) => route.activityIds.includes(a.id))
      .sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));
  }, [route, sourceActivities]);
  const siblingRoutes = useMemo(() => {
    if (!route) return [];
    return sourceSavedRoutes
      .filter((candidate) => candidate.key !== route.key && areRoutesSameFamily(route, candidate, sourceActivities))
      .sort((a, b) => b.activityIds.length - a.activityIds.length);
  }, [route, sourceSavedRoutes, sourceActivities]);
  const canEditRoutes = !isGuest;

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [selectedSiblingKeys, setSelectedSiblingKeys] = useSessionPageState<string[]>(
    `run_blue_page:route:${routeKey}:selected-siblings`,
    [],
    (value): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
  const [selectedActivityIds, setSelectedActivityIds] = useSessionPageState<number[]>(
    `run_blue_page:route:${routeKey}:selected-activities`,
    [],
    (value): value is number[] => Array.isArray(value) && value.every(Number.isInteger)
  );
  const [actionNotice, setActionNotice] = useState<RouteActionNotice | null>(null);
  const [confirmAction, setConfirmAction] = useState<RouteConfirmAction | null>(null);

  React.useEffect(() => {
    if (!route) return;
    setSelectedSiblingKeys((keys) => {
      const nextKeys = keys.filter((key) => siblingRoutes.some((sibling) => sibling.key === key));
      return nextKeys.length === keys.length ? keys : nextKeys;
    });
  }, [route, setSelectedSiblingKeys, siblingRoutes]);

  React.useEffect(() => {
    if (!route) return;
    setSelectedActivityIds((ids) => {
      const nextIds = ids.filter((id) => routeActivities.some((activity) => activity.id === id));
      return nextIds.length === ids.length ? ids : nextIds;
    });
  }, [route, routeActivities, setSelectedActivityIds]);

  React.useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  const selectedSiblingRoutes = useMemo(
    () => siblingRoutes.filter((sibling) => selectedSiblingKeys.includes(sibling.key)),
    [selectedSiblingKeys, siblingRoutes]
  );
  const selectedSiblingRunCount = selectedSiblingRoutes.reduce(
    (sum, sibling) => sum + sibling.activityIds.length,
    0
  );

  if (authLoading || !isAuthenticated) {
    return <PageLoadingShell title={t('routes.title', '收藏路线')} maxWidth="2xl" variant="detail" />;
  }

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
  const avgPace = routeActivities.length > 0 && totalDistance > 0
    ? formatPace(totalDistance, totalDuration, 'min/km')
    : '--';

  const latestActivity = routeActivities[0];
  const polyline = latestActivity?.map?.summary_polyline || route.polyline || null;

  const handleRename = () => {
    if (!canEditRoutes) return;
    if (editName.trim()) {
      renameRoute(route.key, editName.trim());
      setIsEditingName(false);
      setActionNotice({
        title: t('routes.renameDone', '路线名称已更新'),
        description: t('routes.renameDoneHint', '收藏路线的历史记录不会受到影响。'),
      });
    }
  };

  const handleUnsave = () => {
    if (!canEditRoutes) return;
    setConfirmAction({
      title: t('routes.deleteRouteTitle', '取消收藏路线'),
      description: t('routes.deleteRouteDesc', '这只会从收藏路线中移除当前路线，不会删除 Strava 活动记录。操作后会返回收藏路线列表。'),
      confirmLabel: t('routes.deleteRouteAction', '取消收藏'),
      variant: 'danger',
      onConfirm: () => {
        unsaveRoute(route.key);
        router.push('/routes');
      },
    });
  };

  const handleMergeRoute = (sourceKey: string) => {
    if (!canEditRoutes) return;
    const sourceRoute = siblingRoutes.find((sibling) => sibling.key === sourceKey);
    setConfirmAction({
      title: t('routes.mergeRouteTitle', '并入这条相似路线'),
      description: t('routes.mergeRouteDesc', '会把这条相似路线的 {{count}} 条历史记录并入当前路线，原活动不会删除，结果可以撤销。', {
        count: sourceRoute?.activityIds.length ?? 0,
      }),
      confirmLabel: t('routes.mergeIntoThisRoute', '并入这条'),
      onConfirm: () => {
        mergeRoutesBatch(route.key, [sourceKey]);
        setSelectedSiblingKeys((keys) => keys.filter((key) => key !== sourceKey));
        setActionNotice({
          title: t('routes.mergeRouteDone', '相似路线已并入'),
          description: t('routes.mergeRouteDoneHint', '已并入 {{count}} 条记录，可用撤销恢复。', {
            count: sourceRoute?.activityIds.length ?? 0,
          }),
        });
      },
    });
  };

  const toggleSiblingSelection = (sourceKey: string) => {
    if (!canEditRoutes) return;
    setSelectedSiblingKeys((keys) =>
      keys.includes(sourceKey)
        ? keys.filter((key) => key !== sourceKey)
        : [...keys, sourceKey]
    );
  };

  const handleSelectAllSiblings = () => {
    if (!canEditRoutes) return;
    setSelectedSiblingKeys((keys) =>
      keys.length === siblingRoutes.length ? [] : siblingRoutes.map((sibling) => sibling.key)
    );
  };

  const handleMergeSelectedRoutes = () => {
    if (!canEditRoutes) return;
    if (selectedSiblingKeys.length === 0) return;
    const selectedRoutes = siblingRoutes.filter((sibling) => selectedSiblingKeys.includes(sibling.key));
    const selectedActivityCount = selectedRoutes.reduce((sum, sibling) => sum + sibling.activityIds.length, 0);
    setConfirmAction({
      title: t('routes.mergeSelectedTitle', '并入选中的相似路线'),
      description: t('routes.mergeSelectedDesc', '会把 {{routes}} 条相似路线、{{activities}} 条历史记录并入当前路线，原活动不会删除，结果会作为一次操作撤销。', {
        routes: selectedRoutes.length,
        activities: selectedActivityCount,
      }),
      confirmLabel: t('routes.mergeSelectedSimilar', '并入选中'),
      onConfirm: () => {
        mergeRoutesBatch(route.key, selectedSiblingKeys);
        setSelectedSiblingKeys([]);
        setActionNotice({
          title: t('routes.mergeSelectedDone', '选中的相似路线已并入'),
          description: t('routes.mergeSelectedDoneHint', '已合并 {{routes}} 条路线、{{activities}} 条记录，可作为一次操作撤销。', {
            routes: selectedRoutes.length,
            activities: selectedActivityCount,
          }),
        });
      },
    });
  };

  const handleSplitActivity = (activity: typeof routeActivities[number]) => {
    if (!canEditRoutes) return;
    if (routeActivities.length <= 1) return;
    setConfirmAction({
      title: t('routes.splitRouteTitle', '拆出这条记录'),
      description: t('routes.splitRouteDesc', '会把这次活动单独整理成一个新的路线版本，当前路线会保留其余记录，结果可以撤销。'),
      confirmLabel: t('routes.splitShort', '拆出'),
      onConfirm: () => {
        splitActivityToRoute(route.key, activity);
        setActionNotice({
          title: t('routes.splitRouteDone', '记录已拆出'),
          description: t('routes.splitRouteDoneHint', '已生成新的路线版本，当前路线保留其余记录。'),
        });
      },
    });
  };

  const handleToggleActivitySelection = (activity: typeof routeActivities[number]) => {
    if (!canEditRoutes) return;
    setSelectedActivityIds((ids) =>
      ids.includes(activity.id)
        ? ids.filter((id) => id !== activity.id)
        : [...ids, activity.id]
    );
  };

  const handleSplitSelectedActivities = () => {
    if (!canEditRoutes) return;
    if (selectedActivityIds.length === 0 || selectedActivityIds.length >= routeActivities.length) return;
    const selectedActivities = routeActivities.filter((activity) => selectedActivityIds.includes(activity.id));
    setConfirmAction({
      title: t('routes.splitSelectedTitle', '拆出选中的记录'),
      description: t('routes.splitSelectedDesc', '会把选中的 {{count}} 条记录拆成一个新的路线版本，当前路线会保留其余记录，结果可以撤销。', {
        count: selectedActivities.length,
      }),
      confirmLabel: t('routes.splitSelectedCount', '拆出 {{count}} 条', { count: selectedActivities.length }),
      onConfirm: () => {
        splitActivitiesToRoute(route.key, selectedActivities);
        setSelectedActivityIds([]);
        setActionNotice({
          title: t('routes.splitSelectedDone', '选中记录已拆出'),
          description: t('routes.splitSelectedDoneHint', '已把 {{count}} 条记录拆成新的路线版本，可用撤销恢复。', {
            count: selectedActivities.length,
          }),
        });
      },
    });
  };

  const handleRestoreLastRoutesBackup = () => {
    if (!canEditRoutes) return;
    setConfirmAction({
      title: t('routes.restoreLastBackup', '撤销上次整理'),
      description: t('routes.restoreLastBackupConfirm', '确定撤销上一次路线同步/整理结果吗？当前状态会作为新的备份保留。'),
      confirmLabel: t('routes.restoreLastBackup', '撤销上次整理'),
      onConfirm: () => {
        restoreLastRoutesBackup();
        setSelectedActivityIds([]);
        setSelectedSiblingKeys([]);
        setActionNotice({
          title: t('routes.restoreDone', '已撤销上次整理'),
          description: t('routes.restoreDoneHint', '路线已恢复到上一次操作前的状态。'),
        });
      },
    });
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-2xl flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </button>

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
                {canEditRoutes && (
                  <button
                    onClick={() => {
                      setEditName(route.name);
                      setIsEditingName(true);
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0"
                  >
                    <Edit2 size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {!isEditingName && canEditRoutes && (
            <button
              onClick={handleUnsave}
              className="inline-flex items-center gap-1 px-3 py-1.5 font-mono text-xs font-bold uppercase border-2 border-zinc-200 dark:border-zinc-700 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
              title={t('common.delete')}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">{t('common.delete')}</span>
            </button>
          )}
          {(isEditingName || !canEditRoutes) && <div className="w-16" />}
        </div>
      </div>

      <div className="container mx-auto px-3 py-4 max-w-2xl">
        {actionNotice && (
          <div
            aria-live="polite"
            className="mb-4 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-3 dark:border-blue-900/60 dark:bg-blue-950/25"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-100">
                  {actionNotice.title}
                </p>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {actionNotice.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lastRoutesBackup && canEditRoutes && (
                    <button
                      type="button"
                      onClick={handleRestoreLastRoutesBackup}
                      className="inline-flex items-center justify-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 font-mono text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950"
                    >
                      <Undo2 size={11} />
                      {t('routes.restoreLastBackup', '撤销上次整理')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActionNotice(null)}
                    className="inline-flex items-center justify-center rounded-md px-2 py-1 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  >
                    {t('common.close', '关闭')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {lastRoutesBackup && !actionNotice && canEditRoutes && (
          <div className="mb-4 flex flex-col gap-2 border-2 border-blue-100 bg-blue-50/70 px-3 py-3 dark:border-blue-900/60 dark:bg-blue-950/20 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
              {t('routes.lastEditCanRestore', '刚做过路线整理，如结果不满意可以撤销。')}
            </p>
            <button
              type="button"
              onClick={handleRestoreLastRoutesBackup}
              className="inline-flex shrink-0 items-center justify-center gap-1 border border-blue-200 px-2 py-1 font-mono text-[10px] font-bold text-blue-700 transition-colors hover:bg-white dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/50"
            >
              <Undo2 size={11} />
              {t('routes.restoreLastBackup', '撤销上次路线同步')}
            </button>
          </div>
        )}

        {/* Map + Stats */}
        <div className="mb-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_260px]">
            <div className="h-64 bg-zinc-100 dark:bg-zinc-800 lg:h-auto lg:min-h-[300px]">
              {polyline ? (
                <MiniMap polyline={polyline} height="100%" />
              ) : (
                <div className="flex h-full items-center justify-center text-zinc-400 font-mono text-sm">
                  {t('errors.noData')}
                </div>
              )}
            </div>

            <div className="border-t border-zinc-100 p-4 dark:border-zinc-800 lg:border-l lg:border-t-0">
              <div className="mb-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                  {t('routes.routeOverview', 'Route Overview')}
                </p>
                <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                  <MapPin size={11} className="shrink-0" />
                  <span className="truncate">{route.key}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <RouteOverviewStat icon={<Activity size={13} />} label={t('stats.totalActivities')} value={`${routeActivities.length}${t('routes.runs', '次')}`} />
                <RouteOverviewStat icon={<MapPin size={13} />} label={t('stats.totalDistance')} value={formatDistance(totalDistance, 'km')} />
                <RouteOverviewStat icon={<Clock3 size={13} />} label={t('stats.totalTime')} value={formatDuration(totalDuration)} />
                <RouteOverviewStat icon={<Activity size={13} />} label={t('routes.avgPace', '平均配速')} value={avgPace} />
                <div className="col-span-2 rounded-lg border border-green-100 bg-green-50/70 px-3 py-3 dark:border-green-900/60 dark:bg-green-950/20">
                  <p className="font-mono text-[10px] text-green-700/70 dark:text-green-300/70">
                    {t('routes.bestPace', '最快配速')}
                  </p>
                  <p className="mt-1 truncate font-mono text-xl font-bold text-green-700 dark:text-green-300">
                    {bestPace}
                  </p>
                </div>
              </div>
            </div>
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
              {canEditRoutes && (
                <button
                  type="button"
                  onClick={handleSelectAllSiblings}
                  className="shrink-0 px-2 py-1 border-2 border-zinc-200 dark:border-zinc-700 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {selectedSiblingKeys.length === siblingRoutes.length
                    ? t('routes.clearSelection', '清空')
                    : t('routes.selectAll', '全选')}
                </button>
              )}
            </div>

            <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 dark:border-blue-900/60 dark:bg-blue-950/20">
              <p className="font-mono text-[11px] font-bold text-blue-700 dark:text-blue-200">
                {canEditRoutes
                  ? t('routes.mergeSelectionRule', '当前路线会保留，只会并入你勾选的路线。')
                  : t('guest.readOnlyRouteDemo', '游客模式展示相似路线整理效果，登录后可进行合并和拆分。')}
              </p>
              {canEditRoutes && (
                <p className="mt-1 font-mono text-[10px] leading-relaxed text-blue-700/70 dark:text-blue-300/70">
                  {selectedSiblingKeys.length > 0
                    ? t('routes.mergeSelectionSummary', '已选 {{routes}} 条路线、{{runs}} 次记录；确认后会作为一次操作，可撤销。', {
                        routes: selectedSiblingKeys.length,
                        runs: selectedSiblingRunCount,
                      })
                    : t('routes.mergeSelectionEmptyHint', '不确定的路线可以先点「查看」，只把确认相同的路线并入当前路线。')}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {siblingRoutes.map((sibling) => {
                const siblingStats = getSavedRouteStats(sibling, sourceActivities, locale);
                const selected = selectedSiblingKeys.includes(sibling.key);
                return (
                  <div
                    key={sibling.key}
                    className={[
                      'overflow-hidden rounded-xl border bg-white shadow-sm transition-colors dark:bg-zinc-900',
                      selected
                        ? 'border-blue-500 dark:border-blue-400'
                        : 'border-zinc-200 dark:border-zinc-800',
                    ].join(' ')}
                  >
                    <div className="relative h-36 bg-zinc-100 dark:bg-zinc-800">
                      <MiniMap polyline={getSavedRoutePolyline(sibling, sourceActivities)} height="100%" />
                      <span className={[
                        'absolute right-2 top-2 inline-flex items-center justify-center rounded-full border px-2 py-1 font-mono text-[10px] font-bold shadow-sm backdrop-blur',
                        selected
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : 'border-white/80 bg-white/90 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-300',
                      ].join(' ')}>
                        {selected ? t('routes.selected', '已选') : t('routes.routePendingVersion', '待整理')}
                      </span>
                    </div>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-bold">{sibling.name}</p>
                          <p className="mt-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                            {siblingStats.runCount}{t('routes.runs', '次')} · {t('routes.averageSingleDistance', '单次约')} {formatDistance(siblingStats.avgDistance, 'km')}
                          </p>
                        </div>
                        {canEditRoutes && (
                          <button
                            type="button"
                            onClick={() => toggleSiblingSelection(sibling.key)}
                            className={[
                              'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] font-bold transition-colors',
                              selected
                                ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                                : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
                            ].join(' ')}
                          >
                            {selected ? <Check size={11} /> : <Merge size={11} />}
                            {selected ? t('routes.selected', '已选') : t('routes.selectToMerge', '选择并入')}
                          </button>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
                          <p className="font-mono text-[9px] text-zinc-400">{t('routes.latestRun', '最近一次')}</p>
                          <p className="mt-0.5 truncate font-mono text-[10px] font-bold text-zinc-700 dark:text-zinc-200">
                            {siblingStats.latestDate}
                          </p>
                        </div>
                        <div className="rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
                          <p className="font-mono text-[9px] text-zinc-400">{t('routes.cumulativeDistance', '累计')}</p>
                          <p className="mt-0.5 truncate font-mono text-[10px] font-bold text-zinc-700 dark:text-zinc-200">
                            {formatDistance(siblingStats.totalDistance, 'km')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 py-2 flex items-center justify-between gap-2">
                      <Link
                        href={`/routes/${encodeURIComponent(sibling.key)}`}
                        className="font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        {t('common.view', '查看')}
                      </Link>
                      {canEditRoutes && (
                        <button
                          type="button"
                          onClick={() => handleMergeRoute(sibling.key)}
                          className="inline-flex items-center gap-1 px-2 py-1 border border-zinc-200 dark:border-zinc-700 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <Merge size={11} />
                          {t('routes.mergeIntoThisRoute', '并入这条')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {canEditRoutes && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-zinc-100 dark:border-zinc-800 pt-3">
                <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                  {selectedSiblingKeys.length > 0
                    ? t('routes.selectedSimilarRunsCount', '已选择 {{routes}} 条路线 · {{runs}} 次记录', {
                        routes: selectedSiblingKeys.length,
                        runs: selectedSiblingRunCount,
                      })
                    : t('routes.selectedSimilarCount', '已选择 {{count}} 条', { count: 0 })}
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
            )}
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
            onSplitActivity={canEditRoutes && routeActivities.length > 1 ? handleSplitActivity : undefined}
            selectedActivityIds={canEditRoutes ? selectedActivityIds : []}
            onToggleActivitySelection={canEditRoutes && routeActivities.length > 1 ? handleToggleActivitySelection : undefined}
            onClearActivitySelection={() => setSelectedActivityIds([])}
            onSplitSelectedActivities={canEditRoutes ? handleSplitSelectedActivities : undefined}
          />
        </PixelCard>
      </div>
      {confirmAction && (
        <RouteConfirmSheet
          action={confirmAction}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            const action = confirmAction;
            setConfirmAction(null);
            action.onConfirm();
          }}
        />
      )}
    </div>
  );
}

function RouteOverviewStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-3 dark:bg-zinc-950">
      <div className="mb-1.5 flex items-center gap-1.5 text-zinc-400">
        {icon}
        <p className="min-w-0 truncate font-mono text-[10px]">{label}</p>
      </div>
      <p className="truncate font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}
