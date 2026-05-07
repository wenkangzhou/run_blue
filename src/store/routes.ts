import { create } from 'zustand';
import { persist, StorageValue } from 'zustand/middleware';
import { StravaActivity } from '@/types';
import { getRouteKey, getDefaultRouteName, areActivitiesSameRoute } from '@/lib/routeClustering';

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
        console.error(
          `[Persist] localStorage quota exceeded for "${name}".`
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
  unsaveActivity: (activityId: number) => void;
  renameRoute: (key: string, name: string) => void;
  removeActivityFromRoute: (key: string, activityId: number) => void;
  addActivityToRoute: (key: string, activityId: number) => void;
  isRouteSaved: (key: string) => boolean;
  isActivitySaved: (activityId: number) => boolean;
  syncRoutes: (allActivities: StravaActivity[]) => void;
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
        const matchingActivities = allActivities.filter((a) => {
          if (a.id === activity.id) return true;
          return areActivitiesSameRoute(activity, a);
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

      unsaveActivity: (activityId) => {
        set((state) => {
          const updated = state.savedRoutes
            .map((r) => ({
              ...r,
              activityIds: r.activityIds.filter((id) => id !== activityId),
            }))
            .filter((r) => r.activityIds.length > 0);
          return { savedRoutes: updated };
        });
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

      isActivitySaved: (activityId) => {
        return get().savedRoutes.some((r) => r.activityIds.includes(activityId));
      },

      syncRoutes: (allActivities) => {
        set((state) => {
          let hasChanges = false;
          const updatedRoutes = state.savedRoutes.map((route) => {
            // Find a reference activity from current pool to use for distance matching
            const referenceActivity = allActivities.find((a) =>
              route.activityIds.includes(a.id)
            );
            if (!referenceActivity) {
              // Keep existing ids if no reference found in current data pool
              return route;
            }

            const routeKey = getRouteKey(referenceActivity);
            if (!routeKey) return route;

            // Re-match all activities using flexible geographic matching
            const matchingActivities = allActivities.filter((a) => {
              if (a.id === referenceActivity.id) return true;
              return areActivitiesSameRoute(referenceActivity, a);
            });

            const activityIds = matchingActivities
              .map((a) => a.id)
              .filter((id, idx, arr) => arr.indexOf(id) === idx);

            // Check if changed
            const idsChanged =
              activityIds.length !== route.activityIds.length ||
              !activityIds.every((id) => route.activityIds.includes(id));

            if (!idsChanged) return route;

            hasChanges = true;
            const name = getDefaultRouteName(matchingActivities);
            return {
              ...route,
              name: name || route.name,
              activityIds,
            };
          });

          if (!hasChanges) return state;
          return { savedRoutes: updatedRoutes };
        });
      },

      getSavedRoute: (key) => {
        return get().savedRoutes.find((r) => r.key === key);
      },
    }),
    {
      name: 'routes-storage',
      storage: safeLocalStorage,
      partialize: (state) => ({
        savedRoutes: state.savedRoutes,
      }),
    }
  )
);
