import { create } from 'zustand';
import { persist, StorageValue } from 'zustand/middleware';
import { StravaActivity } from '@/types';

/**
 * Strip heavy fields from activity before persisting to localStorage.
 * Strava list API returns huge objects; full polyline + metadata can exceed
 * browser localStorage quota (~5-10MB) after a few hundred activities.
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

/** Safe localStorage wrapper that catches QuotaExceededError. */
const safeLocalStorage = {
  getItem: (name: string) => {
    if (typeof window === 'undefined') return null;
    const str = localStorage.getItem(name);
    return str ? JSON.parse(str) : null;
  },
  setItem: (name: string, value: StorageValue<any>) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      ) {
        // Attempt to halve activities and retry
        const activities = value?.state?.activities;
        if (Array.isArray(activities) && activities.length > 50) {
          const halved = Math.floor(activities.length / 2);
          const reduced = {
            ...value,
            state: {
              ...value.state,
              activities: activities.slice(0, halved),
            },
          };
          try {
            localStorage.setItem(name, JSON.stringify(reduced));
            console.warn(
              `[Persist] Quota exceeded for "${name}". Reduced activities from ${activities.length} to ${halved}.`
            );
            return;
          } catch {
            // Still failing after halving — fall through to error
          }
        }
        console.error(
          `[Persist] localStorage quota exceeded for "${name}". ` +
            `Try clearing site data or reducing cached activities.`
        );
      } else {
        throw e;
      }
    }
  },
  removeItem: (name: string) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(name);
  },
};

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
  appendActivitiesBatch: (
    activities: StravaActivity[],
    loadedPages: number,
    hasMore: boolean,
    lastFetchedAt: number
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

const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

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
      setActivities: (activities) => set({ activities }),
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
      storage: safeLocalStorage,
      partialize: (state) => {
        const activities = state.activities.slice(0, 250).map(toLightActivity);
        // Sync loadedPages with the truncated activity count so it stays accurate
        // after persist reload (prevents gear page from jumping to a wrong page).
        const syncedLoadedPages = Math.min(
          state.loadedPages,
          Math.max(1, Math.ceil(activities.length / 200))
        );
        return {
          activities,
          totalLoaded: Math.min(state.totalLoaded, 250),
          lastFetchedAt: state.lastFetchedAt,
          loadedPages: syncedLoadedPages,
          latestActivityId: state.latestActivityId,
        };
      },
    }
  )
);

// Helper to check if cache is stale
export function isActivitiesCacheStale(lastFetchedAt: number | null): boolean {
  if (!lastFetchedAt) return true;
  return Date.now() - lastFetchedAt > CACHE_TTL;
}
