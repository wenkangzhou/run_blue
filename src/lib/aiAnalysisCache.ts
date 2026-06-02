const AI_ANALYSIS_CACHE_DB = 'run_blue_ai_analysis_cache';
const AI_ANALYSIS_CACHE_STORE = 'analyses';
const AI_ANALYSIS_CACHE_DB_VERSION = 1;

function isBrowser() {
  return typeof window !== 'undefined';
}

function hasIndexedDb() {
  return isBrowser() && typeof window.indexedDB !== 'undefined';
}

function readLegacyValue<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLegacyValue<T>(key: string, value: T) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Analysis still works when the cache cannot be written.
  }
}

function removeLegacyValue(key: string) {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore cleanup failures.
  }
}

function openAIAnalysisCacheDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(AI_ANALYSIS_CACHE_DB, AI_ANALYSIS_CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AI_ANALYSIS_CACHE_STORE)) {
        db.createObjectStore(AI_ANALYSIS_CACHE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`IndexedDB "${AI_ANALYSIS_CACHE_DB}" upgrade is blocked`));
  });
}

async function runAIAnalysisCacheOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const db = await openAIAnalysisCacheDatabase();
  if (!db) return null;

  return new Promise<T | null>((resolve, reject) => {
    const transaction = db.transaction(AI_ANALYSIS_CACHE_STORE, mode);
    const store = transaction.objectStore(AI_ANALYSIS_CACHE_STORE);
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

async function getIndexedValue<T>(key: string): Promise<T | null> {
  return runAIAnalysisCacheOperation<T>('readonly', (store) => store.get(key));
}

async function writeIndexedValue<T>(key: string, value: T): Promise<void> {
  await runAIAnalysisCacheOperation<IDBValidKey>('readwrite', (store) => store.put(value, key));
}

async function removeIndexedValue(key: string): Promise<void> {
  await runAIAnalysisCacheOperation<undefined>('readwrite', (store) => store.delete(key));
}

export async function getCachedAIAnalysis<T>(key: string): Promise<T | null> {
  if (!isBrowser()) return null;

  try {
    const indexedValue = await getIndexedValue<T>(key);
    if (indexedValue) return indexedValue;
  } catch {
    // Fall back to legacy localStorage below.
  }

  const legacyValue = readLegacyValue<T>(key);
  if (!legacyValue) return null;

  if (hasIndexedDb()) {
    try {
      await writeIndexedValue(key, legacyValue);
      removeLegacyValue(key);
    } catch {
      // Keep localStorage value if IndexedDB migration fails.
    }
  }

  return legacyValue;
}

export async function setCachedAIAnalysis<T>(key: string, value: T): Promise<void> {
  if (!isBrowser()) return;

  if (hasIndexedDb()) {
    try {
      await writeIndexedValue(key, value);
      removeLegacyValue(key);
      return;
    } catch {
      // Fall through to legacy localStorage.
    }
  }

  writeLegacyValue(key, value);
}

export async function clearCachedAIAnalysis(key: string): Promise<void> {
  if (!isBrowser()) return;

  try {
    await removeIndexedValue(key);
  } catch {
    // Ignore IndexedDB cleanup failures.
  }

  removeLegacyValue(key);
}
