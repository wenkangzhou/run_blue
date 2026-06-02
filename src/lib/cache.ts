import { StravaActivity, ActivityStream } from '@/types';
import { getActivityTimestamp } from '@/lib/dates';

const CACHE_PREFIX = 'run_blue_cache_';
const DETAIL_CACHE_DB = 'run_blue_activity_detail_cache';
const DETAIL_CACHE_STORE = 'activity_details';
const DETAIL_CACHE_DB_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_ACTIVITY_WINDOW_DAYS = 8;
const RECENT_ACTIVITY_REFRESH_MS = 1000 * 60 * 60; // 1 hour

export interface CachedActivity {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
  timestamp: number;
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function hasIndexedDb() {
  return isBrowser() && typeof window.indexedDB !== 'undefined';
}

function getCacheKey(activityId: number) {
  return `${CACHE_PREFIX}activity_${activityId}`;
}

function normalizeCachedActivity(data: Partial<CachedActivity> | null | undefined): CachedActivity | null {
  if (!data?.activity || typeof data.timestamp !== 'number') return null;
  return {
    activity: data.activity as StravaActivity,
    streams: data.streams ?? null,
    timestamp: data.timestamp,
  };
}

function readLegacyCachedActivity(activityId: number): CachedActivity | null {
  if (!isBrowser()) return null;

  try {
    const key = getCacheKey(activityId);
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    return normalizeCachedActivity(JSON.parse(cached) as CachedActivity);
  } catch {
    return null;
  }
}

function writeLegacyCachedActivity(activityId: number, data: CachedActivity) {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(getCacheKey(activityId), JSON.stringify(data));
  } catch {
    // Storage might be full; IndexedDB remains the primary cache.
  }
}

function removeLegacyCachedActivity(activityId: number) {
  if (!isBrowser()) return;

  try {
    localStorage.removeItem(getCacheKey(activityId));
  } catch {
    // Ignore cleanup failures.
  }
}

function openDetailCacheDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DETAIL_CACHE_DB, DETAIL_CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DETAIL_CACHE_STORE)) {
        db.createObjectStore(DETAIL_CACHE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`IndexedDB "${DETAIL_CACHE_DB}" upgrade is blocked`));
  });
}

async function runDetailCacheOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const db = await openDetailCacheDatabase();
  if (!db) return null;

  return new Promise<T | null>((resolve, reject) => {
    const transaction = db.transaction(DETAIL_CACHE_STORE, mode);
    const store = transaction.objectStore(DETAIL_CACHE_STORE);
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

async function getIndexedCachedActivity(activityId: number): Promise<CachedActivity | null> {
  const data = await runDetailCacheOperation<Partial<CachedActivity>>(
    'readonly',
    (store) => store.get(getCacheKey(activityId))
  );
  return normalizeCachedActivity(data);
}

async function writeIndexedCachedActivity(activityId: number, data: CachedActivity): Promise<void> {
  await runDetailCacheOperation<IDBValidKey>(
    'readwrite',
    (store) => store.put(data, getCacheKey(activityId))
  );
}

async function deleteIndexedCachedActivity(activityId: number): Promise<void> {
  await runDetailCacheOperation<undefined>(
    'readwrite',
    (store) => store.delete(getCacheKey(activityId))
  );
}

export function shouldRefreshCachedActivity(cached: CachedActivity): boolean {
  const now = Date.now();
  const activityTimestamp = getActivityTimestamp(cached.activity);
  const cacheAge = now - cached.timestamp;
  if (!activityTimestamp) return cacheAge > RECENT_ACTIVITY_REFRESH_MS;

  const activityAge = now - activityTimestamp;
  if (activityAge > RECENT_ACTIVITY_WINDOW_DAYS * DAY_MS) return false;
  return cacheAge > RECENT_ACTIVITY_REFRESH_MS;
}

export async function getCachedActivity(activityId: number): Promise<CachedActivity | null> {
  if (!isBrowser()) return null;

  try {
    const indexedCache = await getIndexedCachedActivity(activityId);
    if (indexedCache) return indexedCache;
  } catch {
    // Fall back to legacy localStorage below.
  }

  const legacyCache = readLegacyCachedActivity(activityId);
  if (!legacyCache) return null;

  if (hasIndexedDb()) {
    try {
      await writeIndexedCachedActivity(activityId, legacyCache);
      removeLegacyCachedActivity(activityId);
    } catch {
      // Keep the legacy cache if IndexedDB is unavailable.
    }
  }

  return legacyCache;
}

export async function setCachedActivity(
  activityId: number,
  activity: StravaActivity,
  streams: Record<string, ActivityStream> | null
): Promise<void> {
  if (!isBrowser()) return;

  const data: CachedActivity = {
    activity,
    streams,
    timestamp: Date.now(),
  };

  if (hasIndexedDb()) {
    try {
      await writeIndexedCachedActivity(activityId, data);
      removeLegacyCachedActivity(activityId);
      return;
    } catch {
      // Fall through to legacy storage.
    }
  }

  writeLegacyCachedActivity(activityId, data);
}

export async function clearActivityCache(activityId: number): Promise<void> {
  if (!isBrowser()) return;

  try {
    await deleteIndexedCachedActivity(activityId);
  } catch {
    // Ignore IndexedDB cleanup failures.
  }

  removeLegacyCachedActivity(activityId);
}
