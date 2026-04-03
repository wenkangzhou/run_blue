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
  setActivities: (activities: StravaActivity[]) => void;
  appendActivities: (activities: StravaActivity[]) => void;
  selectActivity: (activity: StravaActivity | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPage: (page: number) => void;
  setHasMore: (hasMore: boolean) => void;
  setTotalLoaded: (total: number) => void;
  clearActivities: () => void;
}

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
      setActivities: (activities) => set({ activities }),
      appendActivities: (activities) =>
        set((state) => ({
          activities: [...state.activities, ...activities],
          totalLoaded: state.totalLoaded + activities.length,
        })),
      selectActivity: (activity) => set({ selectedActivity: activity }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setPage: (page) => set({ page }),
      setHasMore: (hasMore) => set({ hasMore }),
      setTotalLoaded: (total) => set({ totalLoaded: total }),
      clearActivities: () =>
        set({
          activities: [],
          selectedActivity: null,
          page: 1,
          hasMore: true,
          totalLoaded: 0,
        }),
    }),
    {
      name: 'activities-storage',
      partialize: (state) => ({
        activities: state.activities.slice(0, 100),
        totalLoaded: Math.min(state.totalLoaded, 100),
      }),
    }
  )
);
