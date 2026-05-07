'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { StravaActivity, ActivityStream, StravaSplit, StravaLap } from '@/types';
import { getActivity, getActivityStreams, formatDateTime, formatDistance, formatDuration, formatPace } from '@/lib/strava';
import { getCachedActivity, setCachedActivity } from '@/lib/cache';
import { useActivitiesStore } from '@/store/activities';
import { ActivityMap } from '@/components/map/ActivityMap';
import { AIAnalysisCard } from '@/components/AIAnalysisCard';
import { SplitsTable } from '@/components/SplitsTable';
import { LapsTable } from '@/components/LapsTable';
import { ActivityStats } from '@/components/ActivityStats';
import { SimpleLineChart } from '@/components/charts/SimpleLineChart';
import { SharePosterModal } from '@/components/SharePosterModal';
import { SaveRouteButton } from '@/components/SaveRouteButton';
import { ChevronLeft, Loader2, RefreshCw, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// 20km threshold for collapsing
const SPLIT_DISTANCE_THRESHOLD = 20; // km
const LAP_DISTANCE_THRESHOLD = 20; // km

export default function ActivityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, user, logout } = useAuth();
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();
  const isDark = resolvedTheme === 'dark';
  const [activity, setActivity] = useState<StravaActivity | null>(null);
  const [streams, setStreams] = useState<Record<string, ActivityStream> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [splitsExpanded, setSplitsExpanded] = useState(false);
  const [lapsExpanded, setLapsExpanded] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [forceShow, setForceShow] = useState(false);
  const [hasShownContent, setHasShownContent] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Use ref to track if we have loaded data to avoid infinite loops
  const hasLoadedRef = useRef(false);
  const activityRef = useRef<StravaActivity | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);
  
  // Once content is shown, never go back to loading
  useEffect(() => {
    if (activity && !hasShownContent) {
      setHasShownContent(true);
    }
  }, [activity, hasShownContent]);
  
  // Timeout to force show page if map gets stuck
  useEffect(() => {
    if (activity && !forceShow) {
      const timeout = setTimeout(() => {
        setForceShow(true);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [activity, forceShow]);

  const activityId = parseInt(params.id as string, 10);

  // Handle 401 error - try refresh session or logout
  const handleAuthError = useCallback(async () => {
    // Try to refresh session first
    try {
      const response = await fetch('/api/auth/session', { method: 'GET' });
      if (!response.ok) {
        // Session is really expired
        setNeedsReauth(true);
        logout();
        return false;
      }
      const session = await response.json();
      if (!session?.user) {
        setNeedsReauth(true);
        logout();
        return false;
      }
      // Session refreshed, retry should work
      return true;
    } catch {
      setNeedsReauth(true);
      logout();
      return false;
    }
  }, [logout]);

  // Load data with cache-first strategy
  const loadData = useCallback(async (isRefresh = false) => {
    if (!user?.accessToken || !activityId) return;

    // If not refreshing, try cache first
    if (!isRefresh) {
      const cached = getCachedActivity(activityId);
      if (cached) {
        setActivity(cached.activity);
        setStreams(cached.streams);
        setIsFromCache(true);
        setLoading(false);
      }
    }

    // Always try to fetch fresh data in background
    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      const [activityData, streamsData] = await Promise.all([
        getActivity(user.accessToken, activityId),
        getActivityStreams(user.accessToken, activityId).catch(() => null),
      ]);
      
      // Update state with fresh data
      setActivity(activityData);
      setStreams(streamsData);
      setIsFromCache(false);
      setError('');
      setNeedsReauth(false);
      setRateLimited(false);
      
      // Cache the fresh data
      setCachedActivity(activityId, activityData, streamsData);
      
      // Sync gear data back to activities store so /gear page can use it
      const store = useActivitiesStore.getState();
      const storeActivities = store.activities;
      const idx = storeActivities.findIndex((a) => a.id === activityId);
      if (idx >= 0) {
        const updated = [...storeActivities];
        updated[idx] = {
          ...updated[idx],
          gear_id: activityData.gear_id,
          gear: activityData.gear,
        };
        store.setActivities(updated);
      }
    } catch (err: any) {
      console.error('Failed to refresh activity:', err);
      
      const errorMessage = err?.message || '';
      const currentActivity = activityRef.current;
      
      // Check if it's an auth error
      if (errorMessage.includes('401')) {
        // Try to refresh session
        const refreshed = await handleAuthError();
        if (!refreshed && !currentActivity) {
          // If we have cached data, show it with a warning
          setError('登录已过期，请重新登录');
        }
      } 
      // Check if it's a rate limit error
      else if (errorMessage.includes('429')) {
        setRateLimited(true);
        // Don't show error if we have cached data
        if (!currentActivity) {
          setError('请求过于频繁，请稍后再试');
        }
      }
      // Network error
      else if (errorMessage.includes('Network error') || errorMessage.includes('Failed to fetch')) {
        if (!currentActivity) {
          setError('网络错误，请检查连接');
        }
      }
      else if (!currentActivity) {
        // Only show error if we don't have cached data
        setError(errorMessage || 'Failed to load activity');
      }
      // If we have cached data, silently fail and keep showing it
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.accessToken, activityId, handleAuthError]);

  useEffect(() => {
    if (!isAuthenticated) {
      // Check if we have cached data to show
      const cached = getCachedActivity(activityId);
      if (!cached) {
        router.push('/');
      }
      return;
    }

    if (!user?.accessToken || !activityId) return;
    
    // Only load once to avoid infinite loop
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadData(false);
    }
  }, [isAuthenticated, user?.accessToken, activityId, router, loadData]);

  // Split data into visible and hidden based on 20km threshold
  const { visibleSplits, hiddenSplits, hasHiddenSplits } = useMemo(() => {
    if (!activity?.splits_metric) {
      return { visibleSplits: [], hiddenSplits: [], hasHiddenSplits: false };
    }
    
    let accumulatedDistance = 0;
    const visible: StravaSplit[] = [];
    const hidden: StravaSplit[] = [];
    
    for (const split of activity.splits_metric) {
      if (accumulatedDistance < SPLIT_DISTANCE_THRESHOLD * 1000) {
        visible.push(split);
      } else {
        hidden.push(split);
      }
      accumulatedDistance += split.distance;
    }
    
    return { 
      visibleSplits: visible, 
      hiddenSplits: hidden, 
      hasHiddenSplits: hidden.length > 0 
    };
  }, [activity?.splits_metric]);

  // Lap data into visible and hidden based on 20km threshold
  const { visibleLaps, hiddenLaps, hasHiddenLaps } = useMemo(() => {
    if (!activity?.laps) {
      return { visibleLaps: [], hiddenLaps: [], hasHiddenLaps: false };
    }
    
    let accumulatedDistance = 0;
    const visible: StravaLap[] = [];
    const hidden: StravaLap[] = [];
    
    for (const lap of activity.laps) {
      if (accumulatedDistance < LAP_DISTANCE_THRESHOLD * 1000) {
        visible.push(lap);
      } else {
        hidden.push(lap);
      }
      accumulatedDistance += lap.distance;
    }
    
    return { 
      visibleLaps: visible, 
      hiddenLaps: hidden, 
      hasHiddenLaps: hidden.length > 0 
    };
  }, [activity?.laps]);

  // Show loading only if no cache data available
  if (loading && !activity) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="container mx-auto px-4 py-4 max-w-2xl">
            <Link 
              href="/activities" 
              className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              {t('common.back')}
            </Link>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-zinc-400" size={32} />
        </div>
      </div>
    );
  }

  // Show error page if no cache and error
  if ((error || needsReauth || rateLimited) && !activity) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="container mx-auto px-4 py-4 max-w-2xl">
            <Link 
              href="/activities" 
              className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              {t('common.back')}
            </Link>
          </div>
        </div>
        <div className="container mx-auto px-4 py-12 max-w-2xl">
          <div className="text-center">
            {rateLimited ? (
              <>
                <p className="font-mono text-amber-600 dark:text-amber-400 mb-2">请求过于频繁</p>
                <p className="font-mono text-sm text-zinc-500 mb-4">Strava API 限流中，请 15 分钟后再试</p>
              </>
            ) : needsReauth ? (
              <p className="font-mono text-zinc-600 dark:text-zinc-400">登录已过期，请重新登录</p>
            ) : (
              <>
                <p className="font-mono text-red-500">{error}</p>
                <button 
                  onClick={() => loadData(true)}
                  className="mt-4 px-4 py-2 font-mono text-sm bg-zinc-100 dark:bg-zinc-800 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  重试
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show splits only if more than 1 split
  const shouldShowSplits = activity?.splits_metric && activity.splits_metric.length > 1;
  // Show laps only if more than 1 lap
  const shouldShowLaps = activity?.laps && activity.laps.length > 1;

  // Page is ready if we have activity data
  // Once shown, always stay ready (never go back to full-page loading)
  const isPageReady = hasShownContent || (activity && (mapReady || !activity.map?.polyline || isFromCache || forceShow));

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
          
          {/* Refresh button - only show if we have data */}
          {activity && (
            <button
              onClick={() => loadData(true)}
              disabled={refreshing || needsReauth || rateLimited}
              className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {rateLimited ? t('errors.rateLimited', '限流中') : refreshing ? t('common.refreshing', '刷新中') : isFromCache ? t('common.cached', '缓存') : ''}
            </button>
          )}
        </div>
      </div>

      {/* Warning banner */}
      {(needsReauth || rateLimited) && activity && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div className="container mx-auto px-4 py-2 max-w-2xl">
            <span className="font-mono text-xs text-amber-700 dark:text-amber-400">
              {rateLimited ? t('errors.rateLimitedShowCache', '请求过于频繁，显示缓存数据') : t('auth.sessionExpiredShowCache', '登录已过期，显示缓存数据')}
            </span>
          </div>
        </div>
      )}

      {/* Page content or full-page loading - only show once */}
      {!isPageReady ? (
        <div className="flex-1 flex items-center justify-center min-h-[50vh]">
          <Loader2 className="animate-spin text-zinc-400" size={32} />
        </div>
      ) : activity && (
        <div className="container mx-auto px-4 py-4 max-w-2xl relative">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-pixel text-xl font-bold mb-1">{activity.name}</h1>
              <p className="font-mono text-xs text-zinc-500">
                {formatDateTime(activity.start_date_local)}
              </p>
              {activity.description && activity.description.trim().length > 0 && (
                <p className="font-mono text-xs text-zinc-400 mt-1 break-words">
                  {activity.description.trim()}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
              <SaveRouteButton activity={activity} />
              {activity.map?.polyline && (
                <button
                  onClick={() => setIsShareOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-mono text-xs font-bold uppercase border-2 border-zinc-800 dark:border-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title={t('sharePoster.title', '分享海报')}
                >
                  <Share2 size={14} />
                  <span className="hidden sm:inline">{t('sharePoster.title', '分享海报')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Map - notify when ready */}
          {activity.map?.polyline && (
            <div className="mb-4 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
              <ActivityMap 
                polyline={activity.map.polyline}
                startLatlng={activity.start_latlng}
                endLatlng={activity.end_latlng}
                height="200px"
                isDark={isDark}
                onReady={() => setMapReady(true)}
              />
            </div>
          )}

          {/* Main Stats - Compact, no truncate */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <StatCard 
              label={t('activity.distance')}
              value={formatDistance(activity.distance, 'km')}
            />
            <StatCard 
              label={t('activity.time')}
              value={formatDuration(activity.moving_time)}
            />
            <StatCard 
              label={t('activity.pace')}
              value={formatPace(activity.distance, activity.moving_time, 'min/km')}
            />
            <StatCard 
              label={t('activity.elapsedTime', '用时')}
              value={formatDuration(activity.elapsed_time)}
            />
          </div>

          {/* Extended Stats */}
          <div className="mb-4">
            <ActivityStats activity={activity} />
          </div>

          {/* Best Efforts */}
          {activity.best_efforts && activity.best_efforts.length > 0 && (
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-mono text-[10px] font-bold uppercase text-zinc-500">
                  {t('activity.bestEfforts', '本次最佳成绩')}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {sortBestEfforts(activity.best_efforts).map((effort) => (
                  <div
                    key={effort.name}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                  >
                    <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {effort.name}
                    </span>
                    <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                      {formatDuration(effort.elapsed_time)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Segment Efforts */}
          {activity.segment_efforts && activity.segment_efforts.length > 0 && (
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-mono text-[10px] font-bold uppercase text-zinc-500">
                  {t('activity.segmentEfforts', '路段成绩')}
                  <span className="ml-1 font-normal text-zinc-400">({activity.segment_efforts.length})</span>
                </h3>
              </div>
              <div className="space-y-2">
                {activity.segment_efforts.map((effort) => (
                  <div
                    key={effort.id}
                    className="flex items-center justify-between px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">
                          {effort.segment.name}
                        </span>
                        {effort.pr_rank === 1 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
                            PR
                          </span>
                        )}
                        {effort.kom_rank && effort.kom_rank <= 3 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-300 dark:border-red-700">
                            #{effort.kom_rank}
                          </span>
                        )}
                        {effort.achievements && effort.achievements.map((a, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-600"
                          >
                            {a.type} #{a.rank}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-mono text-[10px] text-zinc-400">
                          {(effort.segment.distance / 1000).toFixed(2)} km
                        </span>
                        <span className="font-mono text-[10px] text-zinc-400">
                          {effort.segment.average_grade > 0 ? '+' : ''}{effort.segment.average_grade.toFixed(1)}%
                        </span>
                        <span className="font-mono text-[10px] text-blue-500 dark:text-blue-400">
                          {formatPace(effort.segment.distance, effort.elapsed_time, 'min/km')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        {formatDuration(effort.elapsed_time)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Achievements */}
          {activity.achievements && activity.achievements.length > 0 && (
            <div className="mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-mono text-[10px] font-bold uppercase text-zinc-500">
                  {t('activity.achievements', '成就')}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {activity.achievements.map((achievement, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-1 font-mono text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                  >
                    {achievement.type}
                    {achievement.rank && <span className="ml-1">#{achievement.rank}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Charts */}
          {streams && (
            <div className="space-y-5 mb-4">
              {streams.heartrate && (
                <ChartSection 
                  title={t('activity.heartRate')}
                  subtitle={(() => {
                    const data = streams.heartrate.data as number[];
                    const valid = data.filter(v => v > 50);
                    if (valid.length === 0) return '';
                    const min = Math.min(...valid);
                    const max = Math.max(...valid);
                    return `${Math.round(min)} bpm ~ ${Math.round(max)} bpm`;
                  })()}
                >
                  <SimpleLineChart 
                    data={streams.heartrate.data as number[]}
                    color="#ef4444"
                    height={220}
                    yUnit="bpm"
                    xLabels={['0km', `${(activity.distance / 1000).toFixed(1)}km`]}
                    domain={(() => {
                      const data = streams.heartrate.data as number[];
                      const valid = data.filter(v => v > 50);
                      if (valid.length === 0) return undefined;
                      const min = Math.min(...valid);
                      const max = Math.max(...valid);
                      return [min, max];
                    })()}
                  />
                </ChartSection>
              )}
              
              {streams.velocity_smooth && (
                <ChartSection 
                  title={t('activity.pace')}
                  subtitle={(() => {
                    const paces = processPaceData(streams.velocity_smooth.data as number[]);
                    if (paces.length === 0) return '';
                    const validPaces = paces.filter(p => p > 0);
                    const minPace = Math.min(...validPaces);
                    const maxPace = Math.max(...validPaces);
                    return `${formatPaceValue(minPace)} ~ ${formatPaceValue(maxPace)}`;
                  })()}
                >
                  <SimpleLineChart 
                    data={processPaceData(streams.velocity_smooth.data as number[])}
                    color="#3b82f6"
                    height={220}
                    xLabels={['0km', `${(activity.distance / 1000).toFixed(1)}km`]}
                    formatYLabel={(v) => formatPaceValue(v)}
                    domain={(() => {
                      const paces = processPaceData(streams.velocity_smooth.data as number[]).filter(p => p > 0);
                      if (paces.length === 0) return undefined;
                      return [Math.min(...paces), Math.max(...paces)];
                    })()}
                    smooth={5}
                  />
                </ChartSection>
              )}
              
              {streams.altitude && (
                <ChartSection 
                  title={t('activity.elevation')}
                  subtitle={`${Math.round(activity.elev_low || 0)}m ~ ${Math.round(activity.elev_high || 0)}m`}
                >
                  <SimpleLineChart 
                    data={streams.altitude.data as number[]}
                    color="#22c55e"
                    height={220}
                    yUnit="m"
                    fill
                    xLabels={['0km', `${(activity.distance / 1000).toFixed(1)}km`]}
                    domain={(() => {
                      const data = streams.altitude.data as number[];
                      if (data.length === 0) return undefined;
                      return [Math.min(...data), Math.max(...data)];
                    })()}
                  />
                </ChartSection>
              )}
            </div>
          )}

          {/* AI Analysis */}
          {activity && (
            <AIAnalysisCard 
              activity={activity} 
              streams={streams} 
            />
          )}

          {/* Splits - Show first 20km, collapse rest (only if more than 1) */}
          {shouldShowSplits && (
            <div className="mb-4">
              <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
                <h2 className="font-mono text-xs font-bold uppercase text-zinc-500">
                  {t('activity.splits')} ({activity.splits_metric!.length})
                </h2>
              </div>
              <div className="mt-3">
                <SplitsTable splits={visibleSplits} showHeader={true} />
                
                {hasHiddenSplits && (
                  <>
                    {splitsExpanded && (
                      <SplitsTable splits={hiddenSplits} showHeader={false} />
                    )}
                    <button
                      onClick={() => setSplitsExpanded(!splitsExpanded)}
                      className="w-full py-3 text-center font-mono text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-t border-zinc-200 dark:border-zinc-700 mt-0"
                    >
                      {splitsExpanded ? t('common.showLess', '收起') : t('common.showMore', '查看更多')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Laps - Show first 20km, collapse rest (only if more than 1) */}
          {shouldShowLaps && (
            <div className="mb-4">
              <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
                <h2 className="font-mono text-xs font-bold uppercase text-zinc-500">
                  {t('activity.laps')} ({activity.laps!.length})
                </h2>
              </div>
              <div className="mt-3">
                <LapsTable laps={visibleLaps} showHeader={true} />
                
                {hasHiddenLaps && (
                  <>
                    {lapsExpanded && (
                      <LapsTable laps={hiddenLaps} showHeader={false} />
                    )}
                    <button
                      onClick={() => setLapsExpanded(!lapsExpanded)}
                      className="w-full py-3 text-center font-mono text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-t border-zinc-200 dark:border-zinc-700 mt-0"
                    >
                      {lapsExpanded ? t('common.showLess', '收起') : t('common.showMore', '查看更多')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <SharePosterModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        activityName={activity?.name || ''}
        activityDate={activity?.start_date_local?.split('T')[0]?.replace(/-/g, '') || ''}
        polyline={activity?.map?.polyline || null}
        stats={activity ? {
          distance: formatDistance(activity.distance, 'km'),
          duration: formatDuration(activity.moving_time),
          pace: formatPace(activity.distance, activity.moving_time, 'min/km'),
        } : null}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-2">
      <p className="font-mono text-[10px] text-zinc-500 uppercase">{label}</p>
      <p className="font-mono text-sm font-bold">{value}</p>
    </div>
  );
}

function ChartSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-mono text-[10px] font-bold uppercase text-zinc-500">{title}</h3>
        {subtitle && <span className="font-mono text-[10px] text-zinc-400">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

// Process pace data with percentile-based clamping
function processPaceData(velocityData: number[]): number[] {
  // Convert velocity (m/s) to pace (min/km)
  const rawPaces = velocityData.map(v => v > 0 ? 1000 / v / 60 : 0);
  
  // Get valid paces for percentile calculation
  const validPaces = rawPaces.filter(p => p > 0);
  if (validPaces.length === 0) return rawPaces;
  
  // Sort for percentile calculation
  const sortedPaces = [...validPaces].sort((a, b) => a - b);
  
  // Use 10th and 90th percentile as bounds (tighter than 5th-95th)
  const lowerIndex = Math.floor(sortedPaces.length * 0.10);
  const upperIndex = Math.floor(sortedPaces.length * 0.90);
  const lowerBound = sortedPaces[lowerIndex];
  const upperBound = sortedPaces[upperIndex];
  
  // Clamp values to the percentile bounds
  return rawPaces.map(p => {
    if (p === 0) return lowerBound; // avoid 0'00" flat line at start
    if (p < lowerBound) return lowerBound;
    if (p > upperBound) return upperBound;
    return p;
  });
}

// Format pace value as M'SS"
function formatPaceValue(pace: number): string {
  if (!isFinite(pace) || pace < 0) return '--';
  if (pace === 0) return '0\'00"';  // Show 0'00" instead of --
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60);
  return `${min}'${sec.toString().padStart(2, '0')}"`;
}

interface StravaBestEffort {
  name: string;
  elapsed_time: number;
}

/**
 * Parse effort name to distance in km for sorting.
 * Supports: 400m, 1/2 mile, 1k, 1 mile, 2 mile, 5k, 10k, 15k, 10 mile, 20k, half, 30k, marathon
 */
function parseEffortDistance(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes('400m')) return 0.4;
  if (lower.includes('1/2 mile') || lower.includes('half mile')) return 0.804;
  if (lower.includes('1k') || lower.includes('1 kilometer')) return 1;
  if (lower.includes('1 mile')) return 1.609;
  if (lower.includes('2 mile')) return 3.219;
  if (lower.includes('5k') || lower.includes('5 kilometer')) return 5;
  if (lower.includes('10k') || lower.includes('10 kilometer')) return 10;
  if (lower.includes('15k') || lower.includes('15 kilometer')) return 15;
  if (lower.includes('10 mile')) return 16.093;
  if (lower.includes('20k') || lower.includes('20 kilometer')) return 20;
  if (lower.includes('half') || lower.includes('21k') || lower.includes('21.1k')) return 21.1;
  if (lower.includes('30k') || lower.includes('30 kilometer')) return 30;
  if (lower.includes('marathon') || lower.includes('42k') || lower.includes('42.2k')) return 42.2;
  // Fallback: try to extract number + unit
  const matchKm = lower.match(/(\d+(?:\.\d+)?)\s*k/);
  if (matchKm) return parseFloat(matchKm[1]);
  const matchM = lower.match(/(\d+(?:\.\d+)?)\s*m/);
  if (matchM) return parseFloat(matchM[1]) / 1000;
  const matchMi = lower.match(/(\d+(?:\.\d+)?)\s*mile/);
  if (matchMi) return parseFloat(matchMi[1]) * 1.609;
  return 999; // Unknown distances go to the end
}

/**
 * Sort best efforts by distance (shortest first).
 */
function sortBestEfforts(efforts: StravaBestEffort[]): StravaBestEffort[] {
  return [...efforts].sort((a, b) => parseEffortDistance(a.name) - parseEffortDistance(b.name));
}
