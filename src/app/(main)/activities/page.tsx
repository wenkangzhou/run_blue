'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore, isActivitiesCacheStale } from '@/store/activities';
import { PixelButton } from '@/components/ui';
import { StravaActivity } from '@/types';
import { getActivities, formatDistance, formatDuration } from '@/lib/strava';
import { Loader2, RefreshCw } from 'lucide-react';
import { ActivityGridCard } from '@/components/ActivityGridCard';

export default function ActivitiesPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
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
    } catch (err: any) {
      // If we have cached data, don't show error
      if (activities.length === 0) {
        setError('Failed to load activities');
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
    clearActivities();
    loadActivities(true);
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
            加载中...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 py-4">
      {/* Header with Stats */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="font-pixel text-xl font-bold mb-2">
            最近跑步记录
          </h1>
          
          {/* Stats Summary */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500">总距离</span>
              <span className="font-bold">{formatDistance(stats.totalDistance, 'km')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500">次数</span>
              <span className="font-bold">{stats.totalRuns}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500">总时间</span>
              <span className="font-bold">{formatDuration(stats.totalTime)}</span>
            </div>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing || isLoading}
          className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50 p-2"
          title="刷新数据"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? '刷新中' : isActivitiesCacheStale(lastFetchedAt) ? '已过期' : ''}
        </button>
      </div>

      {error && activities.length === 0 && (
        <div className="mb-6 p-4 border-4 border-red-600 bg-red-50 dark:bg-red-950">
          <p className="font-mono text-red-600 dark:text-red-400">{error}</p>
          <PixelButton
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => loadActivities(false)}
          >
            重试
          </PixelButton>
        </div>
      )}

      {runningActivities.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-mono text-zinc-500">没有找到跑步记录</p>
        </div>
      ) : (
        <>
          {/* Grid Layout - 3 columns, taller cards */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {runningActivities.map((activity: StravaActivity, index: number) => (
              <ActivityGridCard 
                key={`${activity.id}-${index}`} 
                activity={activity} 
              />
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 text-center">
              <PixelButton
                onClick={loadMore}
                isLoading={isLoading}
                disabled={isLoading}
              >
                加载更多
              </PixelButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
