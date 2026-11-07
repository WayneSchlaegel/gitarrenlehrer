// YouTube: Video-ID aus Links lesen, Suche und Titel über den Worker, eingebetteter Player

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Liest die Video-ID aus allen üblichen YouTube-Adressen (oder einer nackten ID) */
export function parseVideoId(input) {
  const s = String(input || '').trim();
  if (ID_RE.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1, 12);
    return ID_RE.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && ID_RE.test(v)) return v;
    const m = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
    if (m) return m[1];
  }
  return null;
}

/** Startzeit aus Link (t=90 oder t=1m30s) in Sekunden */
export function parseStart(input) {
  try {
    const t = new URL(String(input).trim()).searchParams.get('t');
    if (!t) return 0;
    if (/^\d+$/.test(t)) return Number(t);
    const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(t);
    return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  } catch { return 0; }
}

export const thumbUrl = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

async function workerGet(settings, path) {
  const r = await fetch(settings.apiUrl.replace(/\/+$/, '') + path, { headers: { Authorization: 'Bearer ' + settings.apiToken } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
  return data;
}

/** Titel und Kanal zu einem Video (ohne YouTube-API-Key, über den Worker) */
export async function videoInfo(settings, id) {
  try {
    const d = await workerGet(settings, '/oembed?id=' + encodeURIComponent(id));
    return { title: d.title || '', channel: d.author_name || '' };
  } catch {
    return { title: '', channel: '' };
  }
}

/** Suche über den Worker (braucht YOUTUBE_API_KEY im Worker) */
export async function searchVideos(settings, query) {
  const d = await workerGet(settings, '/youtube?q=' + encodeURIComponent(query));
  return (d.items || []).map((v) => ({ ...v, title: decodeEntities(v.title), channel: decodeEntities(v.channel) }));
}

let apiPromise = null;
/** Lädt die YouTube-IFrame-API einmalig */
export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { apiPromise = null; reject(new Error('YouTube-Player konnte nicht geladen werden (offline?).')); };
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
