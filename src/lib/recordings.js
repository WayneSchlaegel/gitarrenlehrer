// Aufnahmen im Browser (IndexedDB), getrennt vom übrigen Speicher, weil Audiodaten groß sind

const DB = 'gitarrenlehrer-audio';
const STORE = 'recordings';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('songId', 'songId');
      s.createIndex('category', 'category');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out?.result ?? out); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const saveRecording = (rec) => tx('readwrite', (s) => s.put(rec));
export const deleteRecording = (id) => tx('readwrite', (s) => s.delete(id));
export async function listRecordings(category) {
  const all = await tx('readonly', (s) => s.index('category').getAll(category));
  return (all || []).sort((a, b) => b.at.localeCompare(a.at));
}
