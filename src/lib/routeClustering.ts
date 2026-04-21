import { StravaActivity } from '@/types';

/**
 * Generate a route cluster key from an activity's start position.
 * Rounds lat/lng to 2 decimal places (~1km precision).
 */
export function getRouteKey(activity: StravaActivity): string {
  if (!activity.start_latlng || activity.start_latlng.length < 2) {
    return '';
  }
  const [lat, lng] = activity.start_latlng;
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLng = Math.round(lng * 100) / 100;
  return `${roundedLat},${roundedLng}`;
}

/**
 * Find all activities that belong to the same route as the target activity.
 * Matches by routeKey + distance similarity (within ±15%).
 */
export function findRouteActivities(
  target: StravaActivity,
  allActivities: StravaActivity[]
): StravaActivity[] {
  const targetKey = getRouteKey(target);
  if (!targetKey) return [];

  return allActivities.filter((a) => {
    if (a.id === target.id) return false;
    const key = getRouteKey(a);
    if (key !== targetKey) return false;
    // Distance similarity filter
    if (target.distance > 0) {
      const diff = Math.abs(a.distance - target.distance) / target.distance;
      if (diff > 0.15) return false;
    }
    return true;
  });
}

/**
 * Find all activities matching a given route key (without distance filter).
 * Used for auto-associating activities to a saved route.
 */
export function findActivitiesByRouteKey(
  routeKey: string,
  allActivities: StravaActivity[]
): StravaActivity[] {
  if (!routeKey) return [];
  return allActivities.filter((a) => {
    return getRouteKey(a) === routeKey;
  });
}

/**
 * Generate a default route name from a list of activities.
 * Uses the most frequently occurring activity name.
 */
export function getDefaultRouteName(activities: StravaActivity[]): string {
  if (activities.length === 0) return '';

  const nameCounts = new Map<string, number>();
  activities.forEach((a) => {
    const name = a.name.trim();
    if (!name) return;
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  });

  let bestName = activities[0].name;
  let bestCount = 0;
  nameCounts.forEach((count, name) => {
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  });

  return bestName;
}

/**
 * Get the best (fastest) pace activity from a list.
 */
export function getBestPaceActivity(activities: StravaActivity[]): StravaActivity | null {
  if (activities.length === 0) return null;
  let best = activities[0];
  let bestPace = Infinity;

  for (const a of activities) {
    if (a.distance > 0 && a.moving_time > 0) {
      const pace = a.moving_time / (a.distance / 1000);
      if (pace < bestPace) {
        bestPace = pace;
        best = a;
      }
    }
  }

  return best;
}
