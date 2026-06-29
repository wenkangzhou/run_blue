'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { StravaActivity, ActivityStream, StravaSplit, StravaLap } from '@/types';
import { getActivity, getActivityStreams, formatDateTime, formatDistance, formatPace } from '@/lib/strava';
import { formatPaceSeconds } from '@/lib/paceFormat';
import { getCachedActivity, setCachedActivity, shouldRefreshCachedActivity } from '@/lib/cache';
import { getActivityDateKey } from '@/lib/dates';
import {
  ACTIVITY_WORKOUT_TRANSLATION_KEYS,
  getActivityWorkoutCategory,
  type ActivityWorkoutCategory,
} from '@/lib/activityWorkoutType';
import { useActivitiesStore } from '@/store/activities';
import { useRoutesStore } from '@/store/routes';
import { getGuestActivities, getGuestActivity, getGuestActivityStreams, getGuestSavedRoutes, isGuestUser } from '@/lib/guestMode';
import { ActivityMap } from '@/components/map/ActivityMap';
import { AIAnalysisCard } from '@/components/AIAnalysisCard';
import { SplitsTable } from '@/components/SplitsTable';
import { LapsTable } from '@/components/LapsTable';
import { ActivityStats } from '@/components/ActivityStats';
import { SimpleLineChart } from '@/components/charts/SimpleLineChart';
import { SharePosterModal } from '@/components/SharePosterModal';
import { SaveRouteButton } from '@/components/SaveRouteButton';
import { calculatePaceTrend } from '@/lib/paceTrend';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  Gauge,
  HeartPulse,
  MapPin,
  Mountain,
  RefreshCw,
  Route,
  Share2,
  Timer,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSessionPageState } from '@/hooks/useSessionPageState';

// 20km threshold for collapsing
const SPLIT_DISTANCE_THRESHOLD = 20; // km
const LAP_DISTANCE_THRESHOLD = 20; // km
const DESCRIPTION_PREVIEW_LENGTH = 128;
const WORKOUT_TYPE_BADGE_STYLES: Record<ActivityWorkoutCategory, string> = {
  normal: 'border-zinc-200 bg-white/90 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300',
  race: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300',
  longRun: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/50 dark:text-blue-300',
  workout: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/50 dark:text-orange-300',
};

export default function ActivityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth();
  const isGuest = isGuestUser(user);
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();
  const isDark = resolvedTheme === 'dark';
  const activityId = parseInt(params.id as string, 10);
  const { activities: storedActivities, selectedActivity } = useActivitiesStore();
  const allActivities = useMemo(
    () => (isGuest ? getGuestActivities() : storedActivities),
    [isGuest, storedActivities]
  );
  const selectedSeedActivity = selectedActivity?.id === activityId
    ? selectedActivity
    : allActivities.find((candidate) => candidate.id === activityId) ?? null;
  const [activity, setActivity] = useState<StravaActivity | null>(() => selectedSeedActivity);
  const [streams, setStreams] = useState<Record<string, ActivityStream> | null>(null);
  const [loading, setLoading] = useState(() => !selectedSeedActivity);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [, setMapReady] = useState(false);
  const [splitsExpanded, setSplitsExpanded] = useSessionPageState<boolean>(
    `run_blue_page:activity:${activityId}:splits-expanded`,
    false,
    (value): value is boolean => typeof value === 'boolean'
  );
  const [lapsExpanded, setLapsExpanded] = useSessionPageState<boolean>(
    `run_blue_page:activity:${activityId}:laps-expanded`,
    false,
    (value): value is boolean => typeof value === 'boolean'
  );
  const [needsReauth, setNeedsReauth] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [hasShownContent, setHasShownContent] = useState(() => Boolean(selectedSeedActivity));
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useSessionPageState<boolean>(
    `run_blue_page:activity:${activityId}:description-expanded`,
    false,
    (value): value is boolean => typeof value === 'boolean'
  );

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const historyIndex = typeof window.history.state?.idx === 'number'
        ? window.history.state.idx
        : 0;

      if (historyIndex > 0) {
        router.back();
        window.setTimeout(() => {
          if (window.location.pathname === currentPath) {
            router.push('/activities');
          }
        }, 450);
        return;
      }
    }

    router.push('/activities');
  }, [router]);

  // Pace trend data
  const paceTrend = useMemo(() => {
    if (!activity) return null;
    return calculatePaceTrend(allActivities, activity.id);
  }, [allActivities, activity]);

  // Route achievement data
  const { savedRoutes: storedSavedRoutes } = useRoutesStore();
  const savedRoutes = useMemo(
    () => (isGuest ? getGuestSavedRoutes() : storedSavedRoutes),
    [isGuest, storedSavedRoutes]
  );
  const routeAchievement = useMemo(() => {
    if (!activity) return null;
    // Find route that contains this activity
    const route = savedRoutes.find((r) => r.activityIds.includes(activity.id));
    if (!route) return null;

    // Get all activities for this route
    const routeActivities = allActivities
      .filter((a) => route.activityIds.includes(a.id))
      .sort((a, b) => {
        const tsA = new Date(a.start_date).getTime();
        const tsB = new Date(b.start_date).getTime();
        return tsB - tsA; // newest first
      });

    if (routeActivities.length === 0) return null;

    // Calculate pace for each (seconds per km)
    const pacedActivities = routeActivities.map((a) => ({
      id: a.id,
      pace: a.moving_time / (a.distance / 1000), // sec/km
      date: a.start_date,
    }));

    // Sort by pace (fastest first)
    const byPace = [...pacedActivities].sort((a, b) => a.pace - b.pace);
    const currentPace = pacedActivities.find((p) => p.id === activity.id)?.pace ?? 0;
    const rank = byPace.findIndex((p) => p.id === activity.id) + 1; // 1-based
    const total = byPace.length;
    const isPB = rank === 1 && total > 1;

    // Average pace of all runs on this route
    const avgPace = pacedActivities.reduce((s, p) => s + p.pace, 0) / pacedActivities.length;
    const diffSec = currentPace - avgPace; // positive = slower

    return {
      routeKey: route.key,
      routeName: route.name,
      totalRuns: total,
      rank,
      isPB,
      diffSec,
      avgPace,
      currentPace,
    };
  }, [activity, savedRoutes, allActivities]);

  // Use ref to track if we have loaded data to avoid infinite loops
  const loadedActivityIdRef = useRef<number | null>(null);
  const checkedDetailCacheIdRef = useRef<number | null>(null);
  const activityRef = useRef<StravaActivity | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);

  useEffect(() => {
    if (selectedSeedActivity) {
      setActivity(selectedSeedActivity);
      setStreams(null);
      setLoading(false);
      setHasShownContent(true);
      return;
    }

    const currentActivity = activityRef.current;
    if (currentActivity && currentActivity.id !== activityId) {
      setActivity(null);
      setStreams(null);
      setLoading(true);
      setHasShownContent(false);
    }
  }, [activityId, selectedSeedActivity]);
  
  // Once content is shown, never go back to loading
  useEffect(() => {
    if (activity && !hasShownContent) {
      setHasShownContent(true);
    }
  }, [activity, hasShownContent]);
  
  useEffect(() => {
    if (activity || !selectedActivity || selectedActivity.id !== activityId) return;
    setActivity(selectedActivity);
    setLoading(false);
  }, [activity, activityId, selectedActivity]);

  useEffect(() => {
    if (isGuest || !activityId || activity || checkedDetailCacheIdRef.current === activityId) return;

    let cancelled = false;
    checkedDetailCacheIdRef.current = activityId;

    getCachedActivity(activityId)
      .then((cached) => {
        if (cancelled || !cached) return;
        setActivity(cached.activity);
        setStreams(cached.streams);
        setLoading(false);
      })
      .catch(() => {
        // The auth-aware loader below decides whether to redirect or show an error.
      });

    return () => {
      cancelled = true;
    };
  }, [isGuest, activity, activityId]);

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
    if (isGuest) {
      const guestActivity = getGuestActivity(activityId);
      if (!guestActivity) {
        setError(t('guest.missingActivity'));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setRefreshing(isRefresh);
      setActivity(guestActivity);
      setStreams(getGuestActivityStreams(activityId));
      setError('');
      setNeedsReauth(false);
      setRateLimited(false);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!user?.accessToken || !activityId) return;

    // If not refreshing, try cache first
    if (!isRefresh) {
      const cached = await getCachedActivity(activityId);
      if (cached) {
        setActivity(cached.activity);
        setStreams(cached.streams);
        setLoading(false);

        if (!shouldRefreshCachedActivity(cached)) {
          return;
        }
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
      setError('');
      setNeedsReauth(false);
      setRateLimited(false);
      
      // Cache the fresh data
      await setCachedActivity(activityId, activityData, streamsData);
      
      // Sync the refreshed detail back to the global activity cache.
      useActivitiesStore.getState().updateActivity(activityData);
    } catch (err) {
      console.error('Failed to refresh activity:', err);
      
      const errorMessage = err instanceof Error ? err.message : '';
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
  }, [isGuest, user?.accessToken, activityId, handleAuthError, t]);

  useEffect(() => {
    if (authLoading) return;
    if (!activityId) {
      router.push('/');
      return;
    }

    if (!isAuthenticated) {
      if (activityRef.current || selectedSeedActivity) {
        setLoading(false);
        return;
      }

      let cancelled = false;

      // Check if we have cached data to show.
      getCachedActivity(activityId)
        .then((cached) => {
          if (cancelled) return;
          if (!cached) {
            router.push('/');
            return;
          }

          setActivity(cached.activity);
          setStreams(cached.streams);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) router.push('/');
        });

      return () => {
        cancelled = true;
      };
    }

    if (!user?.accessToken || !activityId) return;
    
    // Only load once per activity id to avoid infinite loops.
    if (loadedActivityIdRef.current !== activityId) {
      loadedActivityIdRef.current = activityId;
      loadData(false);
    }
  }, [authLoading, isAuthenticated, user?.accessToken, activityId, router, loadData, selectedSeedActivity]);

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

  if (loading && !activity) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="container mx-auto px-4 py-2 max-w-6xl">
            <button
              onClick={handleBack}
              className="inline-flex h-9 items-center gap-1 rounded-md px-2 font-mono text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              {t('common.back')}
            </button>
          </div>
        </div>
        <ActivityDetailSkeleton />
      </div>
    );
  }

  // Show error page if no cache and error
  if ((error || needsReauth || rateLimited) && !activity) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="container mx-auto px-4 py-2 max-w-6xl">
            <button
              onClick={handleBack}
              className="inline-flex h-9 items-center gap-1 rounded-md px-2 font-mono text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              {t('common.back')}
            </button>
          </div>
        </div>
        <div className="container mx-auto px-4 py-12 max-w-6xl">
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
  const isPageReady = hasShownContent || Boolean(activity);
  const routePolyline = activity?.map?.polyline || activity?.map?.summary_polyline || null;
  const activityDescription = activity?.description?.trim() ?? '';
  const workoutCategory = activity ? getActivityWorkoutCategory(activity) : null;
  const shouldCollapseDescription = activityDescription.length > DESCRIPTION_PREVIEW_LENGTH;
  const displayedDescription = shouldCollapseDescription && !descriptionExpanded
    ? `${activityDescription.slice(0, DESCRIPTION_PREVIEW_LENGTH)}...`
    : activityDescription;
  const renderPrimarySideSections = (currentActivity: StravaActivity) => (
    <>
      <ActivityStats activity={currentActivity} />

      {paceTrend && (
        <SectionCard
          title={t('activity.paceTrend', '近期配速趋势')}
          icon={<TrendingUp size={15} />}
          aside={(
            <Link href="/stats" className="font-mono text-[10px] text-blue-600 hover:underline dark:text-blue-400">
              {t('activity.viewDetails', '查看详细对比')}
            </Link>
          )}
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-800">
              <div className="font-mono text-[10px] text-zinc-500">{t('activity.thisRun', '本次')}</div>
              <div className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{paceTrend.currentPaceStr}</div>
            </div>
            <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-800">
              <div className="font-mono text-[10px] text-zinc-500">{t('activity.last7Days', '近7天')}</div>
              <div className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{paceTrend.days7AvgStr}</div>
              <div className="font-mono text-[10px] text-zinc-500">{paceTrend.days7DiffStr}</div>
            </div>
            <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-800">
              <div className="font-mono text-[10px] text-zinc-500">{t('activity.last28Days', '近28天')}</div>
              <div className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{paceTrend.days28AvgStr}</div>
              <div className="font-mono text-[10px] text-zinc-500">{paceTrend.days28DiffStr}</div>
            </div>
          </div>
        </SectionCard>
      )}
    </>
  );
  const renderSecondarySideSections = (currentActivity: StravaActivity) => (
    <>
      {currentActivity.best_efforts && currentActivity.best_efforts.length > 0 && (
        <SectionCard title={t('activity.bestEfforts', '本次最佳成绩')} icon={<Trophy size={15} />}>
          <div className="flex flex-wrap gap-2">
            {sortBestEfforts(currentActivity.best_efforts).map((effort) => (
              <div
                key={effort.name}
                className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/70"
              >
                <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  {effort.name}
                </span>
                <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                  {formatDurationDetail(effort.elapsed_time)}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {currentActivity.achievements && currentActivity.achievements.length > 0 && (
        <SectionCard title={t('activity.achievements', '成就')}>
          <div className="flex flex-wrap gap-2">
            {currentActivity.achievements.map((achievement, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
              >
                {achievement.type}
                {achievement.rank && <span className="ml-1">#{achievement.rank}</span>}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {currentActivity.segment_efforts && currentActivity.segment_efforts.length > 0 && (
        <SectionCard
          title={t('activity.segmentEfforts', '路段成绩')}
          aside={`${currentActivity.segment_efforts.length}`}
        >
          <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {currentActivity.segment_efforts.map((effort) => (
              <div
                key={effort.id}
                className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/70"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {effort.segment.name}
                    </span>
                    {effort.pr_rank === 1 && (
                      <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        PR
                      </span>
                    )}
                    {effort.kom_rank && effort.kom_rank <= 3 && (
                      <span className="inline-flex items-center rounded-md border border-red-300 bg-red-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400">
                        #{effort.kom_rank}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3">
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
                <div className="ml-3 shrink-0 text-right">
                  <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    {formatDurationDetail(effort.elapsed_time)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto grid max-w-6xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2">
          <button
            onClick={handleBack}
            className="inline-flex h-9 items-center gap-1 rounded-md px-2 font-mono text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </button>

          <div className="min-w-0 text-center">
            {activity && (
              <p className="truncate font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                {activity.name}
              </p>
            )}
          </div>
          
          {/* Refresh button - only show if we have data */}
          {activity && (
            <button
              onClick={() => loadData(true)}
              disabled={isGuest || refreshing || needsReauth || rateLimited}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 font-mono text-xs text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">
                {isGuest
                  ? t('guest.demo', '示例')
                  : rateLimited
                  ? t('errors.rateLimited', '限流中')
                  : refreshing
                    ? t('common.refreshing', '刷新中')
                    : t('common.refresh', '刷新')}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Warning banner */}
      {(needsReauth || rateLimited) && activity && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div className="container mx-auto px-4 py-2 max-w-6xl">
            <span className="font-mono text-xs text-amber-700 dark:text-amber-400">
              {rateLimited ? t('errors.rateLimitedShowCache', '请求过于频繁，显示缓存数据') : t('auth.sessionExpiredShowCache', '登录已过期，显示缓存数据')}
            </span>
          </div>
        </div>
      )}

      {/* Page content or full-page loading - only show once */}
      {!isPageReady ? (
        <ActivityDetailSkeleton />
      ) : activity && (
        <div className="container mx-auto max-w-6xl px-4 py-5 sm:py-6 relative">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.92fr)] lg:items-stretch">
            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    <CalendarDays size={13} />
                    {formatDateTime(activity.start_date_local)}
                  </div>
                  <h1 className="break-words text-2xl font-black leading-tight text-zinc-950 dark:text-zinc-50 sm:text-3xl">
                    {activity.name}
                  </h1>
                  {activityDescription.length > 0 && (
                    <div className="mt-2 max-w-2xl">
                      <p className="break-words font-mono text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {displayedDescription}
                      </p>
                      {shouldCollapseDescription && (
                        <button
                          type="button"
                          onClick={() => setDescriptionExpanded((expanded) => !expanded)}
                          className="mt-1 font-mono text-[10px] font-bold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {descriptionExpanded ? t('common.showLess', '收起') : t('common.showMore', '展开')}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {isGuest ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 font-mono text-xs font-bold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
                      <Route size={14} />
                      {t('guest.demoRoute', '示例路线')}
                    </span>
                  ) : (
                    <SaveRouteButton activity={activity} />
                  )}
                  {routePolyline && (
                    <button
                      onClick={() => setIsShareOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      title={t('sharePoster.title', '分享海报')}
                    >
                      <Share2 size={14} />
                      <span>{t('sharePoster.title', '分享海报')}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard
                  icon={<Route size={16} />}
                  label={t('activity.distance')}
                  value={formatDistance(activity.distance, 'km')}
                  sub={activity.total_elevation_gain > 0 ? `+${Math.round(activity.total_elevation_gain)}m` : undefined}
                  tone="blue"
                />
                <StatCard
                  icon={<Timer size={16} />}
                  label={t('activity.time')}
                  value={formatDurationDetail(activity.moving_time)}
                  sub={activity.elapsed_time && activity.elapsed_time !== activity.moving_time
                    ? `${t('activity.elapsedTime', '用时')} ${formatDurationDetail(activity.elapsed_time)}`
                    : undefined}
                  tone="emerald"
                />
                <StatCard
                  icon={<Gauge size={16} />}
                  label={t('activity.pace')}
                  value={formatPace(activity.distance, activity.moving_time, 'min/km')}
                  sub={activity.max_speed
                    ? `${t('activity.maxPace', '最快配速')} ${formatPace(1000, 1000 / activity.max_speed, 'min/km')}`
                    : undefined}
                  tone="orange"
                />
                <StatCard
                  icon={activity.average_heartrate ? <HeartPulse size={16} /> : <Mountain size={16} />}
                  label={activity.average_heartrate
                    ? t('activity.averageHeartRate', '平均心率')
                    : t('activity.elevationGain', '爬升')}
                  value={activity.average_heartrate
                    ? `${Math.round(activity.average_heartrate)} bpm`
                    : `${Math.round(activity.total_elevation_gain || 0)} m`}
                  sub={activity.max_heartrate
                    ? `${t('activity.maxHeartRate', '最大心率')} ${Math.round(activity.max_heartrate)} bpm`
                    : activity.elev_high
                      ? `${t('activity.maxElevation', '最高海拔')} ${Math.round(activity.elev_high)}m`
                      : undefined}
                  tone="zinc"
                />
              </div>

              {routeAchievement && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span className="font-mono text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                          {t('activity.route', '路线')}
                        </span>
                      </div>
                      <h3 className="break-words font-mono text-sm font-bold text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-100">
                        {routeAchievement.routeName}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {routeAchievement.isPB && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <Trophy className="h-3 w-3" />
                            {t('activity.routePB', '路线 PB')}
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-zinc-500">
                          {t('activity.routeRank', { rank: routeAchievement.rank, total: routeAchievement.totalRuns })}
                        </span>
                        {routeAchievement.diffSec !== 0 && (
                          <span className={`font-mono text-[10px] font-bold ${routeAchievement.diffSec < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {routeAchievement.diffSec < 0 ? '快' : '慢'} {Math.abs(Math.round(routeAchievement.diffSec))}s/km
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/routes/${encodeURIComponent(routeAchievement.routeKey)}`}
                      className="inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-blue-300 bg-white px-2.5 py-1.5 font-mono text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:bg-zinc-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
                    >
                      {t('activity.viewRoute', '路线详情')}
                      <ChevronLeft className="h-3 w-3 rotate-180" />
                    </Link>
                  </div>
                </div>
              )}
            </section>

            <section className="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {routePolyline ? (
                <>
                  <ActivityMap
                    polyline={routePolyline}
                    startLatlng={activity.start_latlng}
                    endLatlng={activity.end_latlng}
                    streams={streams}
                    height="clamp(320px, 42vh, 460px)"
                    isDark={isDark}
                    onReady={() => setMapReady(true)}
                  />
                  {workoutCategory && (
                    <div className="absolute right-3 top-3 z-[6]">
                      <span className={`inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-[10px] font-bold shadow-sm backdrop-blur ${WORKOUT_TYPE_BADGE_STYLES[workoutCategory]}`}>
                        {t(ACTIVITY_WORKOUT_TRANSLATION_KEYS[workoutCategory])}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex min-h-[260px] items-center justify-center">
                  <p className="font-mono text-sm text-zinc-500">{t('activity.noRouteData', '暂无路线数据')}</p>
                </div>
              )}
            </section>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
            <main className="min-w-0 space-y-5">
              <div className="space-y-5 xl:hidden">
                {renderPrimarySideSections(activity)}
              </div>

              <div className="min-w-0">
                {isGuest ? (
                  <GuestAIAnalysisPreview activity={activity} />
                ) : (
                  <AIAnalysisCard
                    activity={activity}
                    streams={streams}
                    enabled={isAuthenticated && Boolean(user?.accessToken) && !needsReauth}
                  />
                )}
              </div>

              {streams && (
                <SectionCard
                  title={t('activity.charts', '运动曲线')}
                  icon={<BarChart3 size={15} />}
                  aside={formatDistance(activity.distance, 'km')}
                >
                  <div className="space-y-4">
                    {streams.heartrate && (
                      <ChartSection
                        title={t('activity.heartRate')}
                        avgValue={(() => {
                          const data = streams.heartrate.data as number[];
                          const valid = data.filter(v => v > 50);
                          if (valid.length === 0) return '';
                          return `${Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)}`;
                        })()}
                        avgUnit="bpm"
                        rangeValue={(() => {
                          const data = streams.heartrate.data as number[];
                          const valid = data.filter(v => v > 50);
                          if (valid.length === 0) return '';
                          return `${Math.round(Math.min(...valid))}–${Math.round(Math.max(...valid))}`;
                        })()}
                        color="#ef4444"
                        timeData={streams.time?.data as number[]}
                        distanceData={streams.distance?.data as number[]}
                      >
                        <SimpleLineChart
                          data={streams.heartrate.data as number[]}
                          color="#ef4444"
                          height={130}
                          showYAxis
                          xLabels={['0:00', formatDurationShort(activity.moving_time)]}
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
                        avgValue={(() => {
                          const paces = processPaceData(streams.velocity_smooth.data as number[]);
                          const valid = paces.filter(p => p > 0);
                          if (valid.length === 0) return '';
                          const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
                          return formatPaceValue(avg);
                        })()}
                        avgUnit=""
                        rangeValue={(() => {
                          const paces = processPaceData(streams.velocity_smooth.data as number[]);
                          if (paces.length === 0) return '';
                          const valid = paces.filter(p => p > 0);
                          return `${formatPaceValue(Math.min(...valid))}–${formatPaceValue(Math.max(...valid))}`;
                        })()}
                        color="#3b82f6"
                        timeData={streams.time?.data as number[]}
                        distanceData={streams.distance?.data as number[]}
                      >
                        <SimpleLineChart
                          data={processPaceData(streams.velocity_smooth.data as number[])}
                          color="#3b82f6"
                          height={130}
                          showYAxis
                          xLabels={['0:00', formatDurationShort(activity.moving_time)]}
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
                        avgValue={`+${Math.round(activity.total_elevation_gain)}`}
                        avgUnit="m"
                        rangeValue={`${Math.round(activity.elev_low || 0)}–${Math.round(activity.elev_high || 0)}m`}
                        color="#22c55e"
                        timeData={streams.time?.data as number[]}
                        distanceData={streams.distance?.data as number[]}
                      >
                        <SimpleLineChart
                          data={streams.altitude.data as number[]}
                          color="#22c55e"
                          height={130}
                          showYAxis
                          xLabels={['0:00', formatDurationShort(activity.moving_time)]}
                          domain={(() => {
                            const data = streams.altitude.data as number[];
                            if (data.length === 0) return undefined;
                            return [Math.min(...data), Math.max(...data)];
                          })()}
                        />
                      </ChartSection>
                    )}
                  </div>
                </SectionCard>
              )}

              {(shouldShowSplits || shouldShowLaps) && (
                <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                  {shouldShowSplits && (
                    <SectionCard title={`${t('activity.splits')} (${activity.splits_metric!.length})`}>
                      <div className="overflow-x-auto">
                        <SplitsTable splits={splitsExpanded ? [...visibleSplits, ...hiddenSplits] : visibleSplits} showHeader={true} />
                      </div>

                      {hasHiddenSplits && (
                        <button
                          onClick={() => setSplitsExpanded(!splitsExpanded)}
                          className="mt-0 w-full border-t border-zinc-200 py-3 text-center font-mono text-xs text-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
                        >
                          {splitsExpanded ? t('common.showLess', '收起') : t('common.showMore', '查看更多')}
                        </button>
                      )}
                    </SectionCard>
                  )}

                  {shouldShowLaps && (
                    <SectionCard title={`${t('activity.laps')} (${activity.laps!.length})`}>
                      <div className="overflow-x-auto">
                        <LapsTable laps={lapsExpanded ? [...visibleLaps, ...hiddenLaps] : visibleLaps} showHeader={true} />
                      </div>

                      {hasHiddenLaps && (
                        <button
                          onClick={() => setLapsExpanded(!lapsExpanded)}
                          className="mt-0 w-full border-t border-zinc-200 py-3 text-center font-mono text-xs text-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
                        >
                          {lapsExpanded ? t('common.showLess', '收起') : t('common.showMore', '查看更多')}
                        </button>
                      )}
                    </SectionCard>
                  )}
                </div>
              )}

              <div className="space-y-5 xl:hidden">
                {renderSecondarySideSections(activity)}
              </div>
            </main>

            <aside className="hidden min-w-0 space-y-5 xl:sticky xl:top-[88px] xl:block">
              {renderPrimarySideSections(activity)}
              {renderSecondarySideSections(activity)}
            </aside>
          </div>
        </div>
      )}

      <SharePosterModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        activityName={activity?.name || ''}
        activityDate={activity ? getActivityDateKey(activity).replace(/-/g, '') : ''}
        polyline={routePolyline}
        stats={activity ? {
          distance: formatDistance(activity.distance, 'km'),
          duration: formatDurationDetail(activity.moving_time),
          pace: formatPace(activity.distance, activity.moving_time, 'min/km'),
        } : null}
      />
    </div>
  );
}

function GuestAIAnalysisPreview({ activity }: { activity: StravaActivity }) {
  const { t } = useTranslation();
  const lapCount = activity.laps?.length ?? 0;
  const isInterval = lapCount > 3;
  const pace = formatPace(activity.distance, activity.moving_time, 'min/km');
  const recovery = activity.distance >= 15000 || isInterval ? '36h' : '24h';

  return (
    <SectionCard
      title={t('guest.aiPreviewTitle', 'AI 训练分析 · 示例')}
      icon={<BarChart3 size={15} />}
      aside={t('guest.demo', '示例')}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <BriefGuestMetric label={t('aiAnalysis.paceZone', '配速区间')} value={isInterval ? 'I-间歇' : 'E-有氧'} />
          <BriefGuestMetric label={t('aiAnalysis.intensity', '强度')} value={isInterval ? '偏高' : '适中'} />
          <BriefGuestMetric label={t('aiAnalysis.recovery', '恢复')} value={recovery} />
        </div>
        <p className="font-mono text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {isInterval
            ? t('guest.aiIntervalSummary', '这是一条示例间歇课：圈数较多，适合观察快段与恢复段是否均匀。登录后会结合你的 PB、心率区间和历史训练生成真实分析。')
            : t('guest.aiSummary', '这是一条示例训练：当前配速 {{pace}}，可用于体验摘要、依据和建议的呈现方式。登录后会基于你的真实历史生成分析。', { pace })}
        </p>
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">
            {t('aiAnalysis.analysisDetails', '分析依据与建议')}
          </p>
          <p className="mt-1 font-mono text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {isInterval
              ? t('guest.aiIntervalHint', '优先看每组快段配速是否下滑、恢复段心率是否能降下来；下一次训练建议安排轻松跑。')
              : t('guest.aiHint', '优先看配速稳定性、心率漂移和本周跑量占比；下一次训练建议保持低强度补量。')}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function BriefGuestMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <p className="truncate font-mono text-[10px] text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function SectionCard({
  title,
  aside,
  icon,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon && <span className="shrink-0 text-zinc-400">{icon}</span>}
          <h2 className="truncate font-mono text-xs font-bold uppercase text-zinc-500">
            {title}
          </h2>
        </div>
        {aside && (
          <div className="shrink-0 font-mono text-[10px] text-zinc-400">
            {aside}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function ActivityDetailSkeleton() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-5 sm:py-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.92fr)]">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
          <div className="mb-4 h-6 w-48 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="mb-3 h-9 w-3/4 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="mb-6 h-4 w-2/3 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                <div className="mb-3 h-8 w-8 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
                <div className="mb-2 h-3 w-14 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-6 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        </section>
        <section className="min-h-[320px] animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 h-6 w-36 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
              </div>
            </div>
          </section>
        </main>
        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3 h-4 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

type StatTone = 'blue' | 'emerald' | 'orange' | 'zinc';

const statToneClasses: Record<StatTone, string> = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300',
  zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'zinc',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-md ${statToneClasses[tone]}`}>
        {icon}
      </div>
      <p className="font-mono text-[10px] uppercase text-zinc-500">{label}</p>
      <p className="mt-1 break-words font-mono text-lg font-black leading-tight text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      {sub && (
        <p className="mt-1 truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-400" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}

function ChartSection({
  title,
  avgValue,
  avgUnit,
  rangeValue,
  color,
  children,
  timeData,
  distanceData,
  onPointSelect,
}: {
  title: string;
  avgValue: string;
  avgUnit: string;
  rangeValue: string;
  color: string;
  children: React.ReactNode;
  timeData?: number[];
  distanceData?: number[];
  onPointSelect?: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const handlePointClick = (idx: number) => {
    setSelectedIdx(idx);
    if (onPointSelect) onPointSelect(idx);
  };

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800 pb-3 last:border-b-0">
      <div className="mb-1 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] font-bold uppercase text-zinc-500">{title}</span>
          {avgValue && (
            <span className="font-mono text-sm font-bold" style={{ color }}>
              {avgValue}{avgUnit && <span className="text-[10px] font-normal ml-0.5">{avgUnit}</span>}
            </span>
          )}
        </div>
        {rangeValue && (
          <span className="font-mono text-[10px] text-zinc-400">{rangeValue}</span>
        )}
      </div>
      {React.cloneElement(children as React.ReactElement<{
        onPointClick?: (index: number) => void;
        interactive?: boolean;
      }>, {
        onPointClick: handlePointClick,
        interactive: true,
      })}
      {(timeData || distanceData) && (
        selectedIdx !== null ? (
          <div className="mt-1 inline-flex flex-wrap items-center gap-2 rounded-md bg-zinc-50 px-2 py-1 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800/70">
            {timeData && (
              <span>{formatDurationShort(timeData[Math.min(selectedIdx, timeData.length - 1)])}</span>
            )}
            {distanceData && (
              <span>{(distanceData[Math.min(selectedIdx, distanceData.length - 1)] / 1000).toFixed(2)} km</span>
            )}
          </div>
        ) : (
          <p className="mt-1 font-mono text-[10px] text-zinc-400">
            {t('activity.tapChartHint', '点按曲线查看时间和距离')}
          </p>
        )
      )}
    </div>
  );
}

function formatDurationDetail(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}:${min.toString().padStart(2, '0')}`;
  return `${min}:00`;
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
  return formatPaceSeconds(pace * 60);
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
