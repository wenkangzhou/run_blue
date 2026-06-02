import type { PersistStorage, StorageValue } from 'zustand/middleware';

interface IndexedDBStorageOptions {
  dbName: string;
  storeName: string;
  version?: number;
  migrateFromLocalStorage?: boolean;
}

type QueuedOperation = () => void;

function isBrowser() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function openDatabase(dbName: string, storeName: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`IndexedDB "${dbName}" upgrade is blocked`));
  });
}

function runWhenDatabaseReady<T>(
  dbName: string,
  storeName: string,
  version: number,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  if (!isBrowser()) {
    return Promise.resolve(null as T);
  }

  return openDatabase(dbName, storeName, version).then((db) => {
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      let result: T;
      let request: IDBRequest<T>;

      try {
        request = operation(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }

      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
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
  });
}

function parseLocalStorageValue<S>(name: string): StorageValue<S> | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    return JSON.parse(raw) as StorageValue<S>;
  } catch {
    return null;
  }
}

export function createIndexedDBStorage<S>({
  dbName,
  storeName,
  version = 1,
  migrateFromLocalStorage = false,
}: IndexedDBStorageOptions): PersistStorage<S, Promise<void>> {
  let pendingMigration: Promise<void> | null = null;
  const queuedOperations: QueuedOperation[] = [];

  const enqueueUntilMigrated = (operation: QueuedOperation) => {
    if (!pendingMigration) {
      operation();
      return;
    }
    queuedOperations.push(operation);
  };

  const flushQueuedOperations = () => {
    const operations = queuedOperations.splice(0);
    operations.forEach((operation) => operation());
  };

  return {
    async getItem(name) {
      if (!isBrowser()) return null;

      const indexedValue = await runWhenDatabaseReady<StorageValue<S> | undefined>(
        dbName,
        storeName,
        version,
        (store) => store.get(name)
      );

      if (indexedValue) return indexedValue;
      if (!migrateFromLocalStorage) return null;

      const legacyValue = parseLocalStorageValue<S>(name);
      if (!legacyValue) return null;

      pendingMigration = runWhenDatabaseReady<IDBValidKey>(
        dbName,
        storeName,
        version,
        (store) => store.put(legacyValue, name)
      )
        .then(() => {
          try {
            localStorage.removeItem(name);
          } catch {
            // Keep hydration resilient if storage removal fails.
          }
        })
        .finally(() => {
          pendingMigration = null;
          flushQueuedOperations();
        });

      await pendingMigration;
      return legacyValue;
    },

    setItem(name, value) {
      return new Promise<void>((resolve, reject) => {
        enqueueUntilMigrated(() => {
          runWhenDatabaseReady<IDBValidKey>(dbName, storeName, version, (store) => store.put(value, name))
            .then(() => resolve())
            .catch(reject);
        });
      });
    },

    removeItem(name) {
      return new Promise<void>((resolve, reject) => {
        enqueueUntilMigrated(() => {
          runWhenDatabaseReady<undefined>(dbName, storeName, version, (store) => store.delete(name))
            .then(() => {
              if (migrateFromLocalStorage && typeof window !== 'undefined') {
                try {
                  localStorage.removeItem(name);
                } catch {
                  // Ignore localStorage cleanup failures.
                }
              }
            })
            .then(resolve)
            .catch(reject);
        });
      });
    },
  };
}
