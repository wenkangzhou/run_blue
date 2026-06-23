'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore, isActivitiesCacheStale } from '@/store/activities';
import { useActivityHistorySync } from '@/hooks/useActivityHistorySync';
import { VolumeDashboard } from '@/components/VolumeDashboard';
import { PageLoadingShell } from '@/components/PageLoadingShell';
import { getGuestActivities, isGuestUser } from '@/lib/guestMode';
import { BarChart3, ChevronLeft, Loader2, Route } from 'lucide-react';

const MAX_LOAD_PAGES = 10; // Safety limit for one automatic catch-up pass.

export default function StatsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const isGuest = isGuestUser(user);
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
  } = useActivityHistorySync(isGuest ? null : user?.accessToken);
  const hasInitiatedRef = useRef(false);
  const sourceActivities = React.useMemo(
    () => (isGuest ? getGuestActivities() : activities),
    [isGuest, activities]
  );

  useEffect(() => {
    if (authLoading) return;
    if (isGuest) return;
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
  }, [authLoading, isAuthenticated, isGuest, user?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || !isAuthenticated) {
    return <PageLoadingShell title={t('nav.stats', '统计')} maxWidth="6xl" variant="dashboard" />;
  }

  const isLoading = isGuest ? false : storeLoading || historySyncing;
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
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link
            href="/activities"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </Link>
          <h1 className="font-mono text-base font-bold">{t('nav.stats', '统计')}</h1>
          <div className="w-16" />
        </div>
      </div>

      <main className="container mx-auto max-w-6xl px-3 py-5 md:py-7">
        <div className="mb-5 md:mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 font-mono text-xs uppercase text-blue-600 dark:text-blue-400">
              {t('stats.pageKicker', '训练数据')}
            </p>
            <h2 className="font-mono text-2xl font-bold tracking-normal md:text-3xl">
              {t('stats.pageTitle', '训练趋势总览')}
            </h2>
            <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-xl">
              {t('stats.volumeComparisonDesc', '把年度跑量、近期变化、周期趋势和训练日历放在一个页面里看。')}
            </p>
          </div>
          <div className="hidden size-11 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60 sm:flex dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
            <BarChart3 size={20} className="text-zinc-600 dark:text-zinc-300" />
          </div>
        </div>

        {syncErrorText && sourceActivities.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="font-mono text-xs text-red-600 dark:text-red-400">
              {syncErrorText}
            </p>
          </div>
        )}

        {isLoading && sourceActivities.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="text-center px-6">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                <Loader2 className="animate-spin text-orange-600" size={22} />
              </div>
              <p className="font-mono text-base font-bold">{progressText}</p>
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                {t('stats.loadingDesc', '正在整理你的历史训练数据')}
              </p>
            </div>
          </div>
        ) : sourceActivities.length === 0 ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="text-center px-6 max-w-sm">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                <Route size={22} className="text-zinc-500" />
              </div>
              <p className="font-mono text-base font-bold">{t('stats.emptyTitle', '还没有可统计的跑步')}</p>
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                {t('stats.emptyDesc', '连接 Strava 并同步活动后，这里会展示你的跑量趋势、训练日历和关键指标。')}
              </p>
            </div>
          </div>
        ) : (
          <VolumeDashboard activities={sourceActivities} />
        )}

      </main>
    </div>
  );
}
