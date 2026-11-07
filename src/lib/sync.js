// Abgleich Laptop ↔ Handy über den Worker.
// Zusammenführen statt Überschreiben: Je Lied/Video gewinnt die neuere Fassung,
// Löschungen werden als Vermerk mitgeführt, Messungen werden vereinigt.

const REV_KEY = 'gitarrenlehrer.syncRev';
const HASH_KEY = 'gitarrenlehrer.syncHash';

/** Teil des Zustands, der zwischen Geräten abgeglichen wird (keine Geräteeinstellungen, keine Zugangsdaten) */
export function syncable(state) {
  return {
    songs: state.songs || [],
    videos: state.videos || [],
    practice: state.practice || [],
    chats: state.chats || {},
    profile: state.profile || {},
    deleted: state.deleted || [],
    patterns: state.patterns || []
  };
}

const newer = (a, b) => ((a || '') >= (b || '') ? 'a' : 'b');

function mergeById(la = [], lb = [], deleted) {
  const map = new Map();
  for (const x of [...la, ...lb]) {
    const cur = map.get(x.id);
    if (!cur || newer(x.updated || x.added || x.created, cur.updated || cur.added || cur.created) === 'a') map.set(x.id, x);
  }
  const del = new Map(deleted.map((d) => [d.id, d.at]));
  return [...map.values()].filter((x) => !del.has(x.id) || (x.updated || x.added || '') > del.get(x.id));
}

function lastAt(msgs) { return msgs?.length ? msgs[msgs.length - 1].at || '' : ''; }

/** Führt zwei abgleichbare Stände zusammen */
export function mergeSync(a, b) {
  if (!b) return a;
  const delMap = new Map();
  for (const d of [...(a.deleted || []), ...(b.deleted || [])]) {
    const k = d.kind + ':' + d.id;
    if (!delMap.has(k) || d.at > delMap.get(k).at) delMap.set(k, d);
  }
  const deleted = [...delMap.values()].slice(-500);
  const songs = mergeById(a.songs, b.songs, deleted.filter((d) => d.kind === 'song'));
  const videos = mergeById(a.videos, b.videos, deleted.filter((d) => d.kind === 'video'));
  const patterns = mergeById(a.patterns, b.patterns, deleted.filter((d) => d.kind === 'pattern'));
  const pmap = new Map();
  for (const p of [...(a.practice || []), ...(b.practice || [])]) pmap.set(p.at + '|' + p.type, p);
  const practice = [...pmap.values()].sort((x, y) => x.at.localeCompare(y.at)).slice(-300);
  const chats = { ...(b.chats || {}) };
  for (const [k, v] of Object.entries(a.chats || {})) {
    if (!chats[k] || lastAt(v) >= lastAt(chats[k])) chats[k] = v;
  }
  const profile = newer(a.profile?.updated, b.profile?.updated) === 'a' ? a.profile : b.profile;
  return { songs, videos, practice, chats, profile, deleted, patterns };
}

function hash(obj) {
  const s = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h) + ':' + s.length;
}

async function call(settings, method, body) {
  const r = await fetch(settings.apiUrl.replace(/\/+$/, '') + '/sync', {
    method,
    headers: { Authorization: 'Bearer ' + settings.apiToken, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 409) return { conflict: true, ...data };
  if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
  return data;
}

/**
 * Ein Abgleich: holen, zusammenführen, falls nötig hochladen.
 * Gibt den zusammengeführten Stand zurück (oder null, wenn sich lokal nichts ändern muss).
 */
/** Unveränderte Beispiellieder (beim ersten Abgleich eines neuen Geräts weglassen) */
export const isUntouchedDemo = (s) => s.demo && s.updated === s.created && !s.practiceCount;

export async function syncOnce(settings, local) {
  const firstSync = !localStorage.getItem(REV_KEY);
  let remote = await call(settings, 'GET');
  if (firstSync && remote.data?.songs?.length) local = { ...local, songs: local.songs.filter((s) => !isUntouchedDemo(s)) };
  let merged = mergeSync(local, remote.data);
  for (let attempt = 0; attempt < 3; attempt++) {
    const h = hash(merged);
    const remoteSame = remote.data && hash(mergeSync(remote.data, null)) === h;
    if (!remoteSame) {
      const res = await call(settings, 'PUT', { baseRev: remote.rev || 0, data: merged });
      if (res.conflict) { remote = res; merged = mergeSync(merged, res.data); continue; }
      remote = { rev: res.rev, data: merged };
    }
    localStorage.setItem(REV_KEY, String(remote.rev || 0));
    localStorage.setItem(HASH_KEY, h);
    const localChanged = hash(local) !== h;
    return { merged: localChanged ? merged : null, firstSync, rev: remote.rev, at: new Date().toISOString() };
  }
  throw new Error('Abgleich-Konflikt, bitte erneut versuchen.');
}

/** Hat sich lokal seit dem letzten Abgleich etwas geändert? */
export function changedSinceSync(local) {
  return localStorage.getItem(HASH_KEY) !== hash(local);
}
