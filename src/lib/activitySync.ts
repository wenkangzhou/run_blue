import { getActivities } from '@/lib/strava';
import { getActivityTimestamp } from '@/lib/dates';
import { useActivitiesStore, isActivitiesCacheStale } from '@/store/activities';
import { useRoutesStore } from '@/store/routes';
import type { StravaActivity } from '@/types';

export const ACTIVITIES_PER_PAGE = 200;
export const HAS_MORE_THRESHOLD = 195;
export const RECENT_SYNC_WINDOW_DAYS = 8;
export const RECENT_SYNC_MAX_PAGES = 3;
export const HISTORY_SYNC_PAGE_DELAY_MS = 300;

interface SyncRecentOptions {
  force?: boolean;
  maxPages?: number;
  windowDays?: number;
}

interface LoadRemainingOptions {
  delayMs?: number;
  maxPages?: number;
  onProgress?: (progress: { pagesLoaded: number; page: number }) => void;
  onPageLoaded?: (result: {
    page: number;
    activities: StravaActivity[];
    hasMore: boolean;
  }) => void | Promise<void>;
}

interface EnsureActivityHistoryOptions extends LoadRemainingOptions {
  forceRecent?: boolean;
  syncRecent?: boolean;
}

export function getNextActivitiesPage(loadedPages: number, activityCount: number) {
  if (loadedPages > 0) return loadedPages + 1;
  if (activityCount === 0) return 1;
  return Math.ceil(activityCount / ACTIVITIES_PER_PAGE) + 1;
}

function pageReachesRecentWindow(activities: StravaActivity[], windowStart: number): boolean {
  if (activities.length === 0) return true;
  return activities.some((activity) => getActivityTimestamp(activity) < windowStart);
}

function syncSavedRoutes() {
  useRoutesStore.getState().syncRoutes(useActivitiesStore.getState().activities);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncRecentActivities(
  accessToken: string,
  {
    force = false,
    maxPages = RECENT_SYNC_MAX_PAGES,
    windowDays = RECENT_SYNC_WINDOW_DAYS,
  }: SyncRecentOptions = {}
) {
  const store = useActivitiesStore.getState();
  if (!force && !isActivitiesCacheStale(store.lastFetchedAt)) {
    return { skipped: true, pagesFetched: 0, activitiesFetched: 0 };
  }

  const fetched: StravaActivity[] = [];
  const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  let page = 1;
  let pagesFetched = 0;
  let hasMoreData = true;

  while (page <= maxPages) {
    const pageActivities = await getActivities(accessToken, page, ACTIVITIES_PER_PAGE);
    fetched.push(...pageActivities);
    pagesFetched += 1;

    hasMoreData = pageActivities.length >= HAS_MORE_THRESHOLD;
    if (!hasMoreData || pageReachesRecentWindow(pageActivities, windowStart)) {
      break;
    }

    page += 1;
  }

  const now = Date.now();
  if (store.activities.length === 0) {
    store.replaceActivitiesBatch(fetched, pagesFetched, hasMoreData, now, fetched[0]?.id ?? null);
  } else if (fetched.length > 0) {
    store.mergeActivitiesBatch(fetched, pagesFetched, hasMoreData, now, fetched[0]?.id ?? null);
  } else {
    store.batchUpdate({ lastFetchedAt: now, hasMore: false });
  }

  syncSavedRoutes();
  return { skipped: false, pagesFetched, activitiesFetched: fetched.length };
}

export async function loadNextActivitiesPage(accessToken: string) {
  const store = useActivitiesStore.getState();
  const page = getNextActivitiesPage(store.loadedPages, store.activities.length);
  const activities = await getActivities(accessToken, page, ACTIVITIES_PER_PAGE);
  const hasMoreData = activities.length >= HAS_MORE_THRESHOLD;
  const now = Date.now();

  if (activities.length === 0) {
    store.batchUpdate({
      hasMore: false,
      loadedPages: Math.max(0, page - 1),
      lastFetchedAt: now,
    });
  } else {
    store.mergeActivitiesBatch(activities, page, hasMoreData, now, store.latestActivityId);
  }

  syncSavedRoutes();
  return { page, activities, hasMore: hasMoreData };
}

export async function loadRemainingActivities(
  accessToken: string,
  {
    delayMs = HISTORY_SYNC_PAGE_DELAY_MS,
    maxPages = Number.POSITIVE_INFINITY,
    onProgress,
    onPageLoaded,
  }: LoadRemainingOptions = {}
) {
  let pagesLoaded = 0;
  let activitiesFetched = 0;
  let hasMoreData = useActivitiesStore.getState().hasMore;

  while (hasMoreData && pagesLoaded < maxPages) {
    const store = useActivitiesStore.getState();
    const page = getNextActivitiesPage(store.loadedPages, store.activities.length);
    onProgress?.({ pagesLoaded: pagesLoaded + 1, page });

    const result = await loadNextActivitiesPage(accessToken);
    pagesLoaded += 1;
    activitiesFetched += result.activities.length;
    await onPageLoaded?.(result);

    hasMoreData = result.hasMore && useActivitiesStore.getState().hasMore;
    if (hasMoreData && delayMs > 0) {
      await wait(delayMs);
    }
  }

  return { pagesLoaded, activitiesFetched, hasMore: hasMoreData };
}

export async function ensureActivityHistory(
  accessToken: string,
  {
    forceRecent = false,
    syncRecent = true,
    ...remainingOptions
  }: EnsureActivityHistoryOptions = {}
) {
  const store = useActivitiesStore.getState();
  const shouldSyncRecent =
    syncRecent &&
    (forceRecent || store.activities.length === 0 || isActivitiesCacheStale(store.lastFetchedAt));

  const recent = shouldSyncRecent
    ? await syncRecentActivities(accessToken, { force: true })
    : { skipped: true, pagesFetched: 0, activitiesFetched: 0 };

  const latestStore = useActivitiesStore.getState();
  const remaining = latestStore.hasMore
    ? await loadRemainingActivities(accessToken, remainingOptions)
    : { pagesLoaded: 0, activitiesFetched: 0, hasMore: false };

  return { recent, remaining };
}
