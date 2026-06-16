'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore, isActivitiesCacheStale } from '@/store/activities';
import { StravaActivity } from '@/types';
import { getNextActivitiesPage, syncRecentActivities } from '@/lib/activitySync';
import { useActivityHistorySync } from '@/hooks/useActivityHistorySync';
import { getActivityDate } from '@/lib/dates';
import { Loader2, RefreshCw, ChevronUp, Search, X } from 'lucide-react';
import { PixelButton } from '@/components/ui';
import { RunningStats } from '@/components/RunningStats';
import { GroupedActivities } from '@/components/GroupedActivities';
import { PeriodShareModal } from '@/components/PeriodShareModal';

const CHECK_NEW_INTERVAL = 5 * 60 * 1000; // 5 minutes
function getActivityLoadErrorKind(error: unknown): 'auth' | 'rateLimit' | 'generic' {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('401') || message.includes('Unauthorized')) return 'auth';
  if (message.includes('429')) return 'rateLimit';
  return 'generic';
}

export default function ActivitiesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth();
  const { t } = useTranslation();
  const {
    activities,
    isLoading,
    error,
    hasMore,
    lastFetchedAt,
    loadedPages,
    latestActivityId,
    setLoading,
    setError,
  } = useActivitiesStore();
  const {
    syncHistory,
    reset: resetHistorySync,
  } = useActivityHistorySync(user?.accessToken);

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isPeriodShareOpen, setIsPeriodShareOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Read filter params from URL
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || '');
  const [minDistance, setMinDistance] = useState(searchParams.get('minDistance') || '');
  const [maxDistance, setMaxDistance] = useState(searchParams.get('maxDistance') || '');
  const [raceFilter, setRaceFilter] = useState(searchParams.get('race') === '1');
  const [withKidFilter, setWithKidFilter] = useState(searchParams.get('withKid') === '1');
  const [longRunFilter, setLongRunFilter] = useState(searchParams.get('longRun') === '1');

  // Sync URL when filters change
  const updateFilterParams = useCallback((patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    router.replace(`/activities?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // 直接记录下一页要加载的页码
  const nextPageRef = useRef(1);
  const backgroundHistorySyncStartedRef = useRef(false);

  // Filter running activities with valid route data + user filters
  const runningActivities = React.useMemo(() => {
    return activities.filter((a: StravaActivity) => {
      if (a.type !== 'Run') return false;
      const hasRoute = a.map?.summary_polyline && a.map.summary_polyline.length > 10;
      if (!hasRoute) return false;

      // Date filter
      const activityDate = getActivityDate(a);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (activityDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (activityDate > end) return false;
      }

      // Distance filter (input in km, activity.distance in meters)
      const distKm = a.distance / 1000;
      if (minDistance && distKm < parseFloat(minDistance)) return false;
      if (maxDistance && distKm > parseFloat(maxDistance)) return false;

      // Workout type / tag filters
      if (raceFilter && a.workout_type !== 1) return false;
      if (longRunFilter && a.workout_type !== 2 && a.distance < 15000) return false;
      if (withKidFilter && a.workout_type !== 0) return false;

      return true;
    });
  }, [activities, startDate, endDate, minDistance, maxDistance, raceFilter, withKidFilter, longRunFilter]);

  useEffect(() => {
    if (activities.length > 0 && initialLoading) {
      setInitialLoading(false);
    }
  }, [activities.length, initialLoading]);

  // Load activities
  const loadActivities = useCallback(async (type: 'initial' | 'refresh') => {
    if (!user?.accessToken) return;

    if (type === 'refresh') {
      setRefreshing(true);
    } else {
      // initial
      if (activities.length > 0) {
        // 已有缓存，从缓存推算下一页
        nextPageRef.current = getNextActivitiesPage(loadedPages, activities.length);
        setInitialLoading(false);
        return;
      }
    }
    
    setError(null);

    try {
      await syncRecentActivities(user.accessToken, { force: true });
      const state = useActivitiesStore.getState();
      nextPageRef.current = getNextActivitiesPage(state.loadedPages, state.activities.length);

      setNeedsReauth(false);
      setRateLimited(false);
    } catch (err) {
      const errorKind = getActivityLoadErrorKind(err);

      if (errorKind === 'auth') {
        setNeedsReauth(true);
        if (activities.length === 0) {
          setError(t('auth.sessionExpired'));
        }
      } else if (errorKind === 'rateLimit') {
        setRateLimited(true);
        if (activities.length === 0) {
          setError(t('errors.rateLimited'));
        }
      } else {
        if (activities.length === 0) {
          setError(t('errors.generic'));
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, [
    user?.accessToken,
    activities.length,
    loadedPages,
    setLoading,
    setError,
    t,
  ]);

  // Scroll to top button visibility
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const startBackgroundHistorySync = useCallback(async () => {
    if (!user?.accessToken || backgroundHistorySyncStartedRef.current) return;
    if (refreshing) return;
    if (!hasMore && !isActivitiesCacheStale(lastFetchedAt)) return;

    backgroundHistorySyncStartedRef.current = true;
    resetHistorySync();
    setError(null);
    setNeedsReauth(false);
    setRateLimited(false);

    try {
      await syncHistory();
      const state = useActivitiesStore.getState();
      nextPageRef.current = getNextActivitiesPage(state.loadedPages, state.activities.length);
      setNeedsReauth(false);
      setRateLimited(false);
    } catch (err) {
      const errorKind = getActivityLoadErrorKind(err);
      if (errorKind === 'auth') setNeedsReauth(true);
      if (errorKind === 'rateLimit') setRateLimited(true);
      if (errorKind === 'generic') {
        setError(t('activity.syncFailed', '同步失败，请稍后重试'));
      } else if (activities.length === 0) {
        setError(errorKind === 'rateLimit' ? t('errors.rateLimited') : t('auth.sessionExpired'));
      }
    }
  }, [
    user?.accessToken,
    refreshing,
    hasMore,
    lastFetchedAt,
    resetHistorySync,
    syncHistory,
    setError,
    activities.length,
    t,
  ]);

  // 限制 checkForNewActivities 调用频率：最少间隔 5 分钟
  const lastCheckRef = useRef<number>(0);

  // 检查是否有新数据
  const checkForNewActivities = useCallback(async () => {
    if (!user?.accessToken || !latestActivityId) return;

    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_NEW_INTERVAL) {
      return;
    }
    lastCheckRef.current = now;

    try {
      await syncRecentActivities(user.accessToken, { force: true });
      const state = useActivitiesStore.getState();
      nextPageRef.current = getNextActivitiesPage(state.loadedPages, state.activities.length);
    } catch (err) {
      console.error('[CheckNew] failed:', err);
    }
  }, [
    user?.accessToken,
    latestActivityId,
  ]);

  // Initial load
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      if (activities.length > 0) {
        setInitialLoading(false);
        setNeedsReauth(true);
        return;
      }
      router.push('/');
      return;
    }
    if (!user?.accessToken) {
      if (activities.length > 0) setInitialLoading(false);
      return;
    }

    if (activities.length === 0) {
      loadActivities('initial');
    } else if (isActivitiesCacheStale(lastFetchedAt)) {
      setInitialLoading(false);
      nextPageRef.current = getNextActivitiesPage(loadedPages, activities.length);
      loadActivities('refresh');
    } else {
      // 缓存未过期，恢复 nextPageRef 并静默检查新数据
      setInitialLoading(false);
      nextPageRef.current = getNextActivitiesPage(loadedPages, activities.length);
      checkForNewActivities();
    }
  }, [authLoading, isAuthenticated, user?.accessToken, activities.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authLoading || !isAuthenticated || !user?.accessToken || activities.length === 0) return;
    startBackgroundHistorySync();
  }, [
    authLoading,
    isAuthenticated,
    user?.accessToken,
    activities.length,
    startBackgroundHistorySync,
  ]);

  const handleRefresh = () => {
    loadActivities('refresh');
  };
  const handleReauth = () => {
    logout();
    router.push('/api/auth/signin/strava');
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const canRenderCachedActivities = activities.length > 0;

  if (authLoading && activities.length === 0) {
    return <ActivitiesPageSkeleton />;
  }

  if (!isAuthenticated && !canRenderCachedActivities) {
    return <ActivitiesPageSkeleton />;
  }

  if (initialLoading && activities.length === 0) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse font-mono text-xl flex items-center gap-2">
            <Loader2 className="animate-spin" />
            {t('common.loading')}
          </div>
        </div>
      </div>
    );
  }

  if ((error || needsReauth) && activities.length === 0) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center">
          {rateLimited ? (
            <>
              <p className="font-mono text-amber-600 dark:text-amber-400 mb-2">{t('errors.rateLimitedTitle')}</p>
              <p className="font-mono text-sm text-zinc-500 mb-4">{t('errors.rateLimitedDesc')}</p>
            </>
          ) : needsReauth ? (
            <p className="font-mono text-zinc-600 dark:text-zinc-400">{t('auth.sessionExpired')}</p>
          ) : (
            <>
              <p className="font-mono text-red-500">{error}</p>
              <PixelButton variant="outline" size="sm" className="mt-4" onClick={() => loadActivities('initial')}>
                {t('common.retry')}
              </PixelButton>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 py-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {runningActivities.length > 0 && (
            <div className="relative shrink-0">
              <RunningStats activities={runningActivities} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex items-center gap-1 p-2 font-mono text-xs transition-colors ${
              showFilters || startDate || endDate || minDistance || maxDistance || raceFilter || withKidFilter || longRunFilter
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
            title={t('filter.title', '筛选')}
          >
            <Search size={16} />
            {(startDate || endDate || minDistance || maxDistance || raceFilter || withKidFilter || longRunFilter) && (
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </button>
          <button onClick={handleRefresh} disabled={refreshing || isLoading || !user?.accessToken} className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 p-2" title="刷新数据">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mb-4 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 p-3 space-y-3 max-w-full overflow-x-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">{t('filter.startDate', '开始日期')}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); updateFilterParams({ startDate: e.target.value }); }}
                className="w-full px-2 py-1.5 font-mono text-xs border-2 border-zinc-200 dark:border-zinc-700 bg-transparent focus:border-blue-400 outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">{t('filter.endDate', '结束日期')}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); updateFilterParams({ endDate: e.target.value }); }}
                className="w-full px-2 py-1.5 font-mono text-xs border-2 border-zinc-200 dark:border-zinc-700 bg-transparent focus:border-blue-400 outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">{t('filter.minDistance', '最小距离 (km)')}</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={minDistance}
                onChange={(e) => { setMinDistance(e.target.value); updateFilterParams({ minDistance: e.target.value }); }}
                placeholder="0"
                className="w-full px-2 py-1.5 font-mono text-xs border-2 border-zinc-200 dark:border-zinc-700 bg-transparent focus:border-blue-400 outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">{t('filter.maxDistance', '最大距离 (km)')}</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={maxDistance}
                onChange={(e) => { setMaxDistance(e.target.value); updateFilterParams({ maxDistance: e.target.value }); }}
                placeholder="∞"
                className="w-full px-2 py-1.5 font-mono text-xs border-2 border-zinc-200 dark:border-zinc-700 bg-transparent focus:border-blue-400 outline-none"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Workout type tags */}
            <button
              onClick={() => setRaceFilter(v => !v)}
              className={`px-2 py-1 font-mono text-[10px] border transition-colors ${
                raceFilter
                  ? 'border-zinc-800 dark:border-zinc-200 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
              }`}
            >
              比赛
            </button>
            <button
              onClick={() => setWithKidFilter(v => !v)}
              className={`px-2 py-1 font-mono text-[10px] border transition-colors ${
                withKidFilter
                  ? 'border-zinc-800 dark:border-zinc-200 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
              }`}
            >
              带娃
            </button>
            <button
              onClick={() => setLongRunFilter(v => !v)}
              className={`px-2 py-1 font-mono text-[10px] border transition-colors ${
                longRunFilter
                  ? 'border-zinc-800 dark:border-zinc-200 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
              }`}
            >
              长跑
            </button>
          </div>
          {(startDate || endDate || minDistance || maxDistance || raceFilter || withKidFilter || longRunFilter) && (
            <button
              onClick={() => {
                setStartDate(''); setEndDate(''); setMinDistance(''); setMaxDistance('');
                setRaceFilter(false); setWithKidFilter(false); setLongRunFilter(false);
                updateFilterParams({ startDate: '', endDate: '', minDistance: '', maxDistance: '', race: '', withKid: '', longRun: '' });
              }}
              className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-red-500 transition-colors"
            >
              <X size={12} />
              {t('filter.clear', '清除筛选')}
            </button>
          )}
        </div>
      )}

      {/* Warning banner */}
      {(needsReauth || rateLimited) && activities.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-amber-700 dark:text-amber-400">
              {rateLimited ? t('errors.rateLimitedShowCache') : t('auth.sessionExpiredShowCache')}
            </span>
            {needsReauth && (
              <button
                onClick={handleReauth}
                className="font-mono text-xs text-amber-700 dark:text-amber-400 hover:underline"
              >
                {t('auth.relogin', '重新登录')}
              </button>
            )}
          </div>
        </div>
      )}

      {error && !needsReauth && !rateLimited && activities.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-red-600 dark:text-red-400">
              {error}
            </span>
            <button
              onClick={handleRefresh}
              className="font-mono text-xs text-red-600 dark:text-red-400 hover:underline shrink-0"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      )}

      {runningActivities.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-mono text-zinc-500">{t('activity.noActivities')}</p>
        </div>
      ) : (
        <>
          <GroupedActivities
            activities={runningActivities}
            hasMore={hasMore}
            isLoading={isLoading}
            onOpenPeriodShare={() => setIsPeriodShareOpen(true)}
          />
        </>
      )}

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button onClick={scrollToTop} className="fixed bottom-6 right-6 p-3 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-full shadow-lg hover:opacity-90 transition-opacity z-50" aria-label={t('common.scrollToTop')}>
          <ChevronUp size={20} />
        </button>
      )}

      <PeriodShareModal
        isOpen={isPeriodShareOpen}
        onClose={() => setIsPeriodShareOpen(false)}
        activities={activities}
      />

    </div>
  );
}

function ActivitiesPageSkeleton() {
  return (
    <div className="container mx-auto px-3 py-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="h-16 w-48 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
        <div className="flex gap-2">
          <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </div>
      <div className="mb-4 flex gap-2 px-1">
        <div className="h-7 w-16 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-7 w-16 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-7 w-16 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" />
      </div>
      <div className="space-y-6">
        {[0, 1].map((group) => (
          <div key={group} className="border-t-2 border-zinc-100 pt-4 dark:border-zinc-800">
            <div className="mb-3 h-5 w-40 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[3/4] animate-pulse rounded-sm bg-zinc-100 dark:bg-zinc-900"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
