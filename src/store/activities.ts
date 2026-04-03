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
  setActivities: (activities: StravaActivity[]) => void;
  appendActivities: (activities: StravaActivity[]) => void;
  selectActivity: (activity: StravaActivity | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPage: (page: number) => void;
  setHasMore: (hasMore: boolean) => void;
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
      setActivities: (activities) => set({ activities }),
      appendActivities: (activities) =>
        set((state) => ({
          activities: [...state.activities, ...activities],
        })),
      selectActivity: (activity) => set({ selectedActivity: activity }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setPage: (page) => set({ page }),
      setHasMore: (hasMore) => set({ hasMore }),
      clearActivities: () =>
        set({
          activities: [],
          selectedActivity: null,
          page: 1,
          hasMore: true,
        }),
    }),
    {
      name: 'activities-storage',
      partialize: (state) => ({
        activities: state.activities.slice(0, 50),
      }),
    }
  )
);
