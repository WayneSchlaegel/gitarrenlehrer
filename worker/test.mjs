// Test des Workers ohne Cloudflare: npm test
import assert from 'node:assert/strict';
import worker from './src/index.js';

const env = { APP_TOKEN: 'geheim123', ANTHROPIC_API_KEY: 'sk-test', MODEL: 'test-model', ALLOWED_ORIGINS: 'http://localhost:5173' };
const O = 'http://localhost:5173';
const req = (path, opt = {}) => new Request('https://w.example' + path, { ...opt, headers: { Origin: O, ...(opt.headers || {}) } });
let sent = null;
globalThis.fetch = async (url, opt) => {
  sent = JSON.parse(opt.body);
  return new Response('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hallo"}}\n\n', { status: 200 });
};

let r = await worker.fetch(req('/ping'), env);
assert.equal(r.status, 401);
r = await worker.fetch(req('/ping', { headers: { Authorization: 'Bearer geheim123' } }), env);
assert.equal(r.status, 200);
assert.equal((await r.json()).model, 'test-model');
r = await worker.fetch(new Request('https://w.example/ping', { headers: { Origin: 'https://boese.example', Authorization: 'Bearer geheim123' } }), env);
assert.equal(r.status, 403);

const body = { system: 'Du bist Lehrer.', messages: [{ role: 'user', content: 'Wie greife ich F?' }] };
r = await worker.fetch(req('/chat', { method: 'POST', headers: { Authorization: 'Bearer geheim123' }, body: JSON.stringify(body) }), env);
assert.equal(r.status, 200);
assert.match(await r.text(), /Hallo/);
assert.equal(sent.model, 'test-model');
assert.equal(sent.stream, true);

r = await worker.fetch(req('/chat', { method: 'POST', headers: { Authorization: 'Bearer geheim123' }, body: JSON.stringify({ system: 'x', messages: [{ role: 'assistant', content: 'a' }] }) }), env);
assert.equal(r.status, 400);

// Bilder
{
  const img = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } };
  const ok = { system: 'x', messages: [{ role: 'user', content: [img, { type: 'text', text: 'Wie ist mein Daumen?' }] }] };
  r = await worker.fetch(req('/chat', { method: 'POST', headers: { Authorization: 'Bearer geheim123' }, body: JSON.stringify(ok) }), env);
  assert.equal(r.status, 200);
  assert.equal(sent.messages[0].content[0].type, 'image');
  const many = { system: 'x', messages: [{ role: 'user', content: [img, img, img, img, img, { type: 'text', text: 'zu viele' }] }] };
  r = await worker.fetch(req('/chat', { method: 'POST', headers: { Authorization: 'Bearer geheim123' }, body: JSON.stringify(many) }), env);
  assert.equal(r.status, 400);
  const bad = { system: 'x', messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'http://x' } }] }] };
  r = await worker.fetch(req('/chat', { method: 'POST', headers: { Authorization: 'Bearer geheim123' }, body: JSON.stringify(bad) }), env);
  assert.equal(r.status, 400);
}

// Tageslimit
const store = new Map();
const kvEnv = { ...env, DAILY_LIMIT: '2', USAGE: { get: async (k) => store.get(k) ?? null, put: async (k, v) => store.set(k, v) } };
for (const expected of [200, 200, 429]) {
  r = await worker.fetch(req('/chat', { method: 'POST', headers: { Authorization: 'Bearer geheim123' }, body: JSON.stringify(body) }), kvEnv);
  assert.equal(r.status, expected);
}
// YouTube-Suche und oEmbed
globalThis.fetch = async (u) => {
  const s = String(u);
  if (s.includes('googleapis.com')) return new Response(JSON.stringify({ items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'Lernvideo', channelTitle: 'Kanal' } }] }), { status: 200 });
  if (s.includes('oembed')) return new Response(JSON.stringify({ title: 'Titel', author_name: 'Autor' }), { status: 200 });
  return new Response('{}', { status: 404 });
};
const auth = { headers: { Authorization: 'Bearer geheim123' } };
r = await worker.fetch(req('/youtube?q=gitarre', auth), env);
assert.equal(r.status, 501);
r = await worker.fetch(req('/youtube?q=gitarre', auth), { ...env, YOUTUBE_API_KEY: 'y' });
assert.equal((await r.json()).items[0].videoId, 'abcdefghijk');
r = await worker.fetch(req('/oembed?id=abcdefghijk', auth), env);
assert.equal((await r.json()).author_name, 'Autor');
r = await worker.fetch(req('/oembed?id=../../x', auth), env);
assert.equal(r.status, 400);
// Abgleich
{
  const kv = new Map();
  const senv = { ...env, SYNC: { get: async (k, type) => (kv.has(k) ? (type === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null), put: async (k, v) => kv.set(k, v) } };
  r = await worker.fetch(req('/sync', auth), env);
  assert.equal(r.status, 501);
  r = await worker.fetch(req('/sync', auth), senv);
  assert.equal((await r.json()).rev, 0);
  r = await worker.fetch(req('/sync', { method: 'PUT', headers: { Authorization: 'Bearer geheim123' }, body: JSON.stringify({ baseRev: 0, data: { songs: [1] } }) }), senv);
  assert.equal((await r.json()).rev, 1);
  r = await worker.fetch(req('/sync', { method: 'PUT', headers: { Authorization: 'Bearer geheim123' }, body: JSON.stringify({ baseRev: 0, data: { songs: [2] } }) }), senv);
  assert.equal(r.status, 409);
  const c = await r.json();
  assert.equal(c.rev, 1); assert.deepEqual(c.data.songs, [1]);
}
console.log('Worker-Tests bestanden.');
