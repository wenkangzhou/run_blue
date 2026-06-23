'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ActivityHistorySyncProgress, useActivityHistorySync } from '@/hooks/useActivityHistorySync';
import { isActivitiesCacheStale, useActivitiesStore } from '@/store/activities';
import { getActivityTimestamp } from '@/lib/dates';
import { syncRecentActivities } from '@/lib/activitySync';
import { getGuestActivities, isGuestUser } from '@/lib/guestMode';
import type { StravaActivity } from '@/types';

interface UseProfileActivitiesResult {
  activities: StravaActivity[];
  canRefresh: boolean;
  error: string | null;
  isRefreshDisabled: boolean;
  isRefreshing: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  lastFetchedAt: number | null;
  refresh: () => Promise<void>;
  source: 'strava' | 'demo';
  syncProgress: ActivityHistorySyncProgress | null;
  syncError: string | null;
}

let cachedDemoActivities: StravaActivity[] | null = null;

function getSyncErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('401') || message.includes('Unauthorized') || message.includes('auth_required')) {
    return '登录已过期，正在使用本地缓存';
  }
  if (message.includes('429')) {
    return 'Strava 限流中，正在使用本地缓存';
  }
  return '同步失败，正在使用本地缓存';
}

function sortRuns(activities: StravaActivity[]) {
  return activities
    .filter((activity) => activity.type === 'Run' || activity.sport_type === 'Run')
    .sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));
}

async function loadDemoActivities() {
  if (cachedDemoActivities) return cachedDemoActivities;

  const res = await fetch('/data/activities.json');
  if (!res.ok) throw new Error('Failed to fetch demo activities');
  const activities = (await res.json()) as StravaActivity[];
  cachedDemoActivities = sortRuns(activities);
  return cachedDemoActivities;
}

function useActivitiesStoreHydrated() {
  const [hasHydrated, setHasHydrated] = useState(() => useActivitiesStore.persist.hasHydrated());

  useEffect(() => {
    if (useActivitiesStore.persist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }

    return useActivitiesStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
  }, []);

  return hasHydrated;
}

export function useProfileActivities(): UseProfileActivitiesResult {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const cachedActivities = useActivitiesStore((state) => state.activities);
  const hasMore = useActivitiesStore((state) => state.hasMore);
  const lastFetchedAt = useActivitiesStore((state) => state.lastFetchedAt);
  const hasHydrated = useActivitiesStoreHydrated();
  const {
    isSyncing: historySyncing,
    progress: syncProgress,
    syncHistory,
    reset: resetHistorySync,
  } = useActivityHistorySync(user?.accessToken);

  const [demoActivities, setDemoActivities] = useState<StravaActivity[]>(cachedDemoActivities || []);
  const [demoLoading, setDemoLoading] = useState(!cachedDemoActivities);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [manualSyncing, setManualSyncing] = useState(false);
  const autoSyncTokenRef = useRef<string | null>(null);

  const stravaRuns = useMemo(() => sortRuns(cachedActivities), [cachedActivities]);
  const isGuest = isGuestUser(user);
  const shouldUseStrava = isAuthenticated && Boolean(user?.accessToken) && !isGuest;

  useEffect(() => {
    if (authLoading || shouldUseStrava || isGuest) return;

    let cancelled = false;
    setDemoLoading(!cachedDemoActivities);
    setDemoError(null);

    loadDemoActivities()
      .then((activities) => {
        if (!cancelled) setDemoActivities(activities);
      })
      .catch((error) => {
        if (!cancelled) {
          setDemoError('Failed to load activities data');
          console.error(error);
        }
      })
      .finally(() => {
        if (!cancelled) setDemoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isGuest, shouldUseStrava]);

  useEffect(() => {
    if (!user?.accessToken || !shouldUseStrava || authLoading || !hasHydrated) return;
    if (autoSyncTokenRef.current === user.accessToken) return;

    const shouldSyncRecent = stravaRuns.length === 0 || isActivitiesCacheStale(lastFetchedAt);
    const shouldSyncHistory = hasMore;
    if (!shouldSyncRecent && !shouldSyncHistory) return;

    autoSyncTokenRef.current = user.accessToken;
    setSyncError(null);
    resetHistorySync();

    syncHistory({
      forceRecent: shouldSyncRecent,
      syncRecent: shouldSyncRecent,
    }).catch((error) => {
      setSyncError(getSyncErrorMessage(error));
    });
  }, [
    authLoading,
    hasHydrated,
    hasMore,
    lastFetchedAt,
    resetHistorySync,
    shouldUseStrava,
    stravaRuns.length,
    syncHistory,
    user?.accessToken,
  ]);

  const refresh = useCallback(async () => {
    if (!user?.accessToken || !shouldUseStrava) return;
    if (historySyncing || manualSyncing) return;

    setManualSyncing(true);
    setSyncError(null);

    try {
      await syncRecentActivities(user.accessToken, { force: true });
    } catch (error) {
      setSyncError(getSyncErrorMessage(error));
    } finally {
      setManualSyncing(false);
    }
  }, [historySyncing, manualSyncing, shouldUseStrava, user?.accessToken]);

  if (shouldUseStrava) {
    return {
      activities: stravaRuns,
      canRefresh: true,
      error: stravaRuns.length === 0 ? syncError : null,
      isRefreshDisabled: historySyncing || manualSyncing,
      isRefreshing: manualSyncing,
      isLoading: authLoading || !hasHydrated || (stravaRuns.length === 0 && historySyncing),
      isSyncing: historySyncing || manualSyncing,
      lastFetchedAt,
      refresh,
      source: 'strava',
      syncProgress,
      syncError,
    };
  }

  if (isGuest) {
    return {
      activities: getGuestActivities(),
      canRefresh: false,
      error: null,
      isRefreshDisabled: false,
      isRefreshing: false,
      isLoading: authLoading,
      isSyncing: false,
      lastFetchedAt: null,
      refresh,
      source: 'demo',
      syncProgress: null,
      syncError: null,
    };
  }

  return {
    activities: demoActivities,
    canRefresh: false,
    error: demoError,
    isRefreshDisabled: false,
    isRefreshing: false,
    isLoading: authLoading || demoLoading,
    isSyncing: false,
    lastFetchedAt: null,
    refresh,
    source: 'demo',
    syncProgress: null,
    syncError: null,
  };
}
