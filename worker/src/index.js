// Gitarrenlehrer-API: leitet Chat-Anfragen der App an die Anthropic-API weiter.
// Der API-Key bleibt hier im Worker und erreicht nie den Browser.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_MESSAGES = 40;
const MAX_CHARS = 80000;

function corsHeaders(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || 'null',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors }
  });
}

// Vergleich ohne Zeitunterschiede je nach Übereinstimmung
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 2_000_000;

/** Inhalt einer Nachricht: Text oder Liste aus Text- und Bildblöcken. Gibt Textlänge und Bildanzahl zurück oder null. */
function checkContent(content) {
  if (typeof content === 'string') return content.trim() ? { chars: content.length, images: 0 } : null;
  if (!Array.isArray(content) || !content.length) return null;
  let chars = 0, images = 0;
  for (const b of content) {
    if (b?.type === 'text' && typeof b.text === 'string') chars += b.text.length;
    else if (b?.type === 'image' && b.source?.type === 'base64' && IMAGE_TYPES.includes(b.source.media_type) &&
      typeof b.source.data === 'string' && b.source.data.length <= MAX_IMAGE_B64) images++;
    else return null;
  }
  return { chars, images };
}

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return false;
  let chars = 0, images = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || m.role !== (i % 2 === 0 ? 'user' : 'assistant')) return false;
    const c = checkContent(m.content);
    if (!c) return false;
    if (m.role === 'assistant' && c.images) return false;
    chars += c.chars; images += c.images;
  }
  return chars <= MAX_CHARS && images <= MAX_IMAGES && messages[messages.length - 1].role === 'user';
}

async function checkDailyLimit(env) {
  if (!env.USAGE) return { ok: true };
  const limit = parseInt(env.DAILY_LIMIT || '150', 10);
  const key = 'count:' + new Date().toISOString().slice(0, 10);
  const used = parseInt((await env.USAGE.get(key)) || '0', 10);
  if (used >= limit) return { ok: false, used, limit };
  await env.USAGE.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return { ok: true, used: used + 1, limit };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed.includes(origin)) return json({ error: 'Diese App-Adresse ist im Worker nicht freigegeben (ALLOWED_ORIGINS).' }, 403, cors);

    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!env.APP_TOKEN || !safeEqual(token, env.APP_TOKEN)) {
      return json({ error: 'Zugangsschlüssel falsch oder nicht gesetzt.' }, 401, cors);
    }

    const url = new URL(request.url);

    if (url.pathname === '/ping' && request.method === 'GET') {
      return json({ ok: true, model: env.MODEL, hasKey: Boolean(env.ANTHROPIC_API_KEY), limit: Boolean(env.USAGE), youtube: Boolean(env.YOUTUBE_API_KEY), sync: Boolean(env.SYNC) }, 200, cors);
    }

    // Abgleich zwischen Geräten: ein Datensatz mit Versionszähler (KV-Speicher SYNC)
    if (url.pathname === '/sync') {
      if (!env.SYNC) return json({ error: 'Im Worker ist der Abgleich nicht eingerichtet (KV-Speicher SYNC fehlt).' }, 501, cors);
      if (request.method === 'GET') {
        const stored = await env.SYNC.get('state', 'json');
        return json(stored || { rev: 0, data: null }, 200, cors);
      }
      if (request.method === 'PUT') {
        const text = await request.text();
        if (text.length > 5_000_000) return json({ error: 'Daten zu groß für den Abgleich.' }, 413, cors);
        let body;
        try { body = JSON.parse(text); } catch { return json({ error: 'Ungültige Daten.' }, 400, cors); }
        const stored = (await env.SYNC.get('state', 'json')) || { rev: 0, data: null };
        if (body.baseRev !== stored.rev) return json({ conflict: true, ...stored }, 409, cors);
        const next = { rev: stored.rev + 1, data: body.data, at: new Date().toISOString() };
        await env.SYNC.put('state', JSON.stringify(next));
        return json({ rev: next.rev }, 200, cors);
      }
    }

    // Titel/Kanal eines Videos (öffentlicher oEmbed-Dienst, kein Key nötig)
    if (url.pathname === '/oembed' && request.method === 'GET') {
      const id = url.searchParams.get('id') || '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return json({ error: 'Ungültige Video-ID.' }, 400, cors);
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
      if (!r.ok) return json({ error: 'Video nicht gefunden oder nicht einbettbar.' }, 404, cors);
      const d = await r.json();
      return json({ title: d.title, author_name: d.author_name }, 200, cors);
    }

    // YouTube-Suche (braucht YOUTUBE_API_KEY)
    if (url.pathname === '/youtube' && request.method === 'GET') {
      if (!env.YOUTUBE_API_KEY) return json({ error: 'Im Worker fehlt der YOUTUBE_API_KEY. Ohne ihn kannst du Videos per Link hinzufügen.' }, 501, cors);
      const q = (url.searchParams.get('q') || '').trim().slice(0, 150);
      if (!q) return json({ error: 'Suchbegriff fehlt.' }, 400, cors);
      const api = new URL('https://www.googleapis.com/youtube/v3/search');
      api.search = new URLSearchParams({
        part: 'snippet', type: 'video', maxResults: '12', q, relevanceLanguage: 'de', safeSearch: 'moderate',
        videoEmbeddable: 'true', key: env.YOUTUBE_API_KEY
      }).toString();
      const r = await fetch(api.toString());
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: 'YouTube meldet: ' + (d?.error?.message || r.status) }, 502, cors);
      const items = (d.items || []).map((it) => ({
        videoId: it.id?.videoId,
        title: it.snippet?.title || '',
        channel: it.snippet?.channelTitle || '',
        published: it.snippet?.publishedAt || ''
      })).filter((v) => v.videoId);
      return json({ items }, 200, cors);
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'Im Worker fehlt der ANTHROPIC_API_KEY.' }, 500, cors);

      let body;
      try { body = await request.json(); } catch { return json({ error: 'Ungültige Anfrage.' }, 400, cors); }
      const { system, messages } = body || {};
      if (typeof system !== 'string' || system.length > 30000) return json({ error: 'Kontext fehlt oder ist zu lang.' }, 400, cors);
      if (!validMessages(messages)) return json({ error: 'Gesprächsverlauf ungültig oder zu lang.' }, 400, cors);

      const quota = await checkDailyLimit(env);
      if (!quota.ok) return json({ error: `Tageslimit erreicht (${quota.limit} Fragen). Morgen geht es weiter.` }, 429, cors);

      const upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: env.MODEL,
          max_tokens: parseInt(env.MAX_TOKENS || '1500', 10),
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true
        })
      });

      if (!upstream.ok) {
        let detail = '';
        try { detail = (await upstream.json())?.error?.message || ''; } catch { /* leer */ }
        return json({ error: `Anthropic-API meldet Fehler ${upstream.status}. ${detail}`.trim() }, 502, cors);
      }

      // Antwort als Datenstrom direkt durchreichen
      return new Response(upstream.body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', ...cors }
      });
    }

    return json({ error: 'Unbekannter Pfad.' }, 404, cors);
  }
};
