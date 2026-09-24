// Minimal promise wrapper around IndexedDB.

const DB_NAME = 'hafiz';
const DB_VERSION = 1;
export const STORES = ['kv', 'items', 'blobs'];

let dbPromise;

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
}

async function store(name, mode) {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(storeName, key) {
  return req((await store(storeName, 'readonly')).get(key));
}

export async function set(storeName, key, value) {
  return req((await store(storeName, 'readwrite')).put(value, key));
}

export async function del(storeName, key) {
  return req((await store(storeName, 'readwrite')).delete(key));
}

export async function all(storeName) {
  const s = await store(storeName, 'readonly');
  const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
  return keys.map((k, i) => [k, values[i]]);
}

export async function clear(storeName) {
  return req((await store(storeName, 'readwrite')).clear());
}

export const kv = {
  get: (k) => get('kv', k),
  set: (k, v) => set('kv', k, v),
  del: (k) => del('kv', k),
};

// Share-target inbox written by the service worker (see sw.js).
export function takeSharedItems() {
  return new Promise((resolve) => {
    const r = indexedDB.open('hafiz-inbox', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('shares', { autoIncrement: true });
    r.onerror = () => resolve([]);
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction('shares', 'readwrite');
      const s = tx.objectStore('shares');
      const g = s.getAll();
      g.onsuccess = () => {
        s.clear();
        tx.oncomplete = () => { db.close(); resolve(g.result || []); };
      };
      g.onerror = () => { db.close(); resolve([]); };
    };
  });
}
