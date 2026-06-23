import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StravaActivity } from '@/types';
import {
  getRouteKey,
  getDefaultRouteName,
  areActivitiesSameRoute,
  createActivityFromRouteReference,
} from '@/lib/routeClustering';
import {
  rematchSavedRoutes,
  type RematchSavedRoutesOptions,
  type RouteSyncStats,
} from '@/lib/routeSync';
import { createIndexedDBStorage } from '@/lib/indexedDbStorage';

export interface SavedRoute {
  key: string;
  name: string;
  activityIds: number[];
  excludedActivityIds?: number[];
  manualUpdatedAt?: number;
  createdAt: number;
  referenceActivityId: number; // Activity used as the reference track for matching
  polyline?: string; // Encoded polyline of the reference track
  distance: number; // Reference distance in meters
  elevationGain: number; // Reference elevation gain in meters
}

interface RoutesBackup {
  createdAt: number;
  reason: 'sync' | 'manual';
  savedRoutes: SavedRoute[];
}

interface RoutesState {
  savedRoutes: SavedRoute[];
  lastRoutesBackup: RoutesBackup | null;
  saveRoute: (activity: StravaActivity, allActivities?: StravaActivity[]) => void;
  unsaveRoute: (key: string) => void;
  unsaveActivity: (activityId: number) => void;
  renameRoute: (key: string, name: string) => void;
  removeActivityFromRoute: (key: string, activityId: number) => void;
  splitActivityToRoute: (key: string, activity: StravaActivity) => void;
  splitActivitiesToRoute: (key: string, activities: StravaActivity[]) => void;
  addActivityToRoute: (key: string, activityId: number) => void;
  mergeRoutes: (targetKey: string, sourceKey: string) => void;
  mergeRoutesBatch: (targetKey: string, sourceKeys: string[]) => void;
  restoreLastRoutesBackup: () => void;
  isRouteSaved: (key: string) => boolean;
  isActivitySaved: (activityId: number) => boolean;
  syncRoutes: (allActivities: StravaActivity[], options?: RematchSavedRoutesOptions) => RouteSyncStats;
  getSavedRoute: (key: string) => SavedRoute | undefined;
}

type PersistedRoutesState = Pick<RoutesState, 'savedRoutes' | 'lastRoutesBackup'>;

function uniqueActivityIds(ids: number[]) {
  const seen = new Set<number>();
  return ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getUniqueRouteKey(baseKey: string, routes: SavedRoute[]) {
  if (!routes.some((route) => route.key === baseKey)) return baseKey;
  let counter = 1;
  while (routes.some((route) => route.key === `${baseKey}#${counter}`)) {
    counter++;
  }
  return `${baseKey}#${counter}`;
}

function getRouteBaseKey(key: string) {
  return key.split('#')[0];
}

function getRouteReferenceActivity(route: SavedRoute, allActivities: StravaActivity[]) {
  return (
    allActivities.find((a) => a.id === route.referenceActivityId) ??
    allActivities.find((a) => route.activityIds.includes(a.id)) ??
    createActivityFromRouteReference(route)
  );
}

function hasManualExclusions(route: SavedRoute) {
  return (route.excludedActivityIds?.length ?? 0) > 0;
}

function mergeRouteRecords(target: SavedRoute, source: SavedRoute): SavedRoute {
  const nextActivityIds = uniqueActivityIds([...target.activityIds, ...source.activityIds]);
  const nextExcludedActivityIds = uniqueActivityIds([
    ...(target.excludedActivityIds ?? []),
    ...(source.excludedActivityIds ?? []),
  ]).filter((id) => !nextActivityIds.includes(id));

  return {
    ...target,
    activityIds: nextActivityIds,
    excludedActivityIds: nextExcludedActivityIds,
    polyline: target.polyline || source.polyline,
    distance: target.distance || source.distance,
    elevationGain: target.elevationGain || source.elevationGain,
  };
}

function canAutoMergeRoutes(route: SavedRoute, candidate: SavedRoute, allActivities: StravaActivity[]) {
  if (route.key === candidate.key) return false;
  if (hasManualExclusions(route) || hasManualExclusions(candidate)) return false;

  const reference = getRouteReferenceActivity(route, allActivities);
  const candidateReference = getRouteReferenceActivity(candidate, allActivities);
  if (!reference || !candidateReference) return false;
  if (reference.id === candidateReference.id) return true;
  if (!reference.map?.summary_polyline || !candidateReference.map?.summary_polyline) return false;

  return areActivitiesSameRoute(reference, candidateReference, 0.2, 0.08);
}

function getAutoMergeTarget(route: SavedRoute, candidate: SavedRoute) {
  if (candidate.activityIds.length !== route.activityIds.length) {
    return candidate.activityIds.length > route.activityIds.length ? candidate : route;
  }
  return candidate.createdAt < route.createdAt ? candidate : route;
}

function autoMergeSafeRoutes(savedRoutes: SavedRoute[], allActivities: StravaActivity[]) {
  let routes = [...savedRoutes];
  let mergedRoutes = 0;
  let merged = true;

  while (merged) {
    merged = false;
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const route = routes[i];
        const candidate = routes[j];
        if (!canAutoMergeRoutes(route, candidate, allActivities)) continue;

        const target = getAutoMergeTarget(route, candidate);
        const source = target.key === route.key ? candidate : route;
        const mergedRoute = mergeRouteRecords(target, source);
        routes = routes
          .filter((item) => item.key !== source.key)
          .map((item) => (item.key === target.key ? mergedRoute : item));
        mergedRoutes++;
        merged = true;
        break;
      }
      if (merged) break;
    }
  }

  return {
    routes,
    mergedRoutes,
    changed: mergedRoutes > 0,
  };
}

function createRoutesBackup(savedRoutes: SavedRoute[], reason: RoutesBackup['reason']): RoutesBackup {
  return {
    createdAt: Date.now(),
    reason,
    savedRoutes,
  };
}

function getPreviousActivityOwnerMap(routes: SavedRoute[]) {
  const owners = new Map<number, string>();
  routes.forEach((route) => {
    route.activityIds.forEach((id) => {
      if (!owners.has(id)) {
        owners.set(id, route.key);
      }
    });
  });
  return owners;
}

function preserveExistingRouteOwnership(previousRoutes: SavedRoute[], nextRoutes: SavedRoute[]) {
  const previousOwners = getPreviousActivityOwnerMap(previousRoutes);

  return nextRoutes
    .map((route) => {
      const previousRoute = previousRoutes.find((candidate) => candidate.key === route.key);
      const previousIds = previousRoute?.activityIds ?? [];
      const preservedIds = route.activityIds.filter((id) => {
        const owner = previousOwners.get(id);
        return !owner || owner === route.key || previousIds.includes(id);
      });

      return {
        ...route,
        activityIds: uniqueActivityIds([...previousIds, ...preservedIds]),
      };
    })
    .filter((route) => route.activityIds.length > 0);
}

function haveRoutesChanged(previousRoutes: SavedRoute[], nextRoutes: SavedRoute[]) {
  if (previousRoutes.length !== nextRoutes.length) return true;

  return nextRoutes.some((route) => {
    const previous = previousRoutes.find((candidate) => candidate.key === route.key);
    if (!previous) return true;
    if (previous.referenceActivityId !== route.referenceActivityId) return true;
    if (previous.polyline !== route.polyline) return true;
    if (previous.activityIds.length !== route.activityIds.length) return true;
    return !previous.activityIds.every((id, index) => id === route.activityIds[index]);
  });
}

function getRouteChangeStats(previousRoutes: SavedRoute[], nextRoutes: SavedRoute[]) {
  let routesUpdated = 0;
  let matchesAdded = 0;
  let matchesRemoved = 0;

  nextRoutes.forEach((route) => {
    const previous = previousRoutes.find((candidate) => candidate.key === route.key);
    if (!previous) {
      routesUpdated++;
      matchesAdded += route.activityIds.length;
      return;
    }

    const added = route.activityIds.filter((id) => !previous.activityIds.includes(id)).length;
    const removed = previous.activityIds.filter((id) => !route.activityIds.includes(id)).length;
    if (
      added > 0 ||
      removed > 0 ||
      previous.referenceActivityId !== route.referenceActivityId ||
      previous.polyline !== route.polyline
    ) {
      routesUpdated++;
      matchesAdded += added;
      matchesRemoved += removed;
    }
  });

  previousRoutes.forEach((route) => {
    if (!nextRoutes.some((candidate) => candidate.key === route.key)) {
      routesUpdated++;
      matchesRemoved += route.activityIds.length;
    }
  });

  return {
    routesUpdated,
    matchesAdded,
    matchesRemoved,
  };
}

function normalizePersistedRoutesState(persistedState: unknown): PersistedRoutesState {
  const state = persistedState as Partial<PersistedRoutesState> | undefined;
  return {
    savedRoutes: Array.isArray(state?.savedRoutes) ? state.savedRoutes : [],
    lastRoutesBackup: state?.lastRoutesBackup && Array.isArray(state.lastRoutesBackup.savedRoutes)
      ? state.lastRoutesBackup
      : null,
  };
}

export const useRoutesStore = create<RoutesState>()(
  persist(
    (set, get) => ({
      savedRoutes: [],
      lastRoutesBackup: null,

      saveRoute: (activity, allActivities = []) => {
        const key = getRouteKey(activity);
        if (!key) return;

        // Already saved? Skip.
        if (get().savedRoutes.some((r) => r.activityIds.includes(activity.id))) {
          return;
        }

        // Find a compatible existing route first. GPS start points can drift
        // enough to change the rounded key, so shape matching is the real guard.
        let finalKey = key;
        const existingRoutes = get().savedRoutes;
        const compatibleRoute = existingRoutes.find((r) => {
          const refActivity =
            allActivities.find((a) => a.id === r.referenceActivityId) ??
            createActivityFromRouteReference(r);
          if (!refActivity) return false;
          return areActivitiesSameRoute(activity, refActivity);
        });

        if (compatibleRoute) {
          const refActivity =
            allActivities.find((a) => a.id === compatibleRoute.referenceActivityId) ??
            createActivityFromRouteReference(compatibleRoute) ??
            activity;
          const excluded = new Set(compatibleRoute.excludedActivityIds ?? []);
          const matchingIds = allActivities
            .filter((a) => a.id === activity.id || (!excluded.has(a.id) && areActivitiesSameRoute(refActivity, a)))
            .map((a) => a.id);
          const nextActivityIds = uniqueActivityIds([
            activity.id,
            ...matchingIds,
            ...compatibleRoute.activityIds,
          ]);
          const nextExcludedActivityIds = (compatibleRoute.excludedActivityIds ?? [])
            .filter((id) => !nextActivityIds.includes(id));

          set((state) => ({
            savedRoutes: state.savedRoutes.map((r) =>
              r.key === compatibleRoute.key
                ? { ...r, activityIds: nextActivityIds, excludedActivityIds: nextExcludedActivityIds }
                : r
            ),
          }));
          return;
        }

        const sameKeyRoutes = existingRoutes.filter((r) => r.key === key || r.key.startsWith(`${key}#`));
        if (sameKeyRoutes.length > 0) {
          // Same key but incompatible shape → generate unique key
          finalKey = getUniqueRouteKey(key, get().savedRoutes);
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
          lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'manual'),
        }));
      },

      unsaveActivity: (activityId) => {
        set((state) => {
          const updated = state.savedRoutes
            .map((r) => {
              if (!r.activityIds.includes(activityId)) return r;
              return {
                ...r,
                activityIds: r.activityIds.filter((id) => id !== activityId),
                excludedActivityIds: uniqueActivityIds([...(r.excludedActivityIds ?? []), activityId]),
                manualUpdatedAt: Date.now(),
              };
            })
            .filter((r) => r.activityIds.length > 0);
          return {
            savedRoutes: updated,
            lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'manual'),
          };
        });
      },


      renameRoute: (key, name) => {
        set((state) => ({
          savedRoutes: state.savedRoutes.map((r) =>
            r.key === key ? { ...r, name: name.trim(), manualUpdatedAt: Date.now() } : r
          ),
        }));
      },

      removeActivityFromRoute: (key, activityId) => {
        set((state) => ({
          savedRoutes: state.savedRoutes
            .map((r) =>
              r.key === key
                ? {
                    ...r,
                    activityIds: r.activityIds.filter((id) => id !== activityId),
                    excludedActivityIds: uniqueActivityIds([...(r.excludedActivityIds ?? []), activityId]),
                    manualUpdatedAt: Date.now(),
                  }
                : r
            )
            .filter((r) => r.activityIds.length > 0),
          lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'manual'),
        }));
      },

      splitActivityToRoute: (key, activity) => {
        const activityKey = getRouteKey(activity);
        if (!activityKey) return;

        set((state) => {
          const sourceRoute = state.savedRoutes.find((route) => route.key === key);
          if (!sourceRoute || !sourceRoute.activityIds.includes(activity.id)) return state;

          const remainingRoutes = state.savedRoutes
            .map((route) =>
              route.key === key
                ? {
                    ...route,
                    activityIds: route.activityIds.filter((id) => id !== activity.id),
                    excludedActivityIds: uniqueActivityIds([...(route.excludedActivityIds ?? []), activity.id]),
                    manualUpdatedAt: Date.now(),
                  }
                : route
            )
            .filter((route) => route.activityIds.length > 0);
          const baseKey = getRouteBaseKey(sourceRoute.key) || activityKey;
          const nextKey = getUniqueRouteKey(baseKey, remainingRoutes);
          const sourceActivityIds = sourceRoute.activityIds.filter((id) => id !== activity.id);

          return {
            savedRoutes: [
              ...remainingRoutes,
              {
                key: nextKey,
                name: activity.name || sourceRoute.name,
                activityIds: [activity.id],
                excludedActivityIds: uniqueActivityIds([
                  ...sourceActivityIds,
                  ...(sourceRoute.excludedActivityIds ?? []),
                ]),
                manualUpdatedAt: Date.now(),
                createdAt: Date.now(),
                referenceActivityId: activity.id,
                polyline: activity.map?.summary_polyline || undefined,
                distance: activity.distance,
                elevationGain: activity.total_elevation_gain || 0,
              },
            ],
            lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'manual'),
          };
        });
      },

      splitActivitiesToRoute: (key, activities) => {
        const selectedActivities = activities.filter((activity, index, arr) => (
          arr.findIndex((candidate) => candidate.id === activity.id) === index
        ));
        if (selectedActivities.length === 0) return;

        set((state) => {
          const sourceRoute = state.savedRoutes.find((route) => route.key === key);
          if (!sourceRoute) return state;

          const selectedIds = selectedActivities
            .map((activity) => activity.id)
            .filter((id) => sourceRoute.activityIds.includes(id));
          if (selectedIds.length === 0 || selectedIds.length >= sourceRoute.activityIds.length) return state;

          const referenceActivity = selectedActivities.find((activity) => selectedIds.includes(activity.id));
          if (!referenceActivity) return state;

          const remainingSourceIds = sourceRoute.activityIds.filter((id) => !selectedIds.includes(id));
          const remainingRoutes = state.savedRoutes
            .map((route) =>
              route.key === key
                ? {
                    ...route,
                    activityIds: remainingSourceIds,
                    excludedActivityIds: uniqueActivityIds([...(route.excludedActivityIds ?? []), ...selectedIds]),
                    manualUpdatedAt: Date.now(),
                  }
                : route
            )
            .filter((route) => route.activityIds.length > 0);
          const baseKey = getRouteBaseKey(sourceRoute.key) || getRouteKey(referenceActivity);
          const nextKey = getUniqueRouteKey(baseKey, remainingRoutes);
          const selectedRouteActivities = selectedActivities.filter((activity) => selectedIds.includes(activity.id));

          return {
            savedRoutes: [
              ...remainingRoutes,
              {
                key: nextKey,
                name: getDefaultRouteName(selectedRouteActivities) || referenceActivity.name || sourceRoute.name,
                activityIds: selectedIds,
                excludedActivityIds: uniqueActivityIds([
                  ...remainingSourceIds,
                  ...(sourceRoute.excludedActivityIds ?? []),
                ]),
                manualUpdatedAt: Date.now(),
                createdAt: Date.now(),
                referenceActivityId: referenceActivity.id,
                polyline: referenceActivity.map?.summary_polyline || undefined,
                distance: referenceActivity.distance,
                elevationGain: referenceActivity.total_elevation_gain || 0,
              },
            ],
            lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'manual'),
          };
        });
      },

      addActivityToRoute: (key, activityId) => {
        set((state) => ({
          savedRoutes: state.savedRoutes.map((r) =>
            r.key === key && !r.activityIds.includes(activityId)
              ? {
                  ...r,
                  activityIds: [...r.activityIds, activityId],
                  excludedActivityIds: (r.excludedActivityIds ?? []).filter((id) => id !== activityId),
                  manualUpdatedAt: Date.now(),
                }
              : r
          ),
          lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'manual'),
        }));
      },

      mergeRoutes: (targetKey, sourceKey) => {
        if (targetKey === sourceKey) return;

        set((state) => {
          const target = state.savedRoutes.find((route) => route.key === targetKey);
          const source = state.savedRoutes.find((route) => route.key === sourceKey);
          if (!target || !source) return state;
          const mergedRoute = mergeRouteRecords(target, source);

          return {
            savedRoutes: state.savedRoutes
              .filter((route) => route.key !== sourceKey)
              .map((route) =>
                route.key === targetKey
                  ? { ...mergedRoute, manualUpdatedAt: Date.now() }
                  : route
              ),
            lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'manual'),
          };
        });
      },

      mergeRoutesBatch: (targetKey, sourceKeys) => {
        const uniqueSourceKeys = Array.from(new Set(sourceKeys)).filter((key) => key !== targetKey);
        if (uniqueSourceKeys.length === 0) return;

        set((state) => {
          const target = state.savedRoutes.find((route) => route.key === targetKey);
          const sources = uniqueSourceKeys
            .map((sourceKey) => state.savedRoutes.find((route) => route.key === sourceKey))
            .filter((route): route is SavedRoute => Boolean(route));
          if (!target || sources.length === 0) return state;

          const mergedRoute = sources.reduce(
            (merged, source) => mergeRouteRecords(merged, source),
            target
          );
          const sourceKeySet = new Set(sources.map((source) => source.key));

          return {
            savedRoutes: state.savedRoutes
              .filter((route) => !sourceKeySet.has(route.key))
              .map((route) =>
                route.key === targetKey
                  ? { ...mergedRoute, manualUpdatedAt: Date.now() }
                  : route
              ),
            lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'manual'),
          };
        });
      },

      restoreLastRoutesBackup: () => {
        set((state) => {
          if (!state.lastRoutesBackup) return state;
          return {
            savedRoutes: state.lastRoutesBackup.savedRoutes,
            lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'manual'),
          };
        });
      },

      isRouteSaved: (key) => {
        return get().savedRoutes.some((r) => r.key === key);
      },

      isActivitySaved: (activityId) => {
        return get().savedRoutes.some((r) => r.activityIds.includes(activityId));
      },

      syncRoutes: (allActivities, options) => {
        let resultStats: RouteSyncStats = {
          scannedActivities: allActivities.length,
          routesUpdated: 0,
          matchesAdded: 0,
          matchesRemoved: 0,
          totalMatches: get().savedRoutes.reduce((sum, route) => sum + route.activityIds.length, 0),
          skippedRoutes: 0,
          autoMergedRoutes: 0,
        };

        set((state) => {
          const result = rematchSavedRoutes(state.savedRoutes, allActivities, {
            ...options,
            pruneMissing: false,
          });
          const ownershipPreservedRoutes = preserveExistingRouteOwnership(state.savedRoutes, result.routes);
          const autoMergeResult = options?.autoMerge
            ? autoMergeSafeRoutes(ownershipPreservedRoutes, allActivities)
            : { routes: ownershipPreservedRoutes, mergedRoutes: 0, changed: false };
          const changed = haveRoutesChanged(state.savedRoutes, autoMergeResult.routes);
          const changeStats = getRouteChangeStats(state.savedRoutes, autoMergeResult.routes);
          resultStats = {
            ...result.stats,
            ...changeStats,
            autoMergedRoutes: autoMergeResult.mergedRoutes,
            totalMatches: autoMergeResult.routes.reduce((sum, route) => sum + route.activityIds.length, 0),
          };
          if (!changed) return state;
          return {
            savedRoutes: autoMergeResult.routes,
            lastRoutesBackup: createRoutesBackup(state.savedRoutes, 'sync'),
          };
        });

        return resultStats;
      },

      getSavedRoute: (key) => {
        return get().savedRoutes.find((r) => r.key === key);
      },
    }),
    {
      name: 'routes-storage',
      storage: createIndexedDBStorage<PersistedRoutesState>({
        dbName: 'run_blue',
        storeName: 'zustand',
        migrateFromLocalStorage: true,
      }),
      partialize: (state) => ({
        savedRoutes: state.savedRoutes,
        lastRoutesBackup: state.lastRoutesBackup,
      }),
      migrate: (persistedState) => normalizePersistedRoutesState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedRoutesState(persistedState),
      }),
    }
  )
);
