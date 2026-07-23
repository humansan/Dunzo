// Persistence for the stopwatch's custom background image.
//
// The image lives in IndexedDB as a Blob, NOT in localStorage as a base64 data
// URI. localStorage caps an origin at ~5MB and base64 inflates a file by ~33%, so
// any ordinary photo blew the quota: `setItem` threw inside the FileReader
// callback, the picked image survived in React state but was never persisted, and
// the previous background came back the moment the component remounted.
// IndexedDB stores the Blob as-is under a much larger quota.

const DB_NAME = 'dun-stopwatch';
const DB_VERSION = 1;
const STORE = 'bg';
const KEY = 'image';

// The pre-IndexedDB localStorage key, migrated (once) then dropped by migrateLegacyBg.
const LEGACY_KEY = 'dun-sw-bg-image';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// One request in its own transaction. Rejects on error so callers can try/catch -
// a failed write must surface, never be swallowed the way the old one was.
async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export function loadBgImage(): Promise<Blob | undefined> {
  return run<Blob | undefined>('readonly', (s) => s.get(KEY));
}

export function saveBgImage(blob: Blob): Promise<unknown> {
  return run('readwrite', (s) => s.put(blob, KEY));
}

// Move a background saved by the old localStorage build into IndexedDB, then free
// the localStorage entry (it was consuming most of the origin's 5MB). A no-op once
// it has run, and non-fatal if it fails - the caller just falls back to the default.
export async function migrateLegacyBg(): Promise<void> {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return;
  try {
    // A data: URI is fetchable, which is the cheapest base64 → Blob decode.
    await saveBgImage(await (await fetch(legacy)).blob());
  } finally {
    localStorage.removeItem(LEGACY_KEY);
  }
}
