import type { CachedGearDetail, LightGearActivity } from '@/lib/gearCache';
import type { StravaActivity } from '@/types';

export type GearSortMode = 'distance' | 'runs' | 'pace' | 'name';

export interface GearStats {
  gearId: string;
  name: string;
  brandName?: string;
  modelName?: string;
  description?: string;
  stravaDistance: number;
  activityDistance: number;
  displayDistance: number;
  activityTime: number;
  activityCount: number;
  avgSpeed: number;
  retired: boolean;
}

type GearActivity = Pick<
  StravaActivity | LightGearActivity,
  'id' | 'distance' | 'moving_time' | 'type' | 'sport_type' | 'gear_id' | 'gear' | 'average_speed'
>;

interface GearAccumulator {
  distance: number;
  time: number;
  count: number;
  speedSum: number;
  speedCount: number;
  name?: string;
}

export const SHOE_MILEAGE_REFERENCE_METERS = 800_000;
export const SHOE_MILEAGE_WATCH_METERS = 650_000;

export function mergeGearActivities(
  cachedActivities: LightGearActivity[],
  storeActivities: StravaActivity[]
): GearActivity[] {
  const merged = new Map<number, GearActivity>();
  cachedActivities.forEach((activity) => merged.set(activity.id, activity));
  storeActivities.forEach((activity) => {
    const existing = merged.get(activity.id);
    if (existing?.gear_id && !activity.gear_id && !activity.gear) return;
    merged.set(activity.id, activity);
  });
  return Array.from(merged.values());
}

export function buildGearStats(
  activities: GearActivity[],
  gearDetails: CachedGearDetail[]
): GearStats[] {
  const accumulators = new Map<string, GearAccumulator>();

  activities.forEach((activity) => {
    if (activity.sport_type !== 'Run' && activity.type !== 'Run') return;
    const gearId = activity.gear_id || activity.gear?.id;
    if (!gearId) return;

    const current = accumulators.get(gearId) || {
      distance: 0,
      time: 0,
      count: 0,
      speedSum: 0,
      speedCount: 0,
    };
    current.distance += activity.distance;
    current.time += activity.moving_time;
    current.count += 1;
    current.name ||= activity.gear?.name;
    if (activity.average_speed > 0) {
      current.speedSum += activity.average_speed;
      current.speedCount += 1;
    }
    accumulators.set(gearId, current);
  });

  const detailsById = new Map(gearDetails.map((gear) => [gear.id, gear]));

  return Array.from(accumulators.entries()).map(([gearId, stats]) => {
    const detail = detailsById.get(gearId);
    const stravaDistance = detail?.distance || 0;
    return {
      gearId,
      name: detail?.name || stats.name || gearId,
      brandName: detail?.brand_name,
      modelName: detail?.model_name,
      description: detail?.description,
      stravaDistance,
      activityDistance: stats.distance,
      displayDistance: stravaDistance > 0 ? stravaDistance : stats.distance,
      activityTime: stats.time,
      activityCount: stats.count,
      avgSpeed: stats.speedCount > 0 ? stats.speedSum / stats.speedCount : 0,
      retired: detail?.retired || false,
    };
  });
}

export function sortGearStats(gearStats: GearStats[], mode: GearSortMode): GearStats[] {
  return [...gearStats].sort((left, right) => {
    if (mode === 'runs') return right.activityCount - left.activityCount;
    if (mode === 'pace') {
      if (left.avgSpeed <= 0) return 1;
      if (right.avgSpeed <= 0) return -1;
      return right.avgSpeed - left.avgSpeed;
    }
    if (mode === 'name') return left.name.localeCompare(right.name);
    return right.displayDistance - left.displayDistance;
  });
}

export function getShoeMileageState(distance: number): 'fresh' | 'watch' | 'replace' {
  if (distance >= SHOE_MILEAGE_REFERENCE_METERS) return 'replace';
  if (distance >= SHOE_MILEAGE_WATCH_METERS) return 'watch';
  return 'fresh';
}
