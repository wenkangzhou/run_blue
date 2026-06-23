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
import { RouteConfirmSheet, type RouteConfirmAction } from '@/components/RouteConfirmSheet';
import { useActivityHistorySync } from '@/hooks/useActivityHistorySync';
import { getActivityTimestamp } from '@/lib/dates';
import { areActivitiesSameRoute, createActivityFromRouteReference } from '@/lib/routeClustering';
import { getGuestActivities, getGuestSavedRoutes, isGuestUser } from '@/lib/guestMode';
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

function RouteMaintenanceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-950">
      <p className="font-mono text-[10px] text-zinc-400">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

export default function RoutesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const isGuest = isGuestUser(user);
  const { activities, hasMore, loadedPages } = useActivitiesStore();
  const { savedRoutes, lastRoutesBackup, syncRoutes, restoreLastRoutesBackup } = useRoutesStore();
  const {
    isSyncing,
    progress: syncProgress,
    error: syncError,
    syncHistory,
    reset: resetSyncState,
  } = useActivityHistorySync(isGuest ? null : user?.accessToken);
  const sourceActivities = React.useMemo(
    () => (isGuest ? getGuestActivities() : activities),
    [isGuest, activities]
  );
  const sourceSavedRoutes = React.useMemo(
    () => (isGuest ? getGuestSavedRoutes() : savedRoutes),
    [isGuest, savedRoutes]
  );
  const sourceHasMore = isGuest ? false : hasMore;
  const [lastSyncStats, setLastSyncStats] = React.useState<RouteSyncStats | null>(null);
  const [confirmAction, setConfirmAction] = React.useState<RouteConfirmAction | null>(null);

  React.useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  React.useEffect(() => {
    if (!isGuest && isAuthenticated && savedRoutes.length > 0 && activities.length > 0) {
      syncRoutes(activities);
    }
  }, [isGuest, isAuthenticated, activities, savedRoutes.length, syncRoutes]);

  const routeFamilies = React.useMemo(
    () => buildRouteFamilies(sourceSavedRoutes, sourceActivities),
    [sourceSavedRoutes, sourceActivities]
  );
  const hasSimilarRouteFamilies = routeFamilies.some((family) => family.routes.length > 1);
  const totalMatchedActivities = sourceSavedRoutes.reduce((sum, route) => sum + route.activityIds.length, 0);
  const maintenanceTone = syncError
    ? 'error'
    : sourceHasMore
      ? 'warning'
      : hasSimilarRouteFamilies
        ? 'review'
        : 'ready';

  if (authLoading || !isAuthenticated) {
    return <PageLoadingShell title={t('routes.title', '收藏路线')} maxWidth="2xl" variant="list" />;
  }

  const handleSyncHistory = async () => {
    if (isGuest) return;
    if (isSyncing) return;

    resetSyncState();
    setLastSyncStats(null);
    try {
      if (user?.accessToken) {
        await syncHistory();
      } else if (sourceHasMore) {
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
    if (isGuest) return;
    if (isSyncing || savedRoutes.length < 2) return;
    setConfirmAction({
      title: t('routes.autoMergeSimilarRoutes', '自动整理相似路线'),
      description: t('routes.autoMergeConfirm', '自动整理只会合并高置信相似路线，并会保留撤销备份。确定开始吗？'),
      confirmLabel: t('routes.autoMergeSimilarRoutes', '自动整理相似路线'),
      onConfirm: () => {
        resetSyncState();
        const stats = syncRoutes(useActivitiesStore.getState().activities, { autoMerge: true });
        setLastSyncStats(stats);
      },
    });
  };

  const handleRestoreLastRoutesBackup = () => {
    if (isGuest) return;
    if (!lastRoutesBackup) return;
    setConfirmAction({
      title: t('routes.restoreLastBackup', '撤销上次整理'),
      description: t('routes.restoreLastBackupConfirm', '确定撤销上一次路线同步/整理结果吗？当前状态会作为新的备份保留。'),
      confirmLabel: t('routes.restoreLastBackup', '撤销上次整理'),
      onConfirm: () => {
        restoreLastRoutesBackup();
        setLastSyncStats(null);
      },
    });
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
  const shouldShowSyncPanel = !isGuest && sourceSavedRoutes.length > 0 && Boolean(sourceHasMore || isSyncing || syncError || lastSyncStats || lastRoutesBackup || hasSimilarRouteFamilies);
  const syncPanelTitle = hasSimilarRouteFamilies
    ? t('routes.routeReviewAvailable', '发现可整理的相似路线')
    : sourceHasMore
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
          {sourceSavedRoutes.length > 0 && !shouldShowSyncPanel && !isGuest && (
            <button
              onClick={handleSyncHistory}
              disabled={isSyncing}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-40 transition-colors shrink-0"
              title={t('routes.syncHistoryHint', '加载剩余历史活动，并重新匹配到已收藏路线')}
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              {sourceHasMore ? t('routes.syncHistory', '同步历史') : t('routes.refreshMatches', '补充匹配')}
            </button>
          )}
          {(sourceSavedRoutes.length === 0 || isGuest) && <div className="w-16" />}
        </div>
      </div>

      <div className="container mx-auto px-3 py-4 max-w-2xl">
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          {t('routes.description', '收藏常跑路线，追踪每次表现变化')}
        </p>

        {shouldShowSyncPanel && (
          <div className={[
            'mb-5 overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-zinc-900',
            maintenanceTone === 'error'
              ? 'border-red-200 dark:border-red-900/70'
              : maintenanceTone === 'warning'
                ? 'border-amber-200 dark:border-amber-900/60'
                : maintenanceTone === 'review'
                  ? 'border-blue-200 dark:border-blue-900/60'
                  : 'border-zinc-200 dark:border-zinc-800',
          ].join(' ')}>
            <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start gap-2">
                {maintenanceTone === 'error' ? (
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                ) : maintenanceTone === 'warning' ? (
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : maintenanceTone === 'review' ? (
                  <Layers size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Database size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                )}
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-100">
                    {syncPanelTitle}
                  </p>
                  <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {sourceHasMore
                      ? t('routes.partialHistoryPreserve', '历史未完整时会保留已有匹配，只增量补充新识别到的活动。')
                      : hasSimilarRouteFamilies
                        ? t('routes.autoMergeSafeHint', '自动整理只会合并高置信相似路线；有手工拆分记录的路线会跳过，避免覆盖你的判断。')
                        : t('routes.routeMaintenanceReady', '当前收藏路线可以继续补充匹配或撤销最近一次整理。')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 px-3 py-3">
              <RouteMaintenanceStat label={t('routes.scannedActivities', '已扫描')} value={`${sourceActivities.length}`} />
              <RouteMaintenanceStat label={t('routes.savedRoutesCount', '收藏路线')} value={`${sourceSavedRoutes.length}`} />
              <RouteMaintenanceStat label={t('routes.matchedRuns', '已匹配')} value={`${totalMatchedActivities}`} />
            </div>

            {sourceHasMore && loadedPages > 0 && (
              <p className="px-3 pb-2 font-mono text-[10px] text-zinc-400">
                {t('routes.loadedPages', '已加载 {{pages}} 页。', { pages: loadedPages })}
              </p>
            )}

            {syncStatusText && (
              <div className={[
                'mx-3 mb-3 rounded-lg px-3 py-2 font-mono text-[11px]',
                syncError
                  ? 'bg-red-50 text-red-600 dark:bg-red-950/25 dark:text-red-300'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/25 dark:text-blue-300',
              ].join(' ')}>
                {syncStatusText}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 border-t border-zinc-100 px-3 py-3 dark:border-zinc-800 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleSyncHistory}
                disabled={isSyncing}
                className="flex min-h-16 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:border-zinc-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <RefreshCw size={14} className={['shrink-0 text-zinc-500', isSyncing ? 'animate-spin' : ''].join(' ')} />
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-bold text-zinc-800 dark:text-zinc-100">
                    {sourceHasMore ? t('routes.syncHistory', '同步历史') : t('routes.refreshMatches', '补充匹配')}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {t('routes.refreshMatchesHint', '只增量补充匹配，不重置手工整理')}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={handleAutoMergeRoutes}
                disabled={isSyncing || !hasSimilarRouteFamilies}
                className="flex min-h-16 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-blue-900/70 dark:bg-blue-950/25 dark:hover:border-blue-800"
                title={t('routes.autoMergeSafeHint', '自动整理只会合并高置信相似路线；有手工拆分记录的路线会跳过，避免覆盖你的判断。')}
              >
                <Layers size={14} className="shrink-0 text-blue-600 dark:text-blue-300" />
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-bold text-blue-700 dark:text-blue-200">
                    {t('routes.autoMergeSimilarRoutes', '自动整理相似路线')}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] leading-relaxed text-blue-700/70 dark:text-blue-300/70">
                    {hasSimilarRouteFamilies
                      ? t('routes.autoMergeSafeShort', '高置信合并，可撤销')
                      : t('routes.noSimilarRoutesToMerge', '暂无可自动整理项')}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={handleRestoreLastRoutesBackup}
                disabled={!lastRoutesBackup}
                className="flex min-h-16 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <Undo2 size={14} className="shrink-0 text-zinc-500" />
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-bold text-zinc-800 dark:text-zinc-100">
                    {t('routes.restoreLastBackup', '撤销上次整理')}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {lastRoutesBackup
                      ? t('routes.restoreLastBackupHint', '恢复到上一次操作前')
                      : t('routes.noRestoreBackup', '暂无可撤销记录')}
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}

        {isGuest && (
          <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-3 dark:border-blue-900/60 dark:bg-blue-950/20">
            <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-200">
              {t('guest.demoRoutesTitle', '游客示例路线')}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-blue-700/70 dark:text-blue-300/70">
              {t('guest.demoRoutesHint', '这里展示预置收藏路线；登录 Strava 后会使用你的真实收藏和历史匹配。')}
            </p>
          </div>
        )}

        {sourceSavedRoutes.length === 0 ? (
          <div className="text-center py-16">
            <MapPinOff size={40} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
            <p className="font-mono text-zinc-500 mb-2">{t('routes.emptyTitle', '还没有收藏任何路线')}</p>
            <p className="font-mono text-xs text-zinc-400">
              {t('routes.emptyHint', '在活动详情页点击「收藏路线」即可添加')}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {routeFamilies.map((family) => {
              const targetRoute = getFamilyTargetRoute(family);

              return (
                <section key={family.baseKey}>
                  {family.routes.length > 1 && (
                    <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-3 dark:border-blue-900/60 dark:bg-blue-950/20">
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
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                            {t('routes.routeFamilySummary', '{{versions}} 个路线版本 · {{runs}} 次记录', {
                              versions: family.routes.length,
                              runs: family.totalRuns,
                            })}
                          </span>
                          <span className="max-w-full rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                            {t('routes.mergeTargetRoute', '整理到：{{name}}', { name: targetRoute.name })}
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/routes/${encodeURIComponent(targetRoute.key)}`}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 font-mono text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950"
                      >
                        <ListChecks size={12} />
                        {t('routes.reviewSimilarRoutes', '去整理')}
                      </Link>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {family.routes.map((route) => (
                      <RouteCard
                        key={route.key}
                        route={route}
                        activities={sourceActivities}
                        familySize={family.routes.length}
                        familyRuns={family.totalRuns}
                        isFamilyTarget={route.key === targetRoute.key}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
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
