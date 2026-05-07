import { StravaActivity } from '@/types';

/**
 * Haversine distance between two lat/lng points in kilometers.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate a route cluster key from an activity's start position.
 * Rounds lat/lng to 2 decimal places (~1km precision).
 * Kept for backward compatibility with saved routes.
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
 * Check if two activities are likely the same route.
 * Uses geographic proximity of start/end points + distance similarity.
 *
 * Matching rules:
 * 1. Start points are close (< 1.5km) AND distances are similar (±25%)
 * 2. End points are close (< 1.5km) AND distances are similar (±25%)
 * 3. A's start ≈ B's end AND A's end ≈ B's start AND distances are similar (±25%)
 *    (same route but run in opposite direction)
 */
export function areActivitiesSameRoute(
  a: StravaActivity,
  b: StravaActivity,
  startThresholdKm = 1.5,
  distanceTolerance = 0.25
): boolean {
  if (a.id === b.id) return false;
  if (!a.start_latlng || !b.start_latlng) return false;

  const startDist = haversineDistance(
    a.start_latlng[0],
    a.start_latlng[1],
    b.start_latlng[0],
    b.start_latlng[1]
  );

  // Rule 1: Start points close + distance similar
  if (startThresholdKm > 0 && startDist <= startThresholdKm) {
    if (a.distance > 0) {
      const diff = Math.abs(a.distance - b.distance) / a.distance;
      if (diff <= distanceTolerance) return true;
    }
  }

  // Need end points for rules 2 & 3
  if (!a.end_latlng || !b.end_latlng) return false;

  const endDist = haversineDistance(
    a.end_latlng[0],
    a.end_latlng[1],
    b.end_latlng[0],
    b.end_latlng[1]
  );

  // Rule 2: End points close + distance similar
  if (endDist <= startThresholdKm) {
    if (a.distance > 0) {
      const diff = Math.abs(a.distance - b.distance) / a.distance;
      if (diff <= distanceTolerance) return true;
    }
  }

  // Rule 3: Reverse direction (A's start ≈ B's end, A's end ≈ B's start)
  const aStartToBEnd = haversineDistance(
    a.start_latlng[0],
    a.start_latlng[1],
    b.end_latlng[0],
    b.end_latlng[1]
  );
  const aEndToBStart = haversineDistance(
    a.end_latlng[0],
    a.end_latlng[1],
    b.start_latlng[0],
    b.start_latlng[1]
  );

  if (aStartToBEnd <= startThresholdKm && aEndToBStart <= startThresholdKm) {
    if (a.distance > 0) {
      const diff = Math.abs(a.distance - b.distance) / a.distance;
      if (diff <= distanceTolerance) return true;
    }
  }

  return false;
}

/**
 * Find all activities that belong to the same route as the target activity.
 * Uses flexible geographic matching instead of strict routeKey equality.
 */
export function findRouteActivities(
  target: StravaActivity,
  allActivities: StravaActivity[]
): StravaActivity[] {
  return allActivities.filter((a) => areActivitiesSameRoute(target, a));
}

/**
 * Find all activities matching a given route key (backward compatibility).
 * Falls back to flexible matching if the reference activity is provided.
 */
export function findActivitiesByRouteKey(
  routeKey: string,
  allActivities: StravaActivity[],
  referenceActivity?: StravaActivity
): StravaActivity[] {
  if (!routeKey) return [];

  if (referenceActivity) {
    // Use flexible matching when we have a reference
    return allActivities.filter((a) =>
      areActivitiesSameRoute(referenceActivity, a)
    );
  }

  // Fallback to strict key matching
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
