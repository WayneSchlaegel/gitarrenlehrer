// Synthetischer Gitarrenklang (Karplus-Strong) für Schlag- und Zupfmuster.
// Jeder Ton wird einmal berechnet und zwischengespeichert; die Tonhöhe wird über die Abspielrate genau getroffen.

import { OPEN_STRINGS } from './dsp.js';

/**
 * Berechnet eine gezupfte Saite. Ergebnis-Grundfrequenz = sr / (N + 0.5).
 * mute: stark gedämpft (für Chuck), soft: weicher Anschlag (Finger statt Plektrum)
 */
export function renderPluck(sr, freq, { seconds = 2.6, mute = false, palm = false, soft = false, seed = 1 } = {}) {
  const N = Math.max(2, Math.round(sr / freq - 0.5));
  const len = Math.round(sr * (mute ? 0.12 : palm ? 0.4 : seconds));
  const out = new Float32Array(len);
  let x = seed * 9301 + 49297;
  const rnd = () => { x = (x * 16807) % 2147483647; return (x / 2147483647) * 2 - 1; };
  // Anregung: Rauschen, bei weichem Anschlag geglättet
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = rnd();
  if (soft) for (let k = 0; k < 2; k++) for (let i = 1; i < N; i++) buf[i] = 0.5 * (buf[i] + buf[i - 1]);
  // Tiefe Saiten klingen länger nach als hohe
  // Palm Muting: Handballen dämpft, kurzer dumpfer Ton
  const decay = mute ? 0.86 : palm ? 0.982 : Math.min(0.9985, 0.9965 + (110 / freq) * 0.002);
  if (palm) for (let k = 0; k < 3; k++) for (let i = 1; i < N; i++) buf[i] = 0.5 * (buf[i] + buf[i - 1]);
  let idx = 0, prev = 0;
  for (let n = 0; n < len; n++) {
    const cur = buf[idx];
    const y = decay * 0.5 * (cur + prev);
    prev = cur;
    buf[idx] = y;
    out[n] = cur;
    idx = (idx + 1) % N;
  }
  // Einschwingen und Ausklingen glätten
  const fadeIn = Math.min(len, Math.round(sr * 0.002));
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  const fadeOut = Math.min(len, Math.round(sr * 0.08));
  for (let i = 0; i < fadeOut; i++) out[len - 1 - i] *= i / fadeOut;
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak) for (let i = 0; i < len; i++) out[i] /= peak;
  return { data: out, f0: sr / (N + 0.5) };
}

export class Guitar {
  constructor() {
    this.ctx = null;
    this.cache = new Map();
    this.active = new Array(6).fill(null); // klingende Saiten, damit ein neuer Anschlag die alte Saite abdämpft
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      // Etwas Korpus: Tiefen leicht anheben, Höhen etwas abrunden
      const body = this.ctx.createBiquadFilter();
      body.type = 'peaking'; body.frequency.value = 180; body.gain.value = 4; body.Q.value = 0.8;
      const air = this.ctx.createBiquadFilter();
      air.type = 'lowpass'; air.frequency.value = 5200;
      this.master.connect(body).connect(air).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  buffer(midi, variant) {
    const key = midi + ':' + variant;
    if (!this.cache.has(key)) {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const r = renderPluck(this.ctx.sampleRate, f, { mute: variant === 'mute', palm: variant === 'palm', soft: variant === 'soft', seed: (midi * 7 + variant.length) % 97 + 1 });
      const ab = this.ctx.createBuffer(1, r.data.length, this.ctx.sampleRate);
      ab.copyToChannel(r.data, 0);
      this.cache.set(key, { ab, rate: f / r.f0 });
    }
    return this.cache.get(key);
  }

  /** Einzelne Saite zupfen */
  pluck(time, string, midi, { gain = 0.8, variant = 'pick' } = {}) {
    const ctx = this.ensure();
    const { ab, rate } = this.buffer(midi, variant);
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    src.connect(g).connect(this.master);
    // Vorherigen Ton derselben Saite abdämpfen
    const old = this.active[string];
    if (old && variant !== 'mute') {
      try { old.g.gain.setTargetAtTime(0, time, 0.012); } catch { /* bereits beendet */ }
    }
    src.start(time);
    if (variant !== 'mute') this.active[string] = { src, g };
  }

  /**
   * Akkord anschlagen. midis: Array[6] mit MIDI-Ton je Saite oder null (nicht anschlagen).
   * dir 'D' = abwärts (tief → hoch), 'U' = aufwärts (hoch → tief, nur obere Saiten, leiser)
   */
  strum(time, midis, dir = 'D', { gain = 0.75, variant = 'pick', only = null } = {}) {
    let strings = midis.map((m, s) => ({ m, s })).filter((x) => x.m != null);
    if (only) strings = strings.filter((x) => only.includes(x.s));
    const order = dir === 'U' ? strings.filter((x) => x.s >= 2 || only).reverse() : strings;
    const gap = variant === 'palm' ? 0.006 : dir === 'U' ? 0.007 : 0.011;
    order.forEach((x, i) => this.pluck(time + i * gap, x.s, x.m, { variant, gain: gain * (dir === 'U' ? 0.6 : 1) * (0.85 + 0.15 * Math.random()) }));
  }

  /** Chuck: Saiten mit der Schlaghand abdämpfen und gleichzeitig anschlagen */
  chuck(time, midis) {
    const ctx = this.ensure();
    // Alle klingenden Saiten sofort abdämpfen
    this.active.forEach((a, s) => { if (a) { try { a.g.gain.setTargetAtTime(0, time, 0.006); } catch { /* egal */ } this.active[s] = null; } });
    midis.forEach((m, s) => { if (m != null) this.pluck(time + s * 0.004, s, m, { gain: 0.55, variant: 'mute' }); });
    // Kurzes Rauschen für den Klatschlaut
    const len = Math.round(ctx.sampleRate * 0.03);
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = nb;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = 0.35;
    src.connect(f).connect(g).connect(this.master);
    src.start(time);
  }

  /** Alles verstummen lassen */
  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.active.forEach((a, s) => { if (a) { try { a.g.gain.setTargetAtTime(0, t, 0.02); } catch { /* egal */ } this.active[s] = null; } });
  }

  close() { this.ctx?.close(); this.ctx = null; this.cache.clear(); }
}

/** MIDI-Töne eines Griffs je Saite (null = nicht spielen), mit Capo */
export function shapeMidis(frets, capo = 0) {
  return frets.map((f, s) => (f < 0 ? null : OPEN_STRINGS[s] + f + capo));
}
