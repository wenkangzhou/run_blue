import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StravaActivity } from '@/types';
import { createIndexedDBStorage } from '@/lib/indexedDbStorage';
import { getActivityTimestamp } from '@/lib/dates';

/**
 * Strip heavy fields from activity before persisting to IndexedDB.
 * Strava list API returns huge objects; full polyline + metadata can exceed
 * practical client storage budgets after a few thousand activities.
 */
function toLightActivity(a: StravaActivity): StravaActivity {
  return {
    id: a.id,
    name: a.name,
    distance: a.distance,
    moving_time: a.moving_time,
    elapsed_time: a.elapsed_time,
    total_elevation_gain: a.total_elevation_gain,
    type: a.type,
    sport_type: a.sport_type,
    start_date: a.start_date,
    start_date_local: a.start_date_local,
    start_latlng: a.start_latlng,
    end_latlng: a.end_latlng,
    map: {
      id: '',
      polyline: null,
      summary_polyline: a.map?.summary_polyline ?? null,
    },
    gear_id: a.gear_id,
    gear: a.gear ? { id: a.gear.id, name: a.gear.name, distance: a.gear.distance } : undefined,
    average_speed: a.average_speed,
    max_speed: a.max_speed,
    average_cadence: a.average_cadence,
    average_temp: a.average_temp,
    has_heartrate: a.has_heartrate,
    average_heartrate: a.average_heartrate,
    max_heartrate: a.max_heartrate,
    calories: a.calories,
    workout_type: a.workout_type,
  } as StravaActivity;
}

function mergeActivity(existing: StravaActivity | undefined, incoming: StravaActivity): StravaActivity {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    map: {
      id: incoming.map?.id || existing.map?.id || '',
      polyline: incoming.map?.polyline ?? existing.map?.polyline ?? null,
      summary_polyline: incoming.map?.summary_polyline ?? existing.map?.summary_polyline ?? null,
    },
    gear_id: incoming.gear_id ?? existing.gear_id,
    gear: incoming.gear ?? existing.gear,
  };
}

function sortActivitiesNewestFirst(activities: StravaActivity[]): StravaActivity[] {
  return [...activities].sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a));
}

function mergeActivitiesById(existing: StravaActivity[], incoming: StravaActivity[]): StravaActivity[] {
  const map = new Map<number, StravaActivity>();
  existing.forEach((activity) => map.set(activity.id, activity));
  incoming.forEach((activity) => map.set(activity.id, mergeActivity(map.get(activity.id), activity)));
  return sortActivitiesNewestFirst(Array.from(map.values()));
}

interface ActivitiesState {
  activities: StravaActivity[];
  selectedActivity: StravaActivity | null;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  totalLoaded: number;
  lastFetchedAt: number | null;
  loadedPages: number; // 实际加载过的页数
  latestActivityId: number | null; // 最新一条活动的ID，用于检测新数据
  setActivities: (activities: StravaActivity[]) => void;
  appendActivities: (activities: StravaActivity[]) => void;
  prependActivities: (activities: StravaActivity[]) => void;
  replaceActivitiesBatch: (
    activities: StravaActivity[],
    loadedPages: number,
    hasMore: boolean,
    lastFetchedAt: number,
    latestActivityId?: number | null
  ) => void;
  appendActivitiesBatch: (
    activities: StravaActivity[],
    loadedPages: number,
    hasMore: boolean,
    lastFetchedAt: number
  ) => void;
  mergeActivitiesBatch: (
    activities: StravaActivity[],
    loadedPages: number,
    hasMore: boolean,
    lastFetchedAt: number,
    latestActivityId?: number | null
  ) => void;
  prependActivitiesBatch: (
    activities: StravaActivity[],
    lastFetchedAt: number,
    latestActivityId?: number | null
  ) => void;
  updateActivity: (activity: StravaActivity) => void;
  selectActivity: (activity: StravaActivity | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasMore: (hasMore: boolean) => void;
  setTotalLoaded: (total: number) => void;
  setLastFetchedAt: (timestamp: number) => void;
  setLoadedPages: (pages: number) => void;
  setLatestActivityId: (id: number | null) => void;
  batchUpdate: (patch: Partial<ActivitiesState>) => void;
  clearActivities: () => void;
}

type PersistedActivitiesState = Pick<
  ActivitiesState,
  'activities' | 'totalLoaded' | 'lastFetchedAt' | 'loadedPages' | 'latestActivityId'
>;

const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

function normalizePersistedActivitiesState(persistedState: unknown): PersistedActivitiesState {
  const state = persistedState as Partial<PersistedActivitiesState> | undefined;
  const activities = Array.isArray(state?.activities)
    ? state.activities.map(toLightActivity)
    : [];

  return {
    activities,
    totalLoaded: activities.length,
    lastFetchedAt: state?.lastFetchedAt ?? null,
    loadedPages: state?.loadedPages ?? Math.ceil(activities.length / 200),
    latestActivityId: state?.latestActivityId ?? activities[0]?.id ?? null,
  };
}

export const useActivitiesStore = create<ActivitiesState>()(
  persist(
    (set) => ({
      activities: [],
      selectedActivity: null,
      isLoading: false,
      error: null,
      hasMore: true,
      totalLoaded: 0,
      lastFetchedAt: null,
      loadedPages: 0, // 初始为0，表示还没加载任何页
      latestActivityId: null, // 初始无最新活动
      setActivities: (activities) => {
        const sorted = sortActivitiesNewestFirst(activities);
        set({
          activities: sorted,
          totalLoaded: sorted.length,
          latestActivityId: sorted[0]?.id ?? null,
        });
      },
      appendActivities: (activities) =>
        set((state) => {
          const existingIds = new Set(state.activities.map(a => a.id));
          const newActivities = activities.filter(a => !existingIds.has(a.id));
          return {
            activities: [...state.activities, ...newActivities],
            totalLoaded: state.totalLoaded + newActivities.length,
          };
        }),
      prependActivities: (activities) =>
        set((state) => {
          const existingIds = new Set(state.activities.map(a => a.id));
          const newActivities = activities.filter(a => !existingIds.has(a.id));
          return {
            activities: [...newActivities, ...state.activities],
            totalLoaded: state.totalLoaded + newActivities.length,
          };
        }),
      /** Replace activities + paging meta in a single persist write. */
      replaceActivitiesBatch: (activities, loadedPages, hasMore, lastFetchedAt, latestActivityId) =>
        set({
          activities,
          totalLoaded: activities.length,
          loadedPages,
          hasMore,
          lastFetchedAt,
          latestActivityId: latestActivityId ?? activities[0]?.id ?? null,
        }),
      /** Batch append + meta update in a single persist write (saves quota). */
      appendActivitiesBatch: (activities, loadedPages, hasMore, lastFetchedAt) =>
        set((state) => {
          const existingIds = new Set(state.activities.map(a => a.id));
          const newActivities = activities.filter(a => !existingIds.has(a.id));
          return {
            activities: [...state.activities, ...newActivities],
            totalLoaded: state.totalLoaded + newActivities.length,
            loadedPages,
            hasMore,
            lastFetchedAt,
            latestActivityId: state.latestActivityId ?? newActivities[0]?.id ?? null,
          };
        }),
      /** Merge recent pages into the cache without dropping older history. */
      mergeActivitiesBatch: (activities, loadedPages, hasMore, lastFetchedAt, latestActivityId) =>
        set((state) => {
          const merged = mergeActivitiesById(state.activities, activities);
          return {
            activities: merged,
            totalLoaded: merged.length,
            loadedPages: Math.max(state.loadedPages, loadedPages),
            hasMore: state.hasMore && hasMore,
            lastFetchedAt,
            latestActivityId: latestActivityId ?? merged[0]?.id ?? state.latestActivityId,
          };
        }),
      /** Batch prepend + meta update in a single persist write (saves quota). */
      prependActivitiesBatch: (activities, lastFetchedAt, latestActivityId) =>
        set((state) => {
          const existingIds = new Set(state.activities.map(a => a.id));
          const newActivities = activities.filter(a => !existingIds.has(a.id));
          return {
            activities: [...newActivities, ...state.activities],
            totalLoaded: state.totalLoaded + newActivities.length,
            lastFetchedAt,
            latestActivityId: latestActivityId ?? newActivities[0]?.id ?? state.latestActivityId,
          };
        }),
      updateActivity: (activity) =>
        set((state) => {
          const merged = mergeActivitiesById(state.activities, [activity]);
          return {
            activities: merged,
            totalLoaded: merged.length,
            latestActivityId: merged[0]?.id ?? state.latestActivityId,
          };
        }),
      selectActivity: (activity) => set({ selectedActivity: activity }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setHasMore: (hasMore) => set({ hasMore }),
      setTotalLoaded: (total) => set({ totalLoaded: total }),
      setLastFetchedAt: (timestamp) => set({ lastFetchedAt: timestamp }),
      setLoadedPages: (pages) => set({ loadedPages: pages }),
      setLatestActivityId: (id) => set({ latestActivityId: id }),
      /** Batch update multiple fields in a single persist write (saves quota). */
      batchUpdate: (patch) => set((state) => ({ ...state, ...patch })),
      clearActivities: () =>
        set({
          activities: [],
          selectedActivity: null,
          hasMore: true,
          totalLoaded: 0,
          lastFetchedAt: null,
          loadedPages: 0,
          latestActivityId: null,
        }),
    }),
    {
      name: 'activities-storage',
      version: 2,
      storage: createIndexedDBStorage<PersistedActivitiesState>({
        dbName: 'run_blue',
        storeName: 'zustand',
        migrateFromLocalStorage: true,
      }),
      partialize: (state) => {
        const activities = state.activities.map(toLightActivity);
        // Sync loadedPages with the persisted activity count so it stays accurate
        // after reload (prevents gear page from jumping to a wrong page).
        const syncedLoadedPages = Math.max(state.loadedPages, Math.ceil(activities.length / 200));
        return {
          activities,
          totalLoaded: activities.length,
          lastFetchedAt: state.lastFetchedAt,
          loadedPages: syncedLoadedPages,
          latestActivityId: state.latestActivityId,
        };
      },
      migrate: (persistedState) => normalizePersistedActivitiesState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedActivitiesState(persistedState),
      }),
    }
  )
);

// Helper to check if cache is stale
export function isActivitiesCacheStale(lastFetchedAt: number | null): boolean {
  if (!lastFetchedAt) return true;
  return Date.now() - lastFetchedAt > CACHE_TTL;
}
