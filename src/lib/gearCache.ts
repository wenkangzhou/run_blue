/**
 * Lightweight cache for gear statistics.
 * Stores only the minimal fields needed for shoe stats,
 * allowing thousands of activities without localStorage quota issues.
 */
import { StravaActivity } from '@/types';

const GEAR_CACHE_KEY = 'run_blue_gear_activities_v1';
const GEAR_CACHE_VERSION = 1;
const GEAR_CACHE_DB = 'run_blue_gear_cache';
const GEAR_CACHE_STORE = 'gear_cache';
const GEAR_CACHE_DB_VERSION = 1;

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

function isBrowser() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function getEmptyGearCache(): GearCacheData {
  return {
    version: GEAR_CACHE_VERSION,
    activities: [],
    loadedPages: 0,
    hasMore: true,
    lastFetchedAt: 0,
  };
}

function normalizeGearCache(data: Partial<GearCacheData> | null | undefined): GearCacheData | null {
  if (!data || data.version !== GEAR_CACHE_VERSION) return null;
  return {
    ...getEmptyGearCache(),
    ...data,
    activities: Array.isArray(data.activities) ? data.activities : [],
  };
}

function readLegacyGearCache(): GearCacheData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GEAR_CACHE_KEY);
    if (!raw) return null;
    return normalizeGearCache(JSON.parse(raw) as GearCacheData);
  } catch {
    return null;
  }
}

function removeLegacyGearCache() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GEAR_CACHE_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}

function openGearCacheDatabase(): Promise<IDBDatabase | null> {
  if (!isBrowser()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GEAR_CACHE_DB, GEAR_CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GEAR_CACHE_STORE)) {
        db.createObjectStore(GEAR_CACHE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`IndexedDB "${GEAR_CACHE_DB}" upgrade is blocked`));
  });
}

async function runGearCacheOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const db = await openGearCacheDatabase();
  if (!db) return null;

  return new Promise<T | null>((resolve, reject) => {
    const transaction = db.transaction(GEAR_CACHE_STORE, mode);
    const store = transaction.objectStore(GEAR_CACHE_STORE);
    let result: T | null = null;

    try {
      const request = operation(store);
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getIndexedGearCache(): Promise<GearCacheData | null> {
  const indexedValue = await runGearCacheOperation<GearCacheData>('readonly', (store) => store.get(GEAR_CACHE_KEY));
  return normalizeGearCache(indexedValue);
}

async function writeIndexedGearCache(data: GearCacheData): Promise<void> {
  await runGearCacheOperation<IDBValidKey>('readwrite', (store) => store.put(data, GEAR_CACHE_KEY));
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

export async function getGearCache(): Promise<GearCacheData | null> {
  if (!isBrowser()) return null;
  try {
    const normalized = await getIndexedGearCache();
    if (normalized) return normalized;

    const legacy = readLegacyGearCache();
    if (!legacy) return null;

    await writeIndexedGearCache(legacy);
    removeLegacyGearCache();
    return legacy;
  } catch {
    return readLegacyGearCache();
  }
}

export async function setGearCache(data: Partial<GearCacheData>): Promise<void> {
  if (!isBrowser()) return;
  try {
    const existing = await getIndexedGearCache() ?? readLegacyGearCache();
    const merged: GearCacheData = {
      ...getEmptyGearCache(),
      ...existing,
      ...data,
      version: GEAR_CACHE_VERSION,
    };
    await writeIndexedGearCache(merged);
    removeLegacyGearCache();
  } catch (error) {
    console.warn('[GearCache] Failed to persist IndexedDB cache:', error);
  }
}

export async function mergeIntoGearCache(activities: StravaActivity[]): Promise<void> {
  const existing = await getGearCache();
  const map = new Map<number, LightGearActivity>();
  if (existing) {
    for (const a of existing.activities) {
      map.set(a.id, a);
    }
  }
  for (const a of activities) {
    map.set(a.id, toLightGearActivity(a));
  }
  await setGearCache({ activities: Array.from(map.values()) });
}

export async function getGearCacheActivities(): Promise<LightGearActivity[]> {
  return (await getGearCache())?.activities || [];
}

export async function clearGearCache(): Promise<void> {
  if (!isBrowser()) return;
  try {
    await runGearCacheOperation<undefined>('readwrite', (store) => store.delete(GEAR_CACHE_KEY));
  } catch {
    // Ignore cache clear failures.
  }
  removeLegacyGearCache();
}
