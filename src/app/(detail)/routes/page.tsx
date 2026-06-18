'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { useRoutesStore, type SavedRoute } from '@/store/routes';
import type { RouteSyncStats } from '@/lib/routeSync';
import { RouteCard } from '@/components/RouteCard';
import { PageLoadingShell } from '@/components/PageLoadingShell';
import { useActivityHistorySync } from '@/hooks/useActivityHistorySync';
import { getActivityTimestamp } from '@/lib/dates';
import { areActivitiesSameRoute, createActivityFromRouteReference } from '@/lib/routeClustering';
import { MapPinOff, ChevronLeft, RefreshCw, Database, AlertCircle, Layers, ListChecks, Undo2 } from 'lucide-react';

type Activities = ReturnType<typeof useActivitiesStore.getState>['activities'];

interface RouteFamily {
  baseKey: string;
  routes: SavedRoute[];
  totalRuns: number;
  latestAt: number;
}

function getRouteBaseKey(key: string) {
  return key.split('#')[0];
}

function getRouteActivities(route: SavedRoute, activities: Activities) {
  return activities.filter((activity) => route.activityIds.includes(activity.id));
}

function getRouteAverageDistance(route: SavedRoute, activities: Activities) {
  const routeActivities = getRouteActivities(route, activities);
  if (routeActivities.length === 0) return route.distance;
  return routeActivities.reduce((sum, activity) => sum + activity.distance, 0) / routeActivities.length;
}

function getRouteLatestTimestamp(route: SavedRoute, activities: Activities) {
  const routeActivities = getRouteActivities(route, activities);
  if (routeActivities.length === 0) return route.createdAt;
  return Math.max(...routeActivities.map(getActivityTimestamp));
}

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

function buildRouteFamilies(savedRoutes: SavedRoute[], activities: Activities): RouteFamily[] {
  const families: RouteFamily[] = [];

  savedRoutes.forEach((route) => {
    const baseKey = getRouteBaseKey(route.key);
    const family = families.find((candidate) =>
      candidate.routes.some((familyRoute) => areRoutesSameFamily(familyRoute, route, activities))
    ) ?? {
      baseKey,
      routes: [],
      totalRuns: 0,
      latestAt: 0,
    };

    family.routes.push(route);
    family.totalRuns += route.activityIds.length;
    family.latestAt = Math.max(family.latestAt, getRouteLatestTimestamp(route, activities));
    if (!families.includes(family)) {
      families.push(family);
    }
  });

  return families
    .map((family) => ({
      ...family,
      routes: [...family.routes].sort((a, b) => (
        getRouteAverageDistance(a, activities) - getRouteAverageDistance(b, activities)
      )),
    }))
    .sort((a, b) => b.latestAt - a.latestAt || b.totalRuns - a.totalRuns);
}

function getFamilyTargetRoute(family: RouteFamily) {
  return family.routes.reduce((best, route) => (
    route.activityIds.length > best.activityIds.length ? route : best
  ), family.routes[0]);
}

export default function RoutesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { activities, hasMore, loadedPages } = useActivitiesStore();
  const { savedRoutes, lastRoutesBackup, syncRoutes, restoreLastRoutesBackup } = useRoutesStore();
  const {
    isSyncing,
    progress: syncProgress,
    error: syncError,
    syncHistory,
    reset: resetSyncState,
  } = useActivityHistorySync(user?.accessToken);
  const [lastSyncStats, setLastSyncStats] = React.useState<RouteSyncStats | null>(null);

  React.useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  React.useEffect(() => {
    if (isAuthenticated && savedRoutes.length > 0 && activities.length > 0) {
      syncRoutes(activities);
    }
  }, [isAuthenticated, activities, savedRoutes.length, syncRoutes]);

  const routeFamilies = React.useMemo(
    () => buildRouteFamilies(savedRoutes, activities),
    [savedRoutes, activities]
  );
  const hasSimilarRouteFamilies = routeFamilies.some((family) => family.routes.length > 1);
  const totalMatchedActivities = savedRoutes.reduce((sum, route) => sum + route.activityIds.length, 0);

  if (authLoading || !isAuthenticated) {
    return <PageLoadingShell title={t('routes.title', '收藏路线')} maxWidth="2xl" variant="list" />;
  }

  const handleSyncHistory = async () => {
    if (isSyncing) return;

    resetSyncState();
    setLastSyncStats(null);
    try {
      if (user?.accessToken) {
        await syncHistory();
      } else if (hasMore) {
        await syncHistory();
      }

      const state = useActivitiesStore.getState();
      const stats = syncRoutes(state.activities);
      setLastSyncStats(stats);
    } catch (error) {
      console.error('[Routes] Failed to sync historical routes:', error);
    }
  };

  const handleAutoMergeRoutes = () => {
    if (isSyncing || savedRoutes.length < 2) return;
    if (!confirm(t('routes.autoMergeConfirm', '自动整理只会合并高置信相似路线，并会保留撤销备份。确定开始吗？'))) {
      return;
    }
    resetSyncState();
    const stats = syncRoutes(useActivitiesStore.getState().activities, { autoMerge: true });
    setLastSyncStats(stats);
  };

  const handleRestoreLastRoutesBackup = () => {
    if (confirm(t('routes.restoreLastBackupConfirm', '确定撤销上一次路线同步/整理结果吗？当前状态会作为新的备份保留。'))) {
      restoreLastRoutesBackup();
      setLastSyncStats(null);
    }
  };

  const syncStatusText = (() => {
    if (syncError) {
      if (syncError.kind === 'auth') return t('auth.unauthorized', '请先连接 Strava 账号');
      if (syncError.kind === 'rateLimit') return t('errors.rateLimitedDesc');
      return syncError.message === 'activity_history_sync_failed'
        ? t('routes.syncFailed', '历史同步失败，请稍后重试')
        : syncError.message;
    }

    if (!syncProgress) return '';
    if (syncProgress.phase === 'recent') return t('routes.syncingRecent', '正在检查近期活动');
    if (syncProgress.phase === 'history' && syncProgress.page) {
      return t('routes.syncProgress', '同步第 {{page}} 页 · 已加载 {{count}} 页', {
        page: syncProgress.page,
        count: syncProgress.pagesLoaded,
      });
    }
    if (syncProgress.phase === 'complete') {
      if (lastSyncStats) {
        if ((lastSyncStats.autoMergedRoutes ?? 0) > 0) {
          return t(
            'routes.syncDoneWithMergeStats',
            '历史匹配已更新 · 新增 {{added}} 条匹配 · 自动合并 {{merged}} 条相似路线',
            {
              added: lastSyncStats.matchesAdded,
              merged: lastSyncStats.autoMergedRoutes,
            }
          );
        }
        return t(
          'routes.syncDoneWithStats',
          '历史匹配已更新 · 新增 {{added}} 条匹配 · 更新 {{routes}} 条路线',
          {
            added: lastSyncStats.matchesAdded,
            routes: lastSyncStats.routesUpdated,
          }
        );
      }
      return t('routes.syncDone', '历史匹配已更新');
    }
    if (lastSyncStats && (lastSyncStats.autoMergedRoutes ?? 0) > 0) {
      return t('routes.autoMergeDone', '自动整理完成 · 合并 {{count}} 条高置信相似路线', {
        count: lastSyncStats.autoMergedRoutes,
      });
    }
    if (lastSyncStats) {
      return t('routes.matchRefreshDone', '匹配已补充 · 新增 {{added}} 条记录 · 更新 {{routes}} 条路线', {
        added: lastSyncStats.matchesAdded,
        routes: lastSyncStats.routesUpdated,
      });
    }
    return '';
  })();
  const shouldShowSyncPanel = savedRoutes.length > 0 && Boolean(hasMore || isSyncing || syncError || lastSyncStats || lastRoutesBackup || hasSimilarRouteFamilies);
  const syncPanelTitle = hasSimilarRouteFamilies
    ? t('routes.routeReviewAvailable', '发现可整理的相似路线')
    : hasMore
      ? t('routes.historyIncomplete', '历史活动尚未完整加载')
      : t('routes.historyComplete', '历史活动已加载完整');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-2xl flex items-center justify-between">
          <Link
            href="/activities"
            className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </Link>
          <h1 className="font-pixel text-base font-bold">{t('routes.title', '收藏路线')}</h1>
          {savedRoutes.length > 0 && !shouldShowSyncPanel && (
            <button
              onClick={handleSyncHistory}
              disabled={isSyncing}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-40 transition-colors shrink-0"
              title={t('routes.syncHistoryHint', '加载剩余历史活动，并重新匹配到已收藏路线')}
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              {hasMore ? t('routes.syncHistory', '同步历史') : t('routes.refreshMatches', '补充匹配')}
            </button>
          )}
          {savedRoutes.length === 0 && <div className="w-16" />}
        </div>
      </div>

      <div className="container mx-auto px-3 py-4 max-w-2xl">
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          {t('routes.description', '收藏常跑路线，追踪每次表现变化')}
        </p>

        {shouldShowSyncPanel && (
          <div className={[
            'mb-4 border-2 px-3 py-3 bg-white dark:bg-zinc-900',
            hasMore || syncError
              ? 'border-amber-200 dark:border-amber-800'
                : 'border-zinc-200 dark:border-zinc-700',
          ].join(' ')}>
            <div className="flex items-start gap-2">
              {hasMore || hasSimilarRouteFamilies ? (
                <AlertCircle size={16} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <Database size={16} className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-200">
                  {syncPanelTitle}
                </p>
                <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  {t('routes.syncSummary', '已扫描 {{activities}} 条活动，{{routes}} 条收藏路线已匹配 {{matches}} 次记录。', {
                    activities: activities.length,
                    routes: savedRoutes.length,
                    matches: totalMatchedActivities,
                  })}
                  {hasMore && loadedPages > 0 && (
                    <span className="ml-1">
                      {t('routes.loadedPages', '已加载 {{pages}} 页。', { pages: loadedPages })}
                    </span>
                  )}
                </p>
                {hasMore && (
                  <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    {t('routes.partialHistoryPreserve', '历史未完整时会保留已有匹配，只增量补充新识别到的活动。')}
                  </p>
                )}
                {hasSimilarRouteFamilies && (
                  <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    {t('routes.autoMergeSafeHint', '自动整理只会合并高置信相似路线；有手工拆分记录的路线会跳过，避免覆盖你的判断。')}
                  </p>
                )}
                {syncStatusText && (
                  <p className={[
                    'font-mono text-[11px] mt-2',
                    syncError ? 'text-red-500' : 'text-blue-600 dark:text-blue-400',
                  ].join(' ')}>
                    {syncStatusText}
                  </p>
                )}
                {lastRoutesBackup && (
                  <button
                    type="button"
                    onClick={handleRestoreLastRoutesBackup}
                    className="mt-3 inline-flex items-center gap-1 border border-zinc-200 dark:border-zinc-700 px-2 py-1 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Undo2 size={11} />
                    {t('routes.restoreLastBackup', '撤销上次路线同步')}
                  </button>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSyncHistory}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-1 border border-zinc-200 dark:border-zinc-700 px-2 py-1 font-mono text-[10px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                  >
                    <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
                    {hasMore ? t('routes.syncHistory', '同步历史') : t('routes.refreshMatches', '补充匹配')}
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoMergeRoutes}
                    disabled={isSyncing || !hasSimilarRouteFamilies}
                    className="inline-flex items-center gap-1 border border-blue-200 px-2 py-1 font-mono text-[10px] font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30 transition-colors"
                    title={t('routes.autoMergeSafeHint', '自动整理只会合并高置信相似路线；有手工拆分记录的路线会跳过，避免覆盖你的判断。')}
                  >
                    <Layers size={11} />
                    {t('routes.autoMergeSimilarRoutes', '自动整理相似路线')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {savedRoutes.length === 0 ? (
          <div className="text-center py-16">
            <MapPinOff size={40} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
            <p className="font-mono text-zinc-500 mb-2">{t('routes.emptyTitle', '还没有收藏任何路线')}</p>
            <p className="font-mono text-xs text-zinc-400">
              {t('routes.emptyHint', '在活动详情页点击「收藏路线」即可添加')}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {routeFamilies.map((family) => (
              <section key={family.baseKey}>
                {family.routes.length > 1 && (() => {
                  const targetRoute = getFamilyTargetRoute(family);
                  return (
                    <div className="mb-3 flex items-start justify-between gap-3 border-2 border-blue-100 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/20 px-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Layers size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
                          <h2 className="font-mono text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">
                            {t('routes.similarRoutesDetected', '发现相似路线')}
                          </h2>
                        </div>
                        <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                          {t('routes.similarRoutesSummary', '这 {{versions}} 条路线看起来像同一条，共 {{runs}} 次记录。进入详情后可以看轨迹并选择要合并的路线。', {
                            versions: family.routes.length,
                            runs: family.totalRuns,
                          })}
                        </p>
                      </div>
                      <Link
                        href={`/routes/${encodeURIComponent(targetRoute.key)}`}
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 border-2 border-zinc-200 dark:border-zinc-700 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <ListChecks size={12} />
                        {t('routes.reviewSimilarRoutes', '去整理')}
                      </Link>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {family.routes.map((route) => (
                    <RouteCard
                      key={route.key}
                      route={route}
                      activities={activities}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
