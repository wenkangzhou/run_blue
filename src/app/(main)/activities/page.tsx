'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore, isActivitiesCacheStale } from '@/store/activities';
import { PixelButton } from '@/components/ui';
import { StravaActivity } from '@/types';
import { getActivities, formatDistance, formatDuration } from '@/lib/strava';
import { Loader2, RefreshCw } from 'lucide-react';
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
    page,
    hasMore,
    lastFetchedAt,
    setActivities,
    appendActivities,
    setLoading,
    setError,
    setPage,
    setHasMore,
    setLastFetchedAt,
    clearActivities,
  } = useActivitiesStore();

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  // Filter running activities with valid route data
  const runningActivities = React.useMemo(() => {
    return activities.filter((a: StravaActivity) => {
      // Must be a run
      if (a.type !== 'Run') return false;
      // Must have valid route data
      const hasRoute = a.map?.summary_polyline && a.map.summary_polyline.length > 10;
      return hasRoute;
    });
  }, [activities]);

  // Calculate stats
  const stats = React.useMemo(() => {
    const totalDistance = runningActivities.reduce((sum, a) => sum + a.distance, 0);
    const totalTime = runningActivities.reduce((sum, a) => sum + a.moving_time, 0);
    return {
      totalDistance,
      totalRuns: runningActivities.length,
      totalTime,
    };
  }, [runningActivities]);

  // Load activities with cache-first strategy
  const loadActivities = useCallback(async (isRefresh = false) => {
    if (!user?.accessToken) return;

    if (isRefresh) {
      setRefreshing(true);
      // Reset pagination for refresh
      setPage(1);
      setHasMore(true);
      setNeedsReauth(false);
      setRateLimited(false);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const newActivities = await getActivities(user.accessToken, 1, 200);
      
      if (isRefresh) {
        // Replace all activities on refresh
        setActivities(newActivities);
        setPage(2);
        setHasMore(newActivities.length === 200);
      } else {
        if (newActivities.length === 0) {
          setHasMore(false);
        } else {
          appendActivities(newActivities);
          setPage(page + 1);
        }
      }
      setLastFetchedAt(Date.now());
      setNeedsReauth(false);
      setRateLimited(false);
    } catch (err: any) {
      const errorMessage = err?.message || '';
      
      // Check if it's an auth error
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        setNeedsReauth(true);
        // If we have no cached data, show error
        if (activities.length === 0) {
          setError('登录已过期，请重新登录');
        }
      } 
      // Check if it's a rate limit error
      else if (errorMessage.includes('429')) {
        setRateLimited(true);
        // Don't show error if we have cached data
        if (activities.length === 0) {
          setError('请求过于频繁，请稍后再试');
        }
      }
      else {
        // If we have cached data, don't show error
        if (activities.length === 0) {
          setError('Failed to load activities');
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, [user?.accessToken, page, activities.length, setActivities, appendActivities, setLoading, setError, setPage, setHasMore, setLastFetchedAt]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    if (!user?.accessToken) return;

    // Check if we need to load data
    if (activities.length === 0) {
      // No cache, load fresh
      loadActivities(false);
    } else if (isActivitiesCacheStale(lastFetchedAt)) {
      // Cache is stale, refresh in background
      setInitialLoading(false);
      loadActivities(true);
    } else {
      // Cache is fresh, use it
      setInitialLoading(false);
    }
  }, [isAuthenticated, user, activities.length, lastFetchedAt, loadActivities, router]);

  const loadMore = () => {
    if (page === 1) {
      setPage(2);
    }
    loadActivities(false);
  };

  const handleRefresh = () => {
    // Don't clear activities on refresh - if fetch fails, we keep the cache
    loadActivities(true);
  };
  
  const handleForceRefresh = () => {
    // Force clear and reload - only use this when user explicitly wants to clear cache
    clearActivities();
    loadActivities(true);
  };

  const handleReauth = () => {
    logout();
    router.push('/api/auth/signin/strava');
  };

  if (!isAuthenticated) {
    return null;
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

  // Show error page if no cache and error
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
              <button 
                onClick={handleReauth}
                className="px-4 py-2 font-mono text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {t('auth.relogin')}
              </button>
            </>
          ) : (
            <>
              <p className="font-mono text-red-500">{error}</p>
              <PixelButton
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => loadActivities(false)}
              >
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
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-pixel text-xl font-bold">
            {t('activity.recentRuns')}
          </h1>
          
          {/* Stats Toggle - compact */}
          {runningActivities.length > 0 && (
            <div className="relative">
              <RunningStats activities={runningActivities} />
            </div>
          )}
        </div>

        {/* Refresh/Reauth Button */}
        {needsReauth ? (
          <button
            onClick={handleReauth}
            className="inline-flex items-center gap-1 font-mono text-xs text-amber-600 hover:text-amber-700 dark:hover:text-amber-400 p-2"
          >
            {t('auth.relogin')}
          </button>
        ) : (
          <button
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
            className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 p-2"
            title="刷新数据"
          >
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
              <button 
                onClick={handleReauth}
                className="font-mono text-xs text-amber-700 dark:text-amber-400 hover:underline"
              >
                重新登录
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
        <GroupedActivities activities={runningActivities} />
      )}
    </div>
  );
}
