// Kleine Selbsttests für Parser und Akkordlogik: npm test
import assert from 'node:assert/strict';
import { parseChord, transposeChord, displayChord, capoSuggestions, isChord } from './chords.js';
import { parseSong, isChordLine } from './parser.js';
import { getShape } from './shapes.js';

assert.ok(isChord('Am7'));
assert.ok(isChord('Cadd9'));
assert.ok(isChord('G/B'));
assert.ok(isChord('F#m7b5'));
assert.ok(!isChord('Bad'));
assert.ok(!isChord('Amazing'));
assert.ok(!isChord('Die'));
assert.equal(transposeChord('G', 2), 'A');
assert.equal(transposeChord('D7', -2, true), 'C7');
assert.equal(transposeChord('G/B', 1, true), 'Ab/C');
assert.equal(displayChord('Bb', 'deutsch'), 'B');
assert.equal(displayChord('Bm', 'deutsch'), 'Hm');
assert.ok(isChordLine('G              G7        C        G'));
assert.ok(!isChordLine('A bad day'));

const p = parseSong(`[Verse 1]
G              G7        C        G
Amazing grace, how sweet the sound
                      D
That saved a wretch like me`);
assert.equal(p.lines[0].type, 'section');
assert.equal(p.lines[1].segments[0].chord, 'G');
assert.equal(p.lines[1].segments[0].text.startsWith('Amazing'), true);
assert.deepEqual(p.chords, ['G', 'G7', 'C', 'G', 'D']);

const q = parseSong('{title: X}\n[G]Die Ge[D7]danken');
assert.equal(q.meta.title, 'X');
assert.equal(q.lines[0].segments[1].chord, 'D7');
assert.equal(q.lines[0].segments[1].text, 'danken');

// Lied in Bb: Capo 3 mit G-Griffen sollte oben stehen
const sug = capoSuggestions(['Bb', 'Eb', 'F', 'Gm']);
assert.equal(sug[0].capo, 3, JSON.stringify(sug));
assert.deepEqual(sug[0].shapes, ['G', 'C', 'D', 'Em']);

assert.deepEqual(getShape('C').frets, [-1, 3, 2, 0, 1, 0]);
assert.deepEqual(getShape('Bm').frets, [-1, 2, 4, 4, 3, 2]);
assert.equal(getShape('F#m').barre, 2);
assert.ok(getShape('Ebmaj7'));
console.log('Alle Selbsttests bestanden.');

// --- Stufe 1b: Tabs, Ultimate-Guitar-Angaben, Import ---
import { isTabLine } from './parser.js';
assert.ok(isTabLine('e|-----0-----3---|'));
assert.ok(isTabLine('B|---1-------1---|'));
assert.ok(isTabLine('|-------0---2---3-------|'));
assert.ok(!isTabLine('Em --- C'));
assert.ok(!isTabLine('G              G7        C        G'));

const ug = parseSong(`Capo: 2nd fret
Tuning: E A D G B E

[Intro]
e|-----0-----|
B|---1---1---|
G|-2-------2-|

[Verse 1]
[tab][ch]G[/ch]              [ch]C[/ch]
Amazing grace, how sweet[/tab]`);
assert.equal(ug.meta.capo, 2);
assert.equal(ug.meta.tuning, 'E A D G B E');
const tab = ug.lines.find((l) => l.type === 'tab');
assert.equal(tab.lines.length, 3);
const ly = ug.lines.find((l) => l.type === 'lyrics');
assert.equal(ly.segments[0].chord, 'G');
assert.equal(ly.segments[1].chord, 'C');
assert.ok(!ug.lines.some((l) => l.type === 'comment'), 'Standardstimmung nicht anzeigen');
assert.equal(parseSong('Capo 3').meta.capo, 3);
assert.equal(parseSong('Capo: no capo').meta.capo, 0);

// Lesezeichen-Skript: muss gültiges JavaScript sein
import { buildBookmarklet } from './bookmarklet.js';
const bm = buildBookmarklet('http://localhost:5173/');
assert.ok(bm.startsWith('javascript:'));
new Function(decodeURIComponent(bm.slice('javascript:'.length)));
console.log('Tests Stufe 1b bestanden.');

// --- Stufe 3: Hören (mit künstlichen Gitarrenklängen) ---
import * as D from './audio/dsp.js';
import { pluck, strum, noise } from './audio/synth.mjs';
{
  const sr = 48000;
  for (const m of [40, 45, 59, 64]) {
    const b = new Float32Array(sr * 1.5); pluck(b, sr, 0.2, m); noise(b);
    const on = D.detectOnsets(b, sr);
    assert.equal(on.length, 1);
    assert.equal(D.analyzeString(b, sr, on[0], m).status, 'ok', 'Saite ' + m);
  }
  let b = new Float32Array(sr * 1.5); pluck(b, sr, 0.2, 45); noise(b);
  assert.equal(D.analyzeString(b, sr, D.detectOnsets(b, sr)[0], 47).status, 'falsch');
  b = new Float32Array(sr * 1.5); pluck(b, sr, 0.2, 55, { decay: 25 }); noise(b);
  assert.equal(D.analyzeString(b, sr, D.detectOnsets(b, sr)[0], 55).status, 'gedaempft');

  b = new Float32Array(sr * 2); strum(b, sr, 0.2, [43, 47, 50, 55, 59, 67]); noise(b);
  assert.equal(D.evaluateChord(D.chordChroma(b, sr, D.detectOnsets(b, sr)[0]).chroma, [7, 11, 2]).verdict, 'gut');
  b = new Float32Array(sr * 2); strum(b, sr, 0.2, [48, 52, 55, 59, 64]); noise(b);
  const e = D.evaluateChord(D.chordChroma(b, sr, D.detectOnsets(b, sr)[0]).chroma, [0, 4, 7]);
  assert.equal(e.verdict, 'falsch'); assert.deepEqual(e.extra, [11]);

  const beat = 60 / 70, beats = [], truth = [];
  b = new Float32Array(sr * 16);
  for (let i = 0; i < 16; i++) { const bt = 0.5 + i * beat; beats.push(bt); const t = bt + 0.02 - i * 0.004; truth.push(t); strum(b, sr, t, [43, 47, 50, 55, 59, 67], { amp: 0.15 }); }
  noise(b);
  const ons = D.detectOnsets(b, sr).map((s) => s / sr);
  assert.equal(ons.length, 16);
  const tr = D.evaluateTiming(ons, beats, beat);
  assert.equal(tr.missed, 0); assert.equal(tr.extra, 0);
  assert.ok(tr.slopeMsPerBeat < -3 && tr.slopeMsPerBeat > -5, 'Trend ' + tr.slopeMsPerBeat);
  console.log('Tests Stufe 3 (Hören) bestanden.');
}

// --- Stufe 4: Theorie und Videos ---
import { detectKey, degreeOf, keyChords, capoTable } from './theory.js';
import { parseVideoId } from './youtube.js';
{
  assert.equal(detectKey(['G', 'D', 'Em', 'C', 'G']).key, 'G');
  const am = detectKey(['Am', 'F', 'C', 'G', 'Am']);
  assert.equal(am.key, 'C'); assert.ok(am.minor); assert.equal(am.relMinor, 'Am');
  assert.equal(degreeOf('D7', 'G'), 'V7');
  assert.equal(degreeOf('Em', 'G'), 'vi');
  assert.equal(degreeOf('F', 'G'), '♭VII');
  assert.deepEqual(keyChords('D').map((c) => c.chord).slice(0, 6), ['D', 'Em', 'F#m', 'G', 'A', 'Bm']);
  assert.deepEqual(capoTable(['G'], 3)[0].sounds, ['G', 'Ab', 'A', 'Bb']);
  assert.equal(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://m.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('Hallo Welt'), null);
  console.log('Tests Stufe 4 bestanden.');
}

// --- Paket 1–9: Stimme, Wechsel, Tempo ---
{
  const sr = 48000;
  let b = new Float32Array(sr * 6);
  [50, 52, 55, 57, 59, 62, 59, 55].forEach((m, i) => { const f = 440 * 2 ** ((m - 69) / 12); for (let k = Math.round((0.3 + i * 0.7) * sr); k < Math.round((0.95 + i * 0.7) * sr); k++) { const t = k / sr; b[k] += 0.1 * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t)); } });
  noise(b, 0.001);
  const tr = D.pitchTrack(b, sr).map((x) => x.midi);
  assert.ok(Math.abs(D.percentile(tr, 0.1) - 50) < 0.6 && Math.abs(D.percentile(tr, 0.9) - 62) < 0.6);
  const sh = D.suggestShift(50, 62, 45, 60);
  assert.ok(sh.fits && sh.shift < 0);
  const G = [43, 47, 50, 55, 59, 67], C = [48, 52, 55, 60, 64];
  b = new Float32Array(sr * 12);
  for (let i = 0; i < 12; i++) strum(b, sr, 0.4 + i * 0.85, i % 2 ? C : G, { amp: 0.15 });
  noise(b);
  const labels = D.detectOnsets(b, sr).map((o) => D.classifyAB(D.chordChroma(b, sr, o, { fast: true }).chroma, [7, 11, 2], [0, 4, 7]));
  assert.equal(D.countChanges(labels), 11);
  b = new Float32Array(sr * 40); let t = 0.5;
  while (t < 39) { strum(b, sr, t, G, { amp: 0.12 }); t += 60 / (90 + (t / 39) * 10); }
  noise(b);
  const curve = D.tempoCurve(b, sr, 90);
  assert.ok(curve[0].bpm > 89 && curve[0].bpm < 93 && curve[curve.length - 1].bpm > 96);
  console.log('Tests Stimme/Wechsel/Tempo bestanden.');
}

// Lehrer bekommt Messungen und Stimmumfang
import { buildSystemPrompt } from './teacher.js';
import { DEFAULT_PROFILE } from './storage.js';
{
  const sp = buildSystemPrompt({
    profile: { ...DEFAULT_PROFILE, voiceLow: 45, voiceHigh: 62 }, categoryId: 'western', songs: [], song: null,
    practice: [
      { type: 'timing', category: 'western', at: '2026-11-07T10:00:00Z', bpm: 70, meanMs: 12, sdMs: 31, slope: -2.1, missed: 0 },
      { type: 'saiten', category: 'western', at: '2026-11-07T10:05:00Z', chord: 'G', results: [{ s: 4, status: 'gedaempft' }] },
      { type: 'timing', category: 'e', at: '2026-11-07T10:00:00Z', bpm: 99, meanMs: 0, sdMs: 0, slope: 0, missed: 0 }
    ]
  });
  assert.match(sp, /Timing 70 bpm/);
  assert.match(sp, /H gedaempft/);
  assert.doesNotMatch(sp, /99 bpm/);
  assert.match(sp, /Stimmumfang/);
  console.log('Tests Lehrer-Kontext bestanden.');
}

// Abgleich: Zusammenführen
import { mergeSync } from './sync.js';
{
  const A = { songs: [{ id: 's1', title: 'Alt', updated: '2026-11-01' }, { id: 's2', title: 'Nur A', updated: '2026-11-02' }],
    videos: [], practice: [{ at: '1', type: 'x' }], chats: { western: [{ role: 'user', content: 'a', at: '2026-11-05' }] },
    profile: { name: 'W', updated: '2026-11-01' }, deleted: [] };
  const B = { songs: [{ id: 's1', title: 'Neu', updated: '2026-11-03' }, { id: 's3', title: 'Nur B', updated: '2026-11-01' }],
    videos: [{ id: 'v1', added: '2026-11-01' }], practice: [{ at: '1', type: 'x' }, { at: '2', type: 'y' }], chats: { western: [{ role: 'user', content: 'b', at: '2026-11-06' }] },
    profile: { name: 'W2', updated: '2026-11-04' }, deleted: [{ kind: 'song', id: 's2', at: '2026-11-04' }] };
  const m = mergeSync(A, B);
  assert.deepEqual(m.songs.map((s) => s.title).sort(), ['Neu', 'Nur B']);
  assert.equal(m.videos.length, 1);
  assert.equal(m.practice.length, 2);
  assert.equal(m.chats.western[0].content, 'b');
  assert.equal(m.profile.name, 'W2');
  // Nach dem Löschen wieder bearbeitet: Lied bleibt
  const m2 = mergeSync({ ...A, songs: [{ id: 's2', title: 'Wieder da', updated: '2026-11-05' }] }, B);
  assert.ok(m2.songs.some((s) => s.title === 'Wieder da'));
  console.log('Tests Abgleich bestanden.');
}
