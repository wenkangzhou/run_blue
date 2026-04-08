import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StravaActivity } from '@/types';

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
  selectActivity: (activity: StravaActivity | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasMore: (hasMore: boolean) => void;
  setTotalLoaded: (total: number) => void;
  setLastFetchedAt: (timestamp: number) => void;
  setLoadedPages: (pages: number) => void;
  setLatestActivityId: (id: number | null) => void;
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
          // 去重：基于 activity id
          const existingIds = new Set(state.activities.map(a => a.id));
          const newActivities = activities.filter(a => !existingIds.has(a.id));
          return {
            activities: [...state.activities, ...newActivities],
            totalLoaded: state.totalLoaded + newActivities.length,
          };
        }),
      prependActivities: (activities) =>
        set((state) => {
          // 去重：基于 activity id
          const existingIds = new Set(state.activities.map(a => a.id));
          const newActivities = activities.filter(a => !existingIds.has(a.id));
          return {
            activities: [...newActivities, ...state.activities],
            totalLoaded: state.totalLoaded + newActivities.length,
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
      partialize: (state) => ({
        activities: state.activities,
        totalLoaded: state.totalLoaded,
        lastFetchedAt: state.lastFetchedAt,
        loadedPages: state.loadedPages,
        latestActivityId: state.latestActivityId,
      }),
    }
  )
);

// Helper to check if cache is stale
export function isActivitiesCacheStale(lastFetchedAt: number | null): boolean {
  if (!lastFetchedAt) return true;
  return Date.now() - lastFetchedAt > CACHE_TTL;
}
