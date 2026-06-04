'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore, isActivitiesCacheStale } from '@/store/activities';
import { useActivityHistorySync } from '@/hooks/useActivityHistorySync';
import { VolumeDashboard } from '@/components/VolumeDashboard';
import { Loader2, ChevronLeft } from 'lucide-react';

const MAX_LOAD_PAGES = 10; // Safety limit for one automatic catch-up pass.

export default function StatsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const {
    activities,
    isLoading: storeLoading,
    lastFetchedAt,
    hasMore,
    setLoading,
    setError,
  } = useActivitiesStore();
  const {
    isSyncing: historySyncing,
    progress: historyProgress,
    error: historySyncError,
    syncHistory,
  } = useActivityHistorySync(user?.accessToken);
  const hasInitiatedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user?.accessToken || hasInitiatedRef.current) {
      if (!isAuthenticated) router.push('/');
      return;
    }

    hasInitiatedRef.current = true;

    const loadAll = async () => {
      const shouldLoad = activities.length === 0 || isActivitiesCacheStale(lastFetchedAt) || hasMore;
      if (!shouldLoad) {
        return;
      }

      setLoading(true);
      try {
        await syncHistory({ maxPages: MAX_LOAD_PAGES });
      } catch (err) {
        console.error('Failed to load stats history:', err);
        if (activities.length === 0) {
          setError(t('errors.generic'));
        }
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [authLoading, isAuthenticated, user?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || !isAuthenticated) return null;

  const isLoading = storeLoading || historySyncing;
  const progressText = historyProgress?.phase === 'history' && historyProgress.page
    ? t('common.loading') + ` (${historyProgress.page} ${t('stats.pages', '页')})`
    : t('common.loading');
  const syncErrorText = (() => {
    if (historySyncError) {
      if (historySyncError.kind === 'auth') return t('auth.unauthorized', '请先连接 Strava 账号');
      if (historySyncError.kind === 'rateLimit') return t('errors.rateLimitedDesc', 'Strava API 限流中，请稍后再试');
      return t('stats.syncFailed', '历史同步失败，请稍后重试');
    }
    return '';
  })();

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
          <h1 className="font-pixel text-base font-bold">{t('nav.stats', '统计')}</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="container mx-auto px-3 py-4 max-w-2xl">
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          {t('stats.volumeComparisonDesc', '追踪你的跑步数据，按时间维度对比分析')}
        </p>

        {syncErrorText && activities.length > 0 && (
          <div className="mb-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-3 rounded">
            <p className="font-mono text-xs text-red-600 dark:text-red-400">
              {syncErrorText}
            </p>
          </div>
        )}

        {isLoading && activities.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-pulse font-mono text-xl flex items-center gap-2">
              <Loader2 className="animate-spin" />
              {progressText}
            </div>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-mono text-zinc-500">{t('activity.noActivities')}</p>
          </div>
        ) : (
          <VolumeDashboard activities={activities} />
        )}

      </div>
    </div>
  );
}
