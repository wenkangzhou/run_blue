function createStorageArea(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    api: {
      getItem(key) {
        return data.has(key) ? data.get(key) : null;
      },
      setItem(key, value) {
        data.set(key, String(value));
      },
      removeItem(key) {
        data.delete(key);
      },
    },
  };
}

function createRequest(result, transaction = null) {
  const request = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
  };

  setTimeout(() => {
    request.result = result;
    request.onsuccess?.();
    transaction?.oncomplete?.();
  }, 0);

  return request;
}

export function createFakeIndexedDB() {
  const stores = new Map();

  return {
    stores,
    api: {
      open() {
        const db = {
          objectStoreNames: {
            contains(name) {
              return stores.has(name);
            },
          },
          createObjectStore(name) {
            if (!stores.has(name)) stores.set(name, new Map());
          },
          transaction(storeName) {
            const transaction = {
              error: null,
              oncomplete: null,
              onabort: null,
              onerror: null,
              objectStore() {
                const store = stores.get(storeName);
                return {
                  get(key) {
                    return createRequest(store.get(key), transaction);
                  },
                  put(value, key) {
                    store.set(key, value);
                    return createRequest(key, transaction);
                  },
                  delete(key) {
                    store.delete(key);
                    return createRequest(undefined, transaction);
                  },
                };
              },
            };
            return transaction;
          },
          close() {},
        };

        const request = {
          result: db,
          error: null,
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
          onblocked: null,
        };

        setTimeout(() => {
          request.onupgradeneeded?.();
          request.onsuccess?.();
        }, 0);

        return request;
      },
    },
  };
}

export function installBrowserStorage({ local = {}, indexedDB, exposeGlobalIndexedDB = false } = {}) {
  const localStorage = createStorageArea(local);
  globalThis.localStorage = localStorage.api;
  globalThis.window = indexedDB ? { indexedDB } : {};
  if (indexedDB && exposeGlobalIndexedDB) {
    globalThis.indexedDB = indexedDB;
  }
  return localStorage;
}

export function cleanupBrowserStorage() {
  delete globalThis.indexedDB;
  delete globalThis.localStorage;
  delete globalThis.window;
}
