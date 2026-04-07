import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StravaActivity } from '@/types';

interface ActivitiesState {
  activities: StravaActivity[];
  selectedActivity: StravaActivity | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
  totalLoaded: number;
  lastFetchedAt: number | null;
  setActivities: (activities: StravaActivity[]) => void;
  appendActivities: (activities: StravaActivity[]) => void;
  prependActivities: (activities: StravaActivity[]) => void;
  selectActivity: (activity: StravaActivity | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPage: (page: number) => void;
  setHasMore: (hasMore: boolean) => void;
  setTotalLoaded: (total: number) => void;
  setLastFetchedAt: (timestamp: number) => void;
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
      page: 1,
      hasMore: true,
      totalLoaded: 0,
      lastFetchedAt: null,
      setActivities: (activities) => set({ activities }),
      appendActivities: (activities) =>
        set((state) => ({
          activities: [...state.activities, ...activities],
          totalLoaded: state.totalLoaded + activities.length,
        })),
      prependActivities: (activities) =>
        set((state) => ({
          activities: [...activities, ...state.activities],
          totalLoaded: state.totalLoaded + activities.length,
        })),
      selectActivity: (activity) => set({ selectedActivity: activity }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setPage: (page) => set({ page }),
      setHasMore: (hasMore) => set({ hasMore }),
      setTotalLoaded: (total) => set({ totalLoaded: total }),
      setLastFetchedAt: (timestamp) => set({ lastFetchedAt: timestamp }),
      clearActivities: () =>
        set({
          activities: [],
          selectedActivity: null,
          page: 1,
          hasMore: true,
          totalLoaded: 0,
          lastFetchedAt: null,
        }),
    }),
    {
      name: 'activities-storage',
      partialize: (state) => ({
        activities: state.activities.slice(0, 100),
        totalLoaded: Math.min(state.totalLoaded, 100),
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
);

// Helper to check if cache is stale
export function isActivitiesCacheStale(lastFetchedAt: number | null): boolean {
  if (!lastFetchedAt) return true;
  return Date.now() - lastFetchedAt > CACHE_TTL;
}
