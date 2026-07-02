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
import { formatDistance, formatDuration } from '@/lib/strava';
import { getGuestActivities, isGuestUser } from '@/lib/guestMode';
import { getGearCacheDetails } from '@/lib/gearCache';
import {
  getActivityWorkoutSearchTerms,
  matchesActivityWorkoutCategory,
  type ActivityWorkoutCategory,
} from '@/lib/activityWorkoutType';
import { readSessionState, writeSessionState } from '@/lib/navigationState';
import { Loader2, RefreshCw, ChevronDown, ChevronUp, SlidersHorizontal, X, Search, CalendarDays, LogIn } from 'lucide-react';
import { PixelButton } from '@/components/ui';
import { RunningStats } from '@/components/RunningStats';
import { GroupedActivities } from '@/components/GroupedActivities';
import { PeriodShareModal } from '@/components/PeriodShareModal';

const CHECK_NEW_INTERVAL = 5 * 60 * 1000; // 5 minutes
const ACTIVITY_OVERVIEW_EXPANDED_KEY = 'runblue_activity_overview_expanded';
const ACTIVITY_PAGE_STATE_KEY = 'run_blue_page_state:activities';

interface ActivitiesPageState {
  showFilters?: boolean;
  overviewExpanded?: boolean;
  savedAt?: number;
}

function isActivitiesPageState(value: unknown): value is ActivitiesPageState {
  if (!value || typeof value !== 'object') return false;
  const state = value as ActivitiesPageState;
  return (state.showFilters === undefined || typeof state.showFilters === 'boolean')
    && (state.overviewExpanded === undefined || typeof state.overviewExpanded === 'boolean')
    && (state.savedAt === undefined || typeof state.savedAt === 'number');
}

function getActivityLoadErrorKind(error: unknown): 'auth' | 'rateLimit' | 'generic' {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('401') || message.includes('Unauthorized')) return 'auth';
  if (message.includes('429')) return 'rateLimit';
  return 'generic';
}

function formatCompactListDistance(meters: number): string {
  const km = meters / 1000;
  if (km >= 1000) return `${Math.round(km).toLocaleString('en-US')} km`;
  return formatDistance(meters, 'km');
}

function formatCompactListDuration(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 100) return `${Math.round(hours).toLocaleString('en-US')} h`;
  return formatDuration(seconds);
}

export default function ActivitiesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading, user, login } = useAuth();
  const isGuest = isGuestUser(user);
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
  } = useActivityHistorySync(isGuest ? null : user?.accessToken);

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isPeriodShareOpen, setIsPeriodShareOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);

  // Read filter params from URL
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [selectedYear, setSelectedYear] = useState(searchParams.get('year') || '');
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || '');
  const [minDistance, setMinDistance] = useState(searchParams.get('minDistance') || '');
  const [maxDistance, setMaxDistance] = useState(searchParams.get('maxDistance') || '');
  const [gearFilter, setGearFilter] = useState(searchParams.get('gear') || '');
  const [normalRunFilter, setNormalRunFilter] = useState(
    searchParams.get('normal') === '1' ||
    searchParams.get('withKid') === '1' ||
    searchParams.get('recovery') === '1'
  );
  const [raceFilter, setRaceFilter] = useState(searchParams.get('race') === '1');
  const [longRunFilter, setLongRunFilter] = useState(searchParams.get('longRun') === '1');
  const [workoutFilter, setWorkoutFilter] = useState(searchParams.get('workout') === '1');
  const [cachedGearNames, setCachedGearNames] = useState<Map<string, string>>(new Map());

  // Sync URL when filters change
  const updateFilterParams = useCallback((patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    const query = params.toString();
    router.replace(query ? `/activities?${query}` : '/activities', { scroll: false });
  }, [searchParams, router]);

  // 直接记录下一页要加载的页码
  const nextPageRef = useRef(1);
  const backgroundHistorySyncStartedRef = useRef(false);
  const sourceActivities = React.useMemo(
    () => (isGuest ? getGuestActivities() : activities),
    [isGuest, activities]
  );
  const sourceHasMore = isGuest ? false : hasMore;
  const deferredSearchQuery = React.useDeferredValue(searchQuery.trim().toLocaleLowerCase());

  useEffect(() => {
    const savedPageState = readSessionState<ActivitiesPageState>(
      ACTIVITY_PAGE_STATE_KEY,
      isActivitiesPageState
    );
    setShowFilters(savedPageState?.showFilters ?? false);
    try {
      setIsOverviewExpanded(
        savedPageState?.overviewExpanded
          ?? (localStorage.getItem(ACTIVITY_OVERVIEW_EXPANDED_KEY) === '1')
      );
    } catch {
      setIsOverviewExpanded(savedPageState?.overviewExpanded ?? false);
    }
  }, []);

  useEffect(() => {
    writeSessionState<ActivitiesPageState>(ACTIVITY_PAGE_STATE_KEY, {
      showFilters,
      overviewExpanded: isOverviewExpanded,
      savedAt: Date.now(),
    });
  }, [showFilters, isOverviewExpanded]);

  useEffect(() => {
    const nextSearchQuery = searchParams.get('q') || '';
    const nextSelectedYear = searchParams.get('year') || '';
    const nextStartDate = searchParams.get('startDate') || '';
    const nextEndDate = searchParams.get('endDate') || '';
    const nextMinDistance = searchParams.get('minDistance') || '';
    const nextMaxDistance = searchParams.get('maxDistance') || '';
    const nextGearFilter = searchParams.get('gear') || '';
    const nextNormalRunFilter = searchParams.get('normal') === '1'
      || searchParams.get('withKid') === '1'
      || searchParams.get('recovery') === '1';
    const nextRaceFilter = searchParams.get('race') === '1';
    const nextLongRunFilter = searchParams.get('longRun') === '1';
    const nextWorkoutFilter = searchParams.get('workout') === '1';

    setSearchQuery((current) => (current === nextSearchQuery ? current : nextSearchQuery));
    setSelectedYear((current) => (current === nextSelectedYear ? current : nextSelectedYear));
    setStartDate((current) => (current === nextStartDate ? current : nextStartDate));
    setEndDate((current) => (current === nextEndDate ? current : nextEndDate));
    setMinDistance((current) => (current === nextMinDistance ? current : nextMinDistance));
    setMaxDistance((current) => (current === nextMaxDistance ? current : nextMaxDistance));
    setGearFilter((current) => (current === nextGearFilter ? current : nextGearFilter));
    setNormalRunFilter((current) => (current === nextNormalRunFilter ? current : nextNormalRunFilter));
    setRaceFilter((current) => (current === nextRaceFilter ? current : nextRaceFilter));
    setLongRunFilter((current) => (current === nextLongRunFilter ? current : nextLongRunFilter));
    setWorkoutFilter((current) => (current === nextWorkoutFilter ? current : nextWorkoutFilter));
  }, [searchParams]);

  const toggleOverview = useCallback(() => {
    setIsOverviewExpanded((expanded) => {
      const next = !expanded;
      try {
        localStorage.setItem(ACTIVITY_OVERVIEW_EXPANDED_KEY, next ? '1' : '0');
      } catch {
        // The preference is optional when storage is unavailable.
      }
      return next;
    });
  }, []);

  const routeActivities = React.useMemo(() => {
    return sourceActivities.filter((a: StravaActivity) => {
      if (a.type !== 'Run') return false;
      const hasRoute = a.map?.summary_polyline && a.map.summary_polyline.length > 10;
      return Boolean(hasRoute);
    });
  }, [sourceActivities]);

  const activityYears = React.useMemo(() => {
    const years = new Set<number>();
    routeActivities.forEach((activity) => years.add(getActivityDate(activity).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [routeActivities]);

  useEffect(() => {
    let cancelled = false;
    getGearCacheDetails()
      .then(({ gearDetails }) => {
        if (!cancelled) {
          setCachedGearNames(new Map(gearDetails.map((gear) => [gear.id, gear.name])));
        }
      })
      .catch(() => {
        if (!cancelled) setCachedGearNames(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activityGears = React.useMemo(() => {
    const gears = new Map<string, string>();
    routeActivities.forEach((activity) => {
      const gearId = activity.gear_id || activity.gear?.id;
      if (!gearId) return;
      gears.set(gearId, activity.gear?.name || cachedGearNames.get(gearId) || gearId);
    });
    return Array.from(gears, ([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [routeActivities, cachedGearNames]);
  const selectedGearName = activityGears.find((gear) => gear.id === gearFilter)?.name || gearFilter;

  useEffect(() => {
    const currentQuery = searchParams.get('q') || '';
    if (currentQuery === searchQuery.trim()) return;
    const timer = window.setTimeout(() => {
      updateFilterParams({ q: searchQuery.trim() });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery, searchParams, updateFilterParams]);

  useEffect(() => {
    if (!searchParams.has('withKid') && !searchParams.has('recovery')) return;
    updateFilterParams({
      normal: '1',
      withKid: '',
      recovery: '',
    });
  }, [searchParams, updateFilterParams]);

  // Filter running activities with valid route data + user filters
  const runningActivities = React.useMemo(() => {
    const workoutCategoryFilters: ActivityWorkoutCategory[] = [];
    if (normalRunFilter) workoutCategoryFilters.push('normal');
    if (raceFilter) workoutCategoryFilters.push('race');
    if (longRunFilter) workoutCategoryFilters.push('longRun');
    if (workoutFilter) workoutCategoryFilters.push('workout');

    return routeActivities.filter((a: StravaActivity) => {
      // Date filter
      const activityDate = getActivityDate(a);
      if (selectedYear && activityDate.getFullYear() !== Number(selectedYear)) return false;
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
      if (gearFilter && (a.gear_id || a.gear?.id) !== gearFilter) return false;

      if (!matchesActivityWorkoutCategory(a, workoutCategoryFilters)) return false;

      if (deferredSearchQuery) {
        const searchableText = [
          a.name,
          a.description,
          a.location_city,
          a.location_state,
          a.location_country,
          a.gear?.name,
          ...getActivityWorkoutSearchTerms(a),
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase();
        if (!searchableText.includes(deferredSearchQuery)) return false;
      }

      return true;
    });
  }, [
    routeActivities,
    deferredSearchQuery,
    selectedYear,
    startDate,
    endDate,
    minDistance,
    maxDistance,
    gearFilter,
    normalRunFilter,
    raceFilter,
    longRunFilter,
    workoutFilter,
  ]);

  const listTotals = React.useMemo(() => {
    return runningActivities.reduce(
      (total, activity) => ({
        distance: total.distance + activity.distance,
        time: total.time + activity.moving_time,
      }),
      { distance: 0, time: 0 }
    );
  }, [runningActivities]);

  const activeFilterCount = [
    searchQuery.trim(),
    selectedYear,
    startDate,
    endDate,
    minDistance,
    maxDistance,
    gearFilter,
    normalRunFilter,
    raceFilter,
    longRunFilter,
    workoutFilter,
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedYear('');
    setStartDate('');
    setEndDate('');
    setMinDistance('');
    setMaxDistance('');
    setGearFilter('');
    setNormalRunFilter(false);
    setRaceFilter(false);
    setLongRunFilter(false);
    setWorkoutFilter(false);
    updateFilterParams({
      q: '',
      year: '',
      startDate: '',
      endDate: '',
      minDistance: '',
      maxDistance: '',
      gear: '',
      normal: '',
      race: '',
      withKid: '',
      longRun: '',
      workout: '',
      recovery: '',
    });
  }, [updateFilterParams]);

  const activeFilterChips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (searchQuery.trim()) {
    activeFilterChips.push({
      key: 'q',
      label: t('activity.searchChip', { query: searchQuery.trim() }),
      onRemove: () => setSearchQuery(''),
    });
  }
  if (selectedYear) {
    activeFilterChips.push({
      key: 'year',
      label: selectedYear,
      onRemove: () => {
        setSelectedYear('');
        updateFilterParams({ year: '' });
      },
    });
  }
  if (startDate) {
    activeFilterChips.push({
      key: 'startDate',
      label: t('filter.fromDate', { date: startDate }),
      onRemove: () => {
        setStartDate('');
        updateFilterParams({ startDate: '' });
      },
    });
  }
  if (endDate) {
    activeFilterChips.push({
      key: 'endDate',
      label: t('filter.toDate', { date: endDate }),
      onRemove: () => {
        setEndDate('');
        updateFilterParams({ endDate: '' });
      },
    });
  }
  if (minDistance) {
    activeFilterChips.push({
      key: 'minDistance',
      label: `>= ${minDistance}km`,
      onRemove: () => {
        setMinDistance('');
        updateFilterParams({ minDistance: '' });
      },
    });
  }
  if (maxDistance) {
    activeFilterChips.push({
      key: 'maxDistance',
      label: `<= ${maxDistance}km`,
      onRemove: () => {
        setMaxDistance('');
        updateFilterParams({ maxDistance: '' });
      },
    });
  }
  if (gearFilter) {
    activeFilterChips.push({
      key: 'gear',
      label: t('activity.gearChip', { gear: selectedGearName }),
      onRemove: () => {
        setGearFilter('');
        updateFilterParams({ gear: '' });
      },
    });
  }
  if (normalRunFilter) {
    activeFilterChips.push({
      key: 'normal',
      label: t('activity.normalRun'),
      onRemove: () => {
        setNormalRunFilter(false);
        updateFilterParams({ normal: '' });
      },
    });
  }
  if (raceFilter) {
    activeFilterChips.push({
      key: 'race',
      label: t('activity.race'),
      onRemove: () => {
        setRaceFilter(false);
        updateFilterParams({ race: '' });
      },
    });
  }
  if (longRunFilter) {
    activeFilterChips.push({
      key: 'longRun',
      label: t('activity.longRun'),
      onRemove: () => {
        setLongRunFilter(false);
        updateFilterParams({ longRun: '' });
      },
    });
  }
  if (workoutFilter) {
    activeFilterChips.push({
      key: 'workout',
      label: t('activity.workout'),
      onRemove: () => {
        setWorkoutFilter(false);
        updateFilterParams({ workout: '' });
      },
    });
  }

  useEffect(() => {
    if (sourceActivities.length > 0 && initialLoading) {
      setInitialLoading(false);
    }
  }, [sourceActivities.length, initialLoading]);

  // Load activities
  const loadActivities = useCallback(async (type: 'initial' | 'refresh') => {
    if (isGuest) {
      setInitialLoading(false);
      setRefreshing(false);
      setLoading(false);
      return;
    }
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
    isGuest,
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
    if (isGuest) return;
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
    isGuest,
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
    if (isGuest) return;
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
    isGuest,
    user?.accessToken,
    latestActivityId,
  ]);

  // Initial load
  useEffect(() => {
    if (authLoading) return;
    if (isGuest) {
      setInitialLoading(false);
      setLoading(false);
      setError(null);
      nextPageRef.current = 1;
      return;
    }
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
  }, [authLoading, isAuthenticated, isGuest, user?.accessToken, activities.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isGuest) return;
    if (authLoading || !isAuthenticated || !user?.accessToken || activities.length === 0) return;
    startBackgroundHistorySync();
  }, [
    authLoading,
    isAuthenticated,
    isGuest,
    user?.accessToken,
    activities.length,
    startBackgroundHistorySync,
  ]);

  const handleReauth = () => {
    login();
  };
  const refreshRequiresReauth = !isGuest && !user?.accessToken;
  const handleRefresh = () => {
    if (refreshRequiresReauth) {
      handleReauth();
      return;
    }
    loadActivities('refresh');
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const canRenderCachedActivities = sourceActivities.length > 0;

  if (authLoading && sourceActivities.length === 0) {
    return <ActivitiesPageSkeleton />;
  }

  if (!isAuthenticated && !canRenderCachedActivities) {
    return <ActivitiesPageSkeleton />;
  }

  if (initialLoading && sourceActivities.length === 0) {
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

  if ((error || needsReauth) && sourceActivities.length === 0) {
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
      <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
              {t('activity.routeListKicker')}
            </p>
            <h1 className="mt-1 font-pixel text-xl font-bold text-zinc-950 dark:text-zinc-50">
              {t('activity.routeListTitle')}
            </h1>
            <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {hasActiveFilters
                ? t('activity.routeMatches', { matched: runningActivities.length, total: routeActivities.length })
                : t('activity.routeRunsWithTrack', { count: routeActivities.length })}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleOverview}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 font-mono text-xs font-bold text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              title={isOverviewExpanded ? t('activity.collapseOverview') : t('activity.expandOverview')}
              aria-label={isOverviewExpanded ? t('activity.collapseOverview') : t('activity.expandOverview')}
              aria-expanded={isOverviewExpanded}
            >
              {isOverviewExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              <span className="hidden md:inline">
                {isOverviewExpanded ? t('activity.collapseOverview') : t('activity.expandOverview')}
              </span>
            </button>
            <button
              onClick={() => setShowFilters((s) => !s)}
              className={`relative inline-flex h-10 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-xs font-bold transition-colors ${
                showFilters || hasActiveFilters
                  ? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'
              }`}
              title={t('filter.title', '筛选')}
            >
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">{t('filter.title', '筛选')}</span>
              {hasActiveFilters && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 font-mono text-[9px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              onClick={handleRefresh}
              disabled={isGuest || refreshing || isLoading}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 font-mono text-xs font-bold text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              title={isGuest
                ? t('guest.cannotSync')
                : refreshRequiresReauth
                  ? t('auth.relogin', '重新登录')
                  : t('activity.updateLatest')}
            >
              {refreshRequiresReauth
                ? <LogIn size={16} />
                : <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />}
              <span className="hidden sm:inline">
                {isGuest
                  ? t('guest.demo')
                  : refreshRequiresReauth
                    ? t('auth.relogin', '重新登录')
                    : refreshing
                      ? t('activity.updating')
                      : t('activity.update')}
              </span>
            </button>
          </div>
        </div>

        {isOverviewExpanded && (
          <>
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="relative block min-w-0">
                <span className="sr-only">{t('activity.searchLabel')}</span>
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('activity.searchPlaceholder')}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-9 font-mono text-xs text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-blue-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    aria-label={t('activity.clearSearch')}
                  >
                    <X size={13} />
                  </button>
                )}
              </label>

              <label className="relative block min-w-0 sm:w-36">
                <span className="sr-only">{t('activity.yearFilter')}</span>
                <CalendarDays
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <select
                  value={selectedYear}
                  onChange={(event) => {
                    setSelectedYear(event.target.value);
                    updateFilterParams({ year: event.target.value });
                  }}
                  className="h-10 w-full appearance-none rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-8 font-mono text-xs font-bold text-zinc-700 outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
                >
                  <option value="">{t('activity.allYears')}</option>
                  {activityYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] text-zinc-400">▼</span>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
                <p className="font-mono text-[10px] text-zinc-400">{t('activity.distance')}</p>
                <p className="mt-1 truncate font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50">
                  {formatCompactListDistance(listTotals.distance)}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
                <p className="font-mono text-[10px] text-zinc-400">{t('activity.time')}</p>
                <p className="mt-1 truncate font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50">
                  {formatCompactListDuration(listTotals.time)}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900">
                <p className="font-mono text-[10px] text-zinc-400">{t('stats.totalActivities')}</p>
                <p className="mt-1 truncate font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50">
                  {runningActivities.length}
                </p>
              </div>
            </div>

            {(searchQuery.trim() || selectedYear) && (
              <p className="mt-2 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                {t('activity.searchResults', {
                  matched: runningActivities.length,
                  total: routeActivities.length,
                })}
              </p>
            )}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {runningActivities.length > 0 && (
            <div className="relative shrink-0">
              <RunningStats activities={runningActivities} />
            </div>
          )}
          {hasActiveFilters && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 font-mono text-[10px] font-bold text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70"
                >
                  <span>{chip.label}</span>
                  <X size={10} />
                </button>
              ))}
              <button
                onClick={resetFilters}
                className="rounded-full px-2 py-1 font-mono text-[10px] font-bold text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-zinc-900"
              >
                {t('filter.clear')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="mb-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t('activity.filterRunsTitle')}
              </h2>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">
                {t('activity.filterRunsHint')}
              </p>
            </div>
            <button
              onClick={() => setShowFilters(false)}
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
              aria-label={t('filter.close')}
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">{t('filter.startDate', '开始日期')}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); updateFilterParams({ startDate: e.target.value }); }}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 font-mono text-xs outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-zinc-400 mb-1">{t('filter.endDate', '结束日期')}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); updateFilterParams({ endDate: e.target.value }); }}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 font-mono text-xs outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
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
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 font-mono text-xs outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
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
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 font-mono text-xs outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-400">
                {t('activity.gearFilter')}
              </label>
              <select
                value={gearFilter}
                onChange={(event) => {
                  setGearFilter(event.target.value);
                  updateFilterParams({ gear: event.target.value });
                }}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 font-mono text-xs outline-none transition-colors focus:border-blue-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
              >
                <option value="">{t('activity.allGear')}</option>
                {activityGears.map((gear) => (
                  <option key={gear.id} value={gear.id}>{gear.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase text-zinc-400">{t('activity.workoutType')}</p>
            <div className="flex flex-wrap gap-2">
            {/* Workout type tags */}
            <button
              onClick={() => {
                const next = !normalRunFilter;
                setNormalRunFilter(next);
                updateFilterParams({ normal: next ? '1' : '' });
              }}
              className={`rounded-lg border px-3 py-2 font-mono text-xs font-bold transition-colors ${
                normalRunFilter
                  ? 'border-zinc-700 bg-zinc-800 text-white dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100'
              }`}
            >
              {t('activity.normalRun')}
            </button>
            <button
              onClick={() => {
                const next = !raceFilter;
                setRaceFilter(next);
                updateFilterParams({ race: next ? '1' : '' });
              }}
              className={`rounded-lg border px-3 py-2 font-mono text-xs font-bold transition-colors ${
                raceFilter
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100'
              }`}
            >
              {t('activity.race')}
            </button>
            <button
              onClick={() => {
                const next = !longRunFilter;
                setLongRunFilter(next);
                updateFilterParams({ longRun: next ? '1' : '' });
              }}
              className={`rounded-lg border px-3 py-2 font-mono text-xs font-bold transition-colors ${
                longRunFilter
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100'
              }`}
            >
              {t('activity.longRun')}
            </button>
            <button
              onClick={() => {
                const next = !workoutFilter;
                setWorkoutFilter(next);
                updateFilterParams({ workout: next ? '1' : '' });
              }}
              className={`rounded-lg border px-3 py-2 font-mono text-xs font-bold transition-colors ${
                workoutFilter
                  ? 'border-orange-500 bg-orange-500 text-white'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-orange-300 hover:text-orange-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-orange-800 dark:hover:text-orange-300'
              }`}
            >
              {t('activity.workout')}
            </button>
            </div>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 rounded-lg px-1 font-mono text-xs font-bold text-zinc-400 transition-colors hover:text-red-500"
            >
              <X size={12} />
              {t('filter.clear', '清除筛选')}
            </button>
          )}
        </div>
      )}

      {/* Warning banner */}
      {(needsReauth || rateLimited) && sourceActivities.length > 0 && (
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

      {error && !needsReauth && !rateLimited && sourceActivities.length > 0 && (
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
        <div className="rounded-lg border border-dashed border-zinc-200 bg-white py-14 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-mono text-sm font-bold text-zinc-700 dark:text-zinc-200">
            {hasActiveFilters ? t('activity.noMatchedRoutes') : t('activity.noActivities')}
          </p>
          <p className="mt-2 font-mono text-xs text-zinc-500">
            {hasActiveFilters ? t('activity.noMatchedRoutesHint') : t('activity.routeEmptyHint')}
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="mt-4 inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs font-bold text-zinc-700 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
            >
              <X size={13} />
              {t('filter.clear')}
            </button>
          )}
        </div>
      ) : (
        <>
          <GroupedActivities
            activities={runningActivities}
            hasMore={sourceHasMore}
            isLoading={isGuest ? false : isLoading}
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
        activities={sourceActivities}
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
