/** A single SQLite snapshot stored atomically in IndexedDB. */
const DATABASE = 'ticktick-arabic-web';
const STORE = 'snapshots';

async function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab'));
  });
}

export async function loadSnapshot(): Promise<Uint8Array | undefined> {
  const database = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get('database');
      request.onsuccess = () => resolve(request.result as Uint8Array | undefined);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { database.close(); }
}

export async function saveSnapshot(bytes: Uint8Array): Promise<void> {
  const database = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, 'database');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { database.close(); }
}
