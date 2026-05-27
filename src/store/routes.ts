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
  referenceActivityId: number; // Activity used as the reference track for matching
  polyline?: string; // Encoded polyline of the reference track
  distance: number; // Reference distance in meters
  elevationGain: number; // Reference elevation gain in meters
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

        // Already saved? Skip.
        if (get().savedRoutes.some((r) => r.activityIds.includes(activity.id))) {
          return;
        }

        // Find a compatible existing route with the same key.
        // If the key matches but the route shape is different (e.g. track vs L-shaped street),
        // we generate a unique suffixed key instead of merging.
        let finalKey = key;
        const sameKeyRoutes = get().savedRoutes.filter((r) => r.key === key || r.key.startsWith(`${key}#`));
        if (sameKeyRoutes.length > 0) {
          const compatibleRoute = sameKeyRoutes.find((r) => {
            const refActivity = allActivities.find((a) => a.id === r.referenceActivityId);
            if (!refActivity) return false;
            return areActivitiesSameRoute(activity, refActivity);
          });

          if (compatibleRoute) {
            // Merge into compatible route
            if (!compatibleRoute.activityIds.includes(activity.id)) {
              set((state) => ({
                savedRoutes: state.savedRoutes.map((r) =>
                  r.key === compatibleRoute.key
                    ? { ...r, activityIds: [activity.id, ...r.activityIds] }
                    : r
                ),
              }));
            }
            return;
          }

          // Same key but incompatible shape → generate unique key
          let counter = 1;
          while (get().savedRoutes.some((r) => r.key === `${key}#${counter}`)) {
            counter++;
          }
          finalKey = `${key}#${counter}`;
        }

        // Create new route — find all historical matches for initial population
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
              key: finalKey,
              name: name || activity.name || 'Unnamed Route',
              activityIds,
              createdAt: Date.now(),
              referenceActivityId: activity.id,
              polyline: activity.map?.summary_polyline || undefined,
              distance: activity.distance,
              elevationGain: activity.total_elevation_gain || 0,
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
            // Use the saved reference activity or find from pool
            let referenceActivity = allActivities.find(
              (a) => a.id === route.referenceActivityId
            );
            if (!referenceActivity) {
              referenceActivity = allActivities.find((a) =>
                route.activityIds.includes(a.id)
              );
            }
            if (!referenceActivity) {
              return route;
            }

            // Re-match all activities using the reference track
            const matchingActivities = allActivities.filter((a) => {
              if (a.id === referenceActivity!.id) return true;
              return areActivitiesSameRoute(referenceActivity!, a);
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
            return {
              ...route,
              activityIds,
              referenceActivityId: referenceActivity.id,
              polyline: referenceActivity.map?.summary_polyline || route.polyline,
              distance: referenceActivity.distance,
              elevationGain: referenceActivity.total_elevation_gain || route.elevationGain,
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
