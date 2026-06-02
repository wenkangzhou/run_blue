import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StravaActivity } from '@/types';
import { createIndexedDBStorage } from '@/lib/indexedDbStorage';

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
  prependActivitiesBatch: (
    activities: StravaActivity[],
    lastFetchedAt: number,
    latestActivityId?: number | null
  ) => void;
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
      setActivities: (activities) => set({ activities, totalLoaded: activities.length }),
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
