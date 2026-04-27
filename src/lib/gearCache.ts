/**
 * Lightweight cache for gear statistics.
 * Stores only the minimal fields needed for shoe stats,
 * allowing thousands of activities without localStorage quota issues.
 */
import { StravaActivity } from '@/types';

const GEAR_CACHE_KEY = 'run_blue_gear_activities_v1';
const GEAR_CACHE_VERSION = 1;

export interface LightGearActivity {
  id: number;
  distance: number;
  moving_time: number;
  type: string;
  sport_type: string;
  gear_id: string | null;
  gear?: { id: string; name: string; distance: number };
  average_speed: number;
}

interface GearCacheData {
  version: number;
  activities: LightGearActivity[];
  loadedPages: number;
  hasMore: boolean;
  lastFetchedAt: number;
}

function toLightGearActivity(a: StravaActivity): LightGearActivity {
  return {
    id: a.id,
    distance: a.distance,
    moving_time: a.moving_time,
    type: a.type,
    sport_type: a.sport_type,
    gear_id: a.gear_id || null,
    gear: a.gear ? { id: a.gear.id, name: a.gear.name, distance: a.gear.distance } : undefined,
    average_speed: a.average_speed,
  };
}

export function getGearCache(): GearCacheData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GEAR_CACHE_KEY);
    if (!raw) return null;
    const data: GearCacheData = JSON.parse(raw);
    if (data.version !== GEAR_CACHE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function setGearCache(data: Partial<GearCacheData>) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getGearCache();
    const merged: GearCacheData = {
      version: GEAR_CACHE_VERSION,
      activities: existing?.activities || [],
      loadedPages: existing?.loadedPages || 0,
      hasMore: existing?.hasMore ?? true,
      lastFetchedAt: existing?.lastFetchedAt || 0,
      ...data,
    };
    localStorage.setItem(GEAR_CACHE_KEY, JSON.stringify(merged));
  } catch (e) {
    // Quota exceeded — try to halve and retry
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      const existing = getGearCache();
      if (existing && existing.activities.length > 100) {
        const halved = existing.activities.slice(0, Math.floor(existing.activities.length / 2));
        try {
          localStorage.setItem(GEAR_CACHE_KEY, JSON.stringify({
            version: GEAR_CACHE_VERSION,
            activities: halved,
            loadedPages: existing.loadedPages,
            hasMore: true,
            lastFetchedAt: existing.lastFetchedAt,
          }));
          console.warn(`[GearCache] Quota exceeded. Reduced from ${existing.activities.length} to ${halved.length}.`);
        } catch {
          console.error('[GearCache] Failed to save even after halving.');
        }
      }
    }
  }
}

export function mergeIntoGearCache(activities: StravaActivity[]) {
  const existing = getGearCache();
  const map = new Map<number, LightGearActivity>();
  if (existing) {
    for (const a of existing.activities) {
      map.set(a.id, a);
    }
  }
  for (const a of activities) {
    map.set(a.id, toLightGearActivity(a));
  }
  setGearCache({ activities: Array.from(map.values()) });
}

export function getGearCacheActivities(): LightGearActivity[] {
  return getGearCache()?.activities || [];
}

export function clearGearCache() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GEAR_CACHE_KEY);
}
