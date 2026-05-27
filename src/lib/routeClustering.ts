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
 * Rounds lat/lng to 3 decimal places (~100m precision).
 */
export function getRouteKey(activity: StravaActivity): string {
  if (!activity.start_latlng || activity.start_latlng.length < 2) {
    return '';
  }
  const [lat, lng] = activity.start_latlng;
  const roundedLat = Math.round(lat * 1000) / 1000;
  const roundedLng = Math.round(lng * 1000) / 1000;
  return `${roundedLat},${roundedLng}`;
}

/**
 * Check if two activities are likely the same route.
 * Uses geographic proximity of start/end points + distance similarity.
 *
 * Matching rules:
 * 1. Start points are close (< 500m) AND distances are similar (±15%)
 * 2. End points are close (< 500m) AND distances are similar (±15%)
 * 3. A's start ≈ B's end AND A's end ≈ B's start AND distances are similar (±15%)
 *    (same route but run in opposite direction)
 * 4. Fallback: if no end_latlng available, use start + midpoint only
 */
/**
 * Extract N equally-spaced sample points from an activity's polyline.
 * Returns null if polyline is unavailable or too short.
 */
function getSamplePoints(activity: StravaActivity, count = 10): [number, number][] | null {
  const coords = activity.map?.summary_polyline
    ? decodePolyline(activity.map.summary_polyline)
    : [];
  if (coords.length < 2) return null;

  const result: [number, number][] = [];
  const step = (coords.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) {
    const idx = Math.round(i * step);
    result.push(coords[Math.min(idx, coords.length - 1)]);
  }
  return result;
}

/**
 * Compute the average radius of a path (average distance from geometric center).
 * A loop around a track has a small radius; an out-and-back through neighborhoods
 * has a large radius. Used to distinguish route shapes.
 */
function getPathRadius(activity: StravaActivity): number | null {
  const coords = activity.map?.summary_polyline
    ? decodePolyline(activity.map.summary_polyline)
    : [];
  if (coords.length < 3) return null;

  const centerLat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const centerLng = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const avgRadius =
    coords.reduce((s, c) => s + haversineDistance(c[0], c[1], centerLat, centerLng), 0) /
    coords.length;
  return avgRadius;
}

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export function areActivitiesSameRoute(
  a: StravaActivity,
  b: StravaActivity,
  startThresholdKm = 0.5,
  distanceTolerance = 0.15
): boolean {
  if (a.id === b.id) return false;
  if (!a.start_latlng || !b.start_latlng) return false;

  const startDist = haversineDistance(
    a.start_latlng[0],
    a.start_latlng[1],
    b.start_latlng[0],
    b.start_latlng[1]
  );

  // Distance check first (cheapest)
  if (a.distance > 0 && b.distance > 0) {
    const distDiff = Math.abs(a.distance - b.distance) / a.distance;
    if (distDiff > distanceTolerance) return false;
  }

  // Elevation check
  const aElev = a.total_elevation_gain || 0;
  const bElev = b.total_elevation_gain || 0;
  if (aElev > 0) {
    const elevDiff = Math.abs(aElev - bElev) / aElev;
    if (elevDiff > 0.25) return false; // 25% elevation tolerance
  }

  // Path shape check: average radius should be similar.
  // This prevents matching a track loop (small radius) with an L-shaped street run (large radius)
  // even if they start/end at the same spot.
  const aRadius = getPathRadius(a);
  const bRadius = getPathRadius(b);
  if (aRadius && bRadius && Math.max(aRadius, bRadius) > 0) {
    const radiusDiff = Math.abs(aRadius - bRadius) / Math.max(aRadius, bRadius);
    if (radiusDiff > 0.30) return false; // 30% radius tolerance
  }

  // Fallback: no end points available — rely on start + sample points
  if (!a.end_latlng || !b.end_latlng) {
    if (startDist <= startThresholdKm) {
      const aPts = getSamplePoints(a, 10);
      const bPts = getSamplePoints(b, 10);
      if (aPts && bPts) {
        const distances = aPts.map((pt, i) =>
          haversineDistance(pt[0], pt[1], bPts![i][0], bPts![i][1])
        );
        const maxDist = Math.max(...distances);
        const avgDist = distances.reduce((s, d) => s + d, 0) / distances.length;
        const closeCount = distances.filter((d) => d <= startThresholdKm).length;
        if (
          maxDist <= startThresholdKm * 2 &&
          avgDist <= startThresholdKm * 0.6 &&
          closeCount >= distances.length * 0.9
        ) {
          return true;
        }
      } else {
        // One or both polylines missing: reject unless start is extremely close
        return startDist <= startThresholdKm * 0.3;
      }
    }
    return false;
  }

  const endDist = haversineDistance(
    a.end_latlng[0],
    a.end_latlng[1],
    b.end_latlng[0],
    b.end_latlng[1]
  );

  // Rule 1: Same direction — start close AND end close
  if (startDist <= startThresholdKm && endDist <= startThresholdKm) {
    // Sample points check (10 key points along the route)
    const aPts = getSamplePoints(a, 10);
    const bPts = getSamplePoints(b, 10);
    if (aPts && bPts) {
      const distances = aPts.map((pt, i) =>
        haversineDistance(pt[0], pt[1], bPts![i][0], bPts![i][1])
      );
      const maxDist = Math.max(...distances);
      const avgDist = distances.reduce((s, d) => s + d, 0) / distances.length;
      const closeCount = distances.filter((d) => d <= startThresholdKm).length;
      // Strict majority pass: at least 90% points close, tight average & max bounds
      if (
        maxDist <= startThresholdKm * 2 &&
        avgDist <= startThresholdKm * 0.6 &&
        closeCount >= distances.length * 0.9
      ) {
        return true;
      }
    } else {
      // Missing polyline on either side: reject unless start is extremely close
      return startDist <= startThresholdKm * 0.3;
    }
  }

  // Rule 2: Reverse direction
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
    // Reverse sample points check (A vs reversed B)
    const aPts = getSamplePoints(a, 10);
    const bPts = getSamplePoints(b, 10);
    if (aPts && bPts) {
      const distances = aPts.map((pt, i) =>
        haversineDistance(pt[0], pt[1], bPts![9 - i][0], bPts![9 - i][1])
      );
      const maxDist = Math.max(...distances);
      const avgDist = distances.reduce((s, d) => s + d, 0) / distances.length;
      const closeCount = distances.filter((d) => d <= startThresholdKm).length;
      if (
        maxDist <= startThresholdKm * 2 &&
        avgDist <= startThresholdKm * 0.6 &&
        closeCount >= distances.length * 0.9
      ) {
        return true;
      }
    } else {
      return startDist <= startThresholdKm * 0.3;
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
