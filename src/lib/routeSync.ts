import type { StravaActivity } from '@/types';
import {
  areActivitiesSameRoute,
  createActivityFromRouteReference,
} from '@/lib/routeClustering';

export interface RouteSyncSavedRoute {
  key: string;
  name: string;
  activityIds: number[];
  referenceActivityId: number;
  polyline?: string;
  distance: number;
  elevationGain: number;
}

export interface RouteSyncStats {
  scannedActivities: number;
  routesUpdated: number;
  matchesAdded: number;
  matchesRemoved: number;
  totalMatches: number;
  skippedRoutes: number;
}

export interface RematchSavedRoutesOptions {
  pruneMissing?: boolean;
}

function uniqueIds(ids: number[]): number[] {
  const seen = new Set<number>();
  return ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function idsChanged(previous: number[], next: number[]) {
  return (
    previous.length !== next.length ||
    !previous.every((id, index) => id === next[index])
  );
}

function getReferenceActivity(route: RouteSyncSavedRoute, allActivities: StravaActivity[]) {
  return (
    allActivities.find((a) => a.id === route.referenceActivityId) ??
    allActivities.find((a) => route.activityIds.includes(a.id)) ??
    createActivityFromRouteReference(route) ??
    null
  );
}

export function rematchSavedRoutes<T extends RouteSyncSavedRoute>(
  savedRoutes: T[],
  allActivities: StravaActivity[],
  { pruneMissing = false }: RematchSavedRoutesOptions = {}
): { routes: T[]; stats: RouteSyncStats; changed: boolean } {
  let changed = false;
  const stats: RouteSyncStats = {
    scannedActivities: allActivities.length,
    routesUpdated: 0,
    matchesAdded: 0,
    matchesRemoved: 0,
    totalMatches: 0,
    skippedRoutes: 0,
  };

  const routes = savedRoutes.map((route) => {
    const referenceActivity = getReferenceActivity(route, allActivities);
    if (!referenceActivity) {
      stats.skippedRoutes += 1;
      stats.totalMatches += route.activityIds.length;
      return route;
    }

    const matchedIds = allActivities
      .filter((activity) => (
        activity.id === referenceActivity.id ||
        areActivitiesSameRoute(referenceActivity, activity)
      ))
      .map((activity) => activity.id);

    const activityIds = pruneMissing
      ? uniqueIds(matchedIds)
      : uniqueIds([...matchedIds, ...route.activityIds]);
    const added = activityIds.filter((id) => !route.activityIds.includes(id)).length;
    const removed = route.activityIds.filter((id) => !activityIds.includes(id)).length;
    stats.totalMatches += activityIds.length;

    const shouldUpdate =
      idsChanged(route.activityIds, activityIds) ||
      route.referenceActivityId !== referenceActivity.id ||
      route.polyline !== (referenceActivity.map?.summary_polyline || route.polyline);

    if (!shouldUpdate) return route;

    changed = true;
    stats.routesUpdated += 1;
    stats.matchesAdded += added;
    stats.matchesRemoved += removed;

    return {
      ...route,
      activityIds,
      referenceActivityId: referenceActivity.id,
      polyline: referenceActivity.map?.summary_polyline || route.polyline,
      distance: referenceActivity.distance,
      elevationGain: referenceActivity.total_elevation_gain || route.elevationGain,
    };
  });

  return { routes, stats, changed };
}
