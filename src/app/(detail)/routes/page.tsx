'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { useRoutesStore } from '@/store/routes';
import { RouteCard } from '@/components/RouteCard';
import { loadRemainingActivities } from '@/lib/activitySync';
import { MapPinOff, ChevronLeft, RefreshCw, Database, AlertCircle } from 'lucide-react';

export default function RoutesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { activities, hasMore, loadedPages } = useActivitiesStore();
  const { savedRoutes, syncRoutes } = useRoutesStore();
  const [syncing, setSyncing] = React.useState(false);
  const [syncProgress, setSyncProgress] = React.useState('');
  const [syncError, setSyncError] = React.useState('');

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  React.useEffect(() => {
    if (isAuthenticated && savedRoutes.length > 0 && activities.length > 0) {
      syncRoutes(activities);
    }
  }, [isAuthenticated, activities, savedRoutes.length, syncRoutes]);

  if (!isAuthenticated) return null;

  const totalMatchedActivities = savedRoutes.reduce((sum, route) => sum + route.activityIds.length, 0);

  const handleSyncHistory = async () => {
    if (syncing) return;

    setSyncing(true);
    setSyncError('');
    setSyncProgress('');

    try {
      if (hasMore) {
        if (!user?.accessToken) {
          throw new Error(t('auth.unauthorized', '请先连接 Strava 账号'));
        }

        await loadRemainingActivities(user.accessToken, {
          onProgress: ({ pagesLoaded, page }) => {
            setSyncProgress(
              t('routes.syncProgress', '同步第 {{page}} 页 · 已加载 {{count}} 页', {
                page,
                count: pagesLoaded,
              })
            );
          },
        });
      }

      syncRoutes(useActivitiesStore.getState().activities);
      setSyncProgress(t('routes.syncDone', '历史匹配已更新'));
      setTimeout(() => setSyncProgress(''), 1600);
    } catch (error) {
      console.error('[Routes] Failed to sync historical routes:', error);
      setSyncError(error instanceof Error ? error.message : t('routes.syncFailed', '历史同步失败，请稍后重试'));
    } finally {
      setSyncing(false);
    }
  };

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
          {savedRoutes.length > 0 && (
            <button
              onClick={handleSyncHistory}
              disabled={syncing}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-40 transition-colors shrink-0"
              title={t('routes.syncHistoryHint', '加载剩余历史活动，并重新匹配到已收藏路线')}
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {hasMore ? t('routes.syncHistory', '同步历史') : t('routes.rematchLoaded', '重新匹配')}
            </button>
          )}
          {savedRoutes.length === 0 && <div className="w-16" />}
        </div>
      </div>

      <div className="container mx-auto px-3 py-4 max-w-2xl">
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          {t('routes.description', '收藏常跑路线，追踪每次表现变化')}
        </p>

        {savedRoutes.length > 0 && (
          <div className={[
            'mb-4 border-2 px-3 py-3 bg-white dark:bg-zinc-900',
            hasMore
              ? 'border-amber-200 dark:border-amber-800'
              : 'border-zinc-200 dark:border-zinc-700',
          ].join(' ')}>
            <div className="flex items-start gap-2">
              {hasMore ? (
                <AlertCircle size={16} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <Database size={16} className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-200">
                  {hasMore
                    ? t('routes.historyIncomplete', '历史活动尚未完整加载')
                    : t('routes.historyComplete', '历史活动已加载完整')}
                </p>
                <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  {t('routes.syncSummary', '当前缓存 {{activities}} 条活动，{{routes}} 条收藏路线已匹配 {{matches}} 次记录。', {
                    activities: activities.length,
                    routes: savedRoutes.length,
                    matches: totalMatchedActivities,
                  })}
                  {loadedPages > 0 && (
                    <span className="ml-1">
                      {t('routes.loadedPages', '已加载 {{pages}} 页。', { pages: loadedPages })}
                    </span>
                  )}
                </p>
                {(syncProgress || syncError) && (
                  <p className={[
                    'font-mono text-[11px] mt-2',
                    syncError ? 'text-red-500' : 'text-blue-600 dark:text-blue-400',
                  ].join(' ')}>
                    {syncError || syncProgress}
                  </p>
                )}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedRoutes.map((route) => (
              <RouteCard key={route.key} route={route} activities={activities} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
