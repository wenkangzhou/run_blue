import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StravaActivity } from '@/types';
import { getRouteKey, getDefaultRouteName } from '@/lib/routeClustering';

export interface SavedRoute {
  key: string;
  name: string;
  activityIds: number[];
  createdAt: number;
}

interface RoutesState {
  savedRoutes: SavedRoute[];
  saveRoute: (activity: StravaActivity, allActivities?: StravaActivity[]) => void;
  unsaveRoute: (key: string) => void;
  renameRoute: (key: string, name: string) => void;
  removeActivityFromRoute: (key: string, activityId: number) => void;
  addActivityToRoute: (key: string, activityId: number) => void;
  isRouteSaved: (key: string) => boolean;
  getSavedRoute: (key: string) => SavedRoute | undefined;
}

export const useRoutesStore = create<RoutesState>()(
  persist(
    (set, get) => ({
      savedRoutes: [],

      saveRoute: (activity, allActivities = []) => {
        const key = getRouteKey(activity);
        if (!key) return;

        const existing = get().savedRoutes.find((r) => r.key === key);
        if (existing) {
          // Already saved, just ensure this activity is in the list
          if (!existing.activityIds.includes(activity.id)) {
            set((state) => ({
              savedRoutes: state.savedRoutes.map((r) =>
                r.key === key
                  ? { ...r, activityIds: [activity.id, ...r.activityIds] }
                  : r
              ),
            }));
          }
          return;
        }

        // Find all activities on this route for initial population
        const routeKey = getRouteKey(activity);
        const matchingActivities = allActivities.filter((a) => {
          if (a.id === activity.id) return true;
          const ak = getRouteKey(a);
          if (ak !== routeKey) return false;
          if (activity.distance > 0) {
            const diff = Math.abs(a.distance - activity.distance) / activity.distance;
            if (diff > 0.15) return false;
          }
          return true;
        });

        const activityIds = matchingActivities
          .map((a) => a.id)
          .filter((id, idx, arr) => arr.indexOf(id) === idx); // dedupe

        const name = getDefaultRouteName(matchingActivities);

        set((state) => ({
          savedRoutes: [
            ...state.savedRoutes,
            {
              key,
              name: name || activity.name || 'Unnamed Route',
              activityIds,
              createdAt: Date.now(),
            },
          ],
        }));
      },

      unsaveRoute: (key) => {
        set((state) => ({
          savedRoutes: state.savedRoutes.filter((r) => r.key !== key),
        }));
      },

      renameRoute: (key, name) => {
        set((state) => ({
          savedRoutes: state.savedRoutes.map((r) =>
            r.key === key ? { ...r, name: name.trim() } : r
          ),
        }));
      },

      removeActivityFromRoute: (key, activityId) => {
        set((state) => ({
          savedRoutes: state.savedRoutes.map((r) =>
            r.key === key
              ? { ...r, activityIds: r.activityIds.filter((id) => id !== activityId) }
              : r
          ),
        }));
      },

      addActivityToRoute: (key, activityId) => {
        set((state) => ({
          savedRoutes: state.savedRoutes.map((r) =>
            r.key === key && !r.activityIds.includes(activityId)
              ? { ...r, activityIds: [...r.activityIds, activityId] }
              : r
          ),
        }));
      },

      isRouteSaved: (key) => {
        return get().savedRoutes.some((r) => r.key === key);
      },

      getSavedRoute: (key) => {
        return get().savedRoutes.find((r) => r.key === key);
      },
    }),
    {
      name: 'routes-storage',
      partialize: (state) => ({
        savedRoutes: state.savedRoutes,
      }),
    }
  )
);
