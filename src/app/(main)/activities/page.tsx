'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore, isActivitiesCacheStale } from '@/store/activities';
import { StravaActivity } from '@/types';
import { getActivities } from '@/lib/strava';
import { Loader2, RefreshCw, ChevronUp } from 'lucide-react';
import { PixelButton } from '@/components/ui';
import { RunningStats } from '@/components/RunningStats';
import { GroupedActivities } from '@/components/GroupedActivities';

export default function ActivitiesPage() {
  const router = useRouter();
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

  // 直接记录下一页要加载的页码
  const nextPageRef = useRef(1);

  // Filter running activities with valid route data
  const runningActivities = React.useMemo(() => {
    return activities.filter((a: StravaActivity) => {
      if (a.type !== 'Run') return false;
      const hasRoute = a.map?.summary_polyline && a.map.summary_polyline.length > 10;
      return hasRoute;
    });
  }, [activities]);

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

  // 检查是否有新数据
  const checkForNewActivities = useCallback(async () => {
    if (!user?.accessToken || !latestActivityId) return;
    
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
      } else {
        // 新数据>=200条，可能错过数据，需要完全刷新
        console.log('[CheckNew] too many new activities, full refresh needed');
        setActivities(page1Activities);
        nextPageRef.current = 2;
        setLoadedPages(1);
        setLatestActivityId(page1Activities[0]?.id || null);
        setLastFetchedAt(Date.now());
        setHasMore(page1Activities.length === 200);
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
            <>
              <p className="font-mono text-zinc-600 dark:text-zinc-400 mb-4">{t('auth.sessionExpired')}</p>
              <button onClick={handleReauth} className="px-4 py-2 font-mono text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                {t('auth.relogin')}
              </button>
            </>
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
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          <h1 className="font-pixel text-xl font-bold truncate shrink-0">
            {t('activity.recentRuns')}
          </h1>
          {runningActivities.length > 0 && (
            <div className="relative shrink-0">
              <RunningStats activities={runningActivities} />
            </div>
          )}
        </div>

        {needsReauth ? (
          <button onClick={handleReauth} className="shrink-0 inline-flex items-center gap-1 font-mono text-xs text-amber-600 hover:text-amber-700 dark:hover:text-amber-400 p-2">
            {t('auth.relogin')}
          </button>
        ) : (
          <button onClick={handleRefresh} disabled={refreshing || isLoading} className="shrink-0 inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 p-2" title="刷新数据">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {!refreshing && (rateLimited ? t('errors.rateLimited') : isActivitiesCacheStale(lastFetchedAt) ? t('common.expired') : '')}
          </button>
        )}
      </div>

      {/* Warning banner */}
      {(needsReauth || rateLimited) && activities.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-amber-700 dark:text-amber-400">
              {rateLimited ? t('errors.rateLimitedShowCache') : t('auth.sessionExpiredShowCache')}
            </span>
            {needsReauth && (
              <button onClick={handleReauth} className="font-mono text-xs text-amber-700 dark:text-amber-400 hover:underline">
                {t('auth.relogin')}
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
          <GroupedActivities activities={runningActivities} hasMore={hasMore} isLoading={isLoading} />
          
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
    </div>
  );
}
