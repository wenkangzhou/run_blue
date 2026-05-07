'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore, isActivitiesCacheStale } from '@/store/activities';
import { useRoutesStore } from '@/store/routes';
import { StravaActivity } from '@/types';
import { getActivities } from '@/lib/strava';
import { Loader2, RefreshCw, ChevronUp, Search, X } from 'lucide-react';
import { PixelButton } from '@/components/ui';
import { RunningStats } from '@/components/RunningStats';
import { GroupedActivities } from '@/components/GroupedActivities';
import { PeriodShareModal } from '@/components/PeriodShareModal';

export default function ActivitiesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, logout } = useAuth();
  const { t } = useTranslation();
  const {
    activities,
    isLoading,
    error,
    hasMore,
    lastFetchedAt,
    loadedPages,
    latestActivityId,
    setActivities,
    appendActivities,
    prependActivities,
    setLoading,
    setError,
    setHasMore,
    setLastFetchedAt,
    setLoadedPages,
    setLatestActivityId,
    clearActivities,
  } = useActivitiesStore();

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

  // Filter running activities with valid route data + user filters
  const runningActivities = React.useMemo(() => {
    return activities.filter((a: StravaActivity) => {
      if (a.type !== 'Run') return false;
      const hasRoute = a.map?.summary_polyline && a.map.summary_polyline.length > 10;
      if (!hasRoute) return false;

      // Date filter
      const activityDate = new Date(a.start_date);
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

      return true;
    });
  }, [activities, startDate, endDate, minDistance, maxDistance]);

  // Load activities
  const loadActivities = useCallback(async (type: 'initial' | 'refresh' | 'more') => {
    if (!user?.accessToken) return;

    // 确定当前要加载的 page
    let currentPage: number;
    if (type === 'refresh') {
      currentPage = 1;
      nextPageRef.current = 1;
    } else if (type === 'initial') {
      currentPage = 1;
      nextPageRef.current = 1;
    } else {
      // more
      currentPage = nextPageRef.current;
    }
    
    console.log(`[LoadActivities] calculated currentPage=${currentPage}, nextPageRef=${nextPageRef.current}, loadedPages=${loadedPages}`);
    
    if (type === 'refresh') {
      setRefreshing(true);
    } else if (type === 'more') {
      setLoading(true);
    } else {
      // initial
      if (activities.length > 0) {
        // 已有缓存，从缓存推算下一页
        const pagesLoaded = Math.ceil(activities.length / 200);
        nextPageRef.current = pagesLoaded + 1;
        setInitialLoading(false);
        return;
      }
    }
    
    setError(null);

    try {
      console.log(`[LoadActivities] type=${type}, page=${currentPage}, nextPageRef=${nextPageRef.current}`);
      const newActivities = await getActivities(user.accessToken, currentPage, 200);
      console.log(`[LoadActivities] received ${newActivities.length} activities`);
      
      if (type === 'refresh') {
        setActivities(newActivities);
        nextPageRef.current = 2;
        setLoadedPages(1);
        setLatestActivityId(newActivities[0]?.id || null);
        setHasMore(newActivities.length === 200);
      } else if (type === 'more') {
        if (newActivities.length === 0) {
          setHasMore(false);
        } else {
          appendActivities(newActivities);
          nextPageRef.current = currentPage + 1;
          setLoadedPages(currentPage);
          setHasMore(newActivities.length === 200);
        }
      } else {
        // initial
        setActivities(newActivities);
        nextPageRef.current = 2;
        setLoadedPages(1);
        setLatestActivityId(newActivities[0]?.id || null);
        setHasMore(newActivities.length === 200);
      }
      
      setLastFetchedAt(Date.now());
      setNeedsReauth(false);
      setRateLimited(false);

      // Sync saved routes with newly loaded activities
      useRoutesStore.getState().syncRoutes(useActivitiesStore.getState().activities);
    } catch (err: any) {
      const errorMessage = err?.message || '';
      
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        setNeedsReauth(true);
        if (activities.length === 0) {
          setError(t('auth.sessionExpired'));
        }
      } else if (errorMessage.includes('429')) {
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
  }, [user?.accessToken, activities.length, setActivities, appendActivities, setLoading, setError, setHasMore, setLastFetchedAt, t]);

  // Initial load
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
    if (!user?.accessToken) return;

    if (activities.length === 0) {
      loadActivities('initial');
    } else if (isActivitiesCacheStale(lastFetchedAt)) {
      setInitialLoading(false);
      nextPageRef.current = loadedPages > 0 ? loadedPages + 1 : 1;
      console.log(`[Refresh] restored nextPageRef=${nextPageRef.current}`);
      loadActivities('refresh');
    } else {
      // 缓存未过期，恢复 nextPageRef 并静默检查新数据
      setInitialLoading(false);
      nextPageRef.current = loadedPages > 0 ? loadedPages + 1 : 1;
      console.log(`[Cache] restored nextPageRef=${nextPageRef.current}, checking for new data...`);
      checkForNewActivities();
    }
  }, [isAuthenticated, user?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top button visibility
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      console.log(`[HandleLoadMore] nextPageRef=${nextPageRef.current}`);
      loadActivities('more');
    }
  };

  // 限制 checkForNewActivities 调用频率：最少间隔 5 分钟
  const lastCheckRef = useRef<number>(0);
  const CHECK_NEW_INTERVAL = 5 * 60 * 1000; // 5 minutes

  // 检查是否有新数据
  const checkForNewActivities = useCallback(async () => {
    if (!user?.accessToken || !latestActivityId) return;

    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_NEW_INTERVAL) {
      console.log('[CheckNew] skipped: too soon since last check');
      return;
    }
    lastCheckRef.current = now;

    try {
      console.log('[CheckNew] checking for new activities...');
      // 获取 page 1 的前 200 条
      const page1Activities = await getActivities(user.accessToken, 1, 200);
      
      if (page1Activities.length === 0) return;
      
      // 找出所有新活动（ID不在缓存中的）
      const existingIds = new Set(activities.map(a => a.id));
      const newActivities = page1Activities.filter(a => !existingIds.has(a.id));
      
      console.log(`[CheckNew] found ${newActivities.length} new activities`);
      
      if (newActivities.length === 0) {
        // 没有新数据，更新 lastFetchedAt
        setLastFetchedAt(Date.now());
        return;
      }
      
      if (newActivities.length < 200) {
        // 新数据少于200条，prepend 到缓存
        prependActivities(newActivities);
        setLatestActivityId(page1Activities[0]?.id || null);
        setLastFetchedAt(Date.now());
        console.log('[CheckNew] prepended new activities');
        // Sync saved routes with newly loaded activities
        useRoutesStore.getState().syncRoutes(useActivitiesStore.getState().activities);
      } else {
        // 新数据>=200条，可能错过数据，需要完全刷新
        console.log('[CheckNew] too many new activities, full refresh needed');
        setActivities(page1Activities);
        nextPageRef.current = 2;
        setLoadedPages(1);
        setLatestActivityId(page1Activities[0]?.id || null);
        setLastFetchedAt(Date.now());
        setHasMore(page1Activities.length === 200);
        // Sync saved routes with newly loaded activities
        useRoutesStore.getState().syncRoutes(useActivitiesStore.getState().activities);
      }
    } catch (err) {
      console.error('[CheckNew] failed:', err);
    }
  }, [user?.accessToken, activities, latestActivityId, prependActivities, setActivities, setHasMore, setLastFetchedAt, setLatestActivityId, setLoadedPages]);

  const handleRefresh = () => {
    nextPageRef.current = 1;
    setLoadedPages(0);
    setLatestActivityId(null);
    loadActivities('refresh');
  };
  
  const handleForceRefresh = () => {
    nextPageRef.current = 1;
    clearActivities();
    loadActivities('refresh');
  };

  const handleReauth = () => {
    logout();
    router.push('/api/auth/signin/strava');
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  if (!isAuthenticated) return null;

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
              showFilters || startDate || endDate || minDistance || maxDistance
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
            title={t('filter.title', '筛选')}
          >
            <Search size={16} />
            {(startDate || endDate || minDistance || maxDistance) && (
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </button>
          <button onClick={handleRefresh} disabled={refreshing || isLoading} className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 p-2" title="刷新数据">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {!refreshing && (rateLimited ? t('errors.rateLimited') : isActivitiesCacheStale(lastFetchedAt) ? t('common.expired') : '')}
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mb-4 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          {(startDate || endDate || minDistance || maxDistance) && (
            <button
              onClick={() => {
                setStartDate(''); setEndDate(''); setMinDistance(''); setMaxDistance('');
                updateFilterParams({ startDate: '', endDate: '', minDistance: '', maxDistance: '' });
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

          {/* Load More Button */}
          {hasMore ? (
            <div className="py-6 flex justify-center">
              <button onClick={handleLoadMore} disabled={isLoading} className="px-6 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 rounded-full text-sm font-mono transition-colors">
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {t('common.loading')}
                  </span>
                ) : (
                  t('common.loadMore')
                )}
              </button>
            </div>
          ) : (
            <div className="py-6 text-center">
              <span className="text-xs font-mono text-zinc-400">{t('common.noMore')}</span>
            </div>
          )}
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
