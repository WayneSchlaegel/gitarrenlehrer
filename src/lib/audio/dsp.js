// Signalverarbeitung ohne Browser-Abhängigkeiten (in Node testbar)
// - Tonhöhe einzelner Saiten (YIN-Verfahren)
// - Tonklassen eines Akkords (Spektrum → Chroma)
// - Anschläge im Zeitverlauf (für Timing)

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const OPEN_STRINGS = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (MIDI)
export const STRING_NAMES = ['tiefe E', 'A', 'D', 'G', 'H', 'hohe e'];

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const pc = (midi) => ((Math.round(midi) % 12) + 12) % 12;

export function noteLabel(midi, notation = 'international') {
  const n = NOTE_NAMES[pc(midi)];
  const name = notation === 'deutsch' ? (n === 'B' ? 'H' : n === 'A#' ? 'B' : n) : n;
  return name + (Math.floor(Math.round(midi) / 12) - 1);
}
export function pcLabel(p, notation = 'international') {
  const n = NOTE_NAMES[p];
  return notation === 'deutsch' ? (n === 'B' ? 'H' : n === 'A#' ? 'B' : n) : n;
}

// ---------- Grundbausteine ----------

export function rms(buf, start = 0, end = buf.length) {
  let s = 0;
  const a = Math.max(0, start), b = Math.min(buf.length, end);
  for (let i = a; i < b; i++) s += buf[i] * buf[i];
  return b > a ? Math.sqrt(s / (b - a)) : 0;
}

/** Iterative Radix-2-FFT (Länge Zweierpotenz), arbeitet in place */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Betragsspektrum, gemittelt über mehrere Hann-Fenster */
export function magnitudeSpectrum(buf, start, n, frames = 3, hop = n / 2) {
  const mag = new Float64Array(n / 2);
  let used = 0;
  for (let f = 0; f < frames; f++) {
    const s = start + f * hop;
    if (s + n > buf.length) break;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = buf[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    fft(re, im);
    for (let k = 0; k < n / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
    used++;
  }
  if (used) for (let k = 0; k < mag.length; k++) mag[k] /= used;
  return { mag, used };
}

// ---------- Anschläge ----------

/** Grundrauschen: Median der Lautstärke in 10-ms-Stücken (robust gegen einzelne Anschläge) */
export function noiseFloor(buf, sr, start = 0, end = buf.length, q = 0.3) {
  const hop = Math.round(sr * 0.01);
  const vals = [];
  for (let i = Math.max(0, start); i + hop <= Math.min(end, buf.length); i += hop) vals.push(rms(buf, i, i + hop));
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length * q)];
}

/** Empfindlichkeit 1 (unempfindlich) bis 5 (sehr empfindlich) → Mindestpegel über dem Rauschen */
export function onsetMinLevel(floor, sensitivity = 3) {
  const factor = [8, 5, 3.5, 2.5, 1.8][Math.max(1, Math.min(5, sensitivity)) - 1];
  const absolute = [0.006, 0.003, 0.0015, 0.0008, 0.0004][Math.max(1, Math.min(5, sensitivity)) - 1];
  return Math.max(absolute, floor * factor);
}

/**
 * Findet Anschläge (Onsets). Gibt Samplepositionen zurück.
 * Hüllkurve in 5-ms-Schritten; Anschlag = deutlicher Energieanstieg gegenüber den letzten ~40 ms.
 */
export function detectOnsets(buf, sr, { minGapMs = 110, ratio = 1.6, absMin = 0.006, relMin = 0.12 } = {}) {
  const hop = Math.max(64, Math.round(sr * 0.005));
  const env = [];
  for (let i = 0; i + hop <= buf.length; i += hop) env.push(rms(buf, i, i + hop));
  const peak = env.reduce((a, b) => Math.max(a, b), 0);
  const thr = Math.max(absMin, peak * relMin);
  const gap = Math.round(minGapMs / 5);
  const out = [];
  let last = -1e9;
  for (let i = 4; i < env.length; i++) {
    // Vergleich mit dem lautesten Wert der letzten ~40 ms: Schwebungen im Ausklang lösen so nichts aus
    let base = 1e-6;
    for (let j = i - 8; j < i - 2; j++) if (j >= 0 && env[j] > base) base = env[j];
    if (env[i] > thr && env[i] / base > ratio && i - last > gap) {
      // Beginn des Anstiegs zurückverfolgen
      let k = i;
      while (k > 1 && env[k - 1] > base * 1.15 && i - k < 6) k--;
      out.push(k * hop);
      last = i;
    }
  }
  return out;
}

// ---------- Tonhöhe (YIN) ----------

export function yin(buf, start, size, sr, { fmin = 65, fmax = 1100, threshold = 0.15 } = {}) {
  const maxTau = Math.min(Math.floor(sr / fmin), Math.floor(size / 2));
  const minTau = Math.max(2, Math.floor(sr / fmax));
  const d = new Float64Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < size - maxTau; i++) {
      const x = buf[start + i] - buf[start + i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  const cm = new Float64Array(maxTau + 1);
  cm[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxTau; tau++) { run += d[tau]; cm[tau] = run ? (d[tau] * tau) / run : 1; }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cm[t] < threshold) {
      while (t + 1 <= maxTau && cm[t + 1] < cm[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // kein klarer Wert unter der Schwelle: bestes Minimum nehmen, aber als unsicher markieren
    let best = minTau;
    for (let t = minTau; t <= maxTau; t++) if (cm[t] < cm[best]) best = t;
    tau = best;
  }
  let betterTau = tau;
  if (tau > 1 && tau < maxTau) {
    const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1];
    const den = a + c - 2 * b;
    if (den) betterTau = tau + (a - c) / (2 * den);
  }
  return { freq: sr / betterTau, clarity: 1 - cm[tau] };
}

/**
 * Wertet eine einzeln angeschlagene Saite aus.
 * expectedMidi: Sollton. Ergebnis: status 'ok' | 'falsch' | 'gedaempft' | 'unsauber'
 */
export function analyzeString(buf, sr, onset, expectedMidi) {
  const size = 4096;
  const startS = onset + Math.round(sr * 0.06);
  const endS = Math.min(buf.length - size, onset + Math.round(sr * 0.7));
  const pitches = [];
  let clarSum = 0, frames = 0;
  for (let s = startS; s <= endS; s += 1024) {
    const r = yin(buf, s, size, sr);
    frames++;
    clarSum += r.clarity;
    if (r.clarity > 0.8) pitches.push(r.freq);
  }
  const early = rms(buf, onset + Math.round(sr * 0.03), onset + Math.round(sr * 0.13));
  const late = rms(buf, onset + Math.round(sr * 0.45), onset + Math.round(sr * 0.55));
  const sustain = early ? late / early : 0;

  if (pitches.length < 3 || sustain < 0.06) {
    return { status: 'gedaempft', sustain, clarity: frames ? clarSum / frames : 0 };
  }
  pitches.sort((a, b) => a - b);
  const f = pitches[Math.floor(pitches.length / 2)];
  const midi = freqToMidi(f);
  // Oktavfehler des Verfahrens zulassen: auf die Oktave des Solltons legen
  let m = midi;
  while (m - expectedMidi > 6) m -= 12;
  while (expectedMidi - m > 6) m += 12;
  const cents = Math.round((m - expectedMidi) * 100);
  const clarity = clarSum / frames;
  if (Math.abs(cents) > 40) return { status: 'falsch', midi, cents, sustain, clarity };
  if (clarity < 0.72) return { status: 'unsauber', midi, cents, sustain, clarity };
  return { status: 'ok', midi, cents, sustain, clarity };
}

// ---------- Akkord (Chroma) ----------

/** Tonklassen-Profil ab dem Anschlag, mit Dämpfung von Obertönen */
export function chordChroma(buf, sr, onset, { fast = false } = {}) {
  // fast: kürzeres Fenster (ca. 0,35 s), für schnelle Akkordwechsel
  const n = fast ? (sr > 32000 ? 8192 : 4096) : (sr > 32000 ? 16384 : 8192);
  const start = onset + Math.round(sr * 0.08);
  const { mag, used } = magnitudeSpectrum(buf, start, n, fast ? 2 : 3, n / 2);
  if (!used) return null;
  const binHz = sr / n;
  const kMin = Math.floor(70 / binHz), kMax = Math.min(mag.length - 2, Math.ceil(1400 / binHz));
  let maxMag = 0;
  for (let k = kMin; k <= kMax; k++) maxMag = Math.max(maxMag, mag[k]);
  const peaks = [];
  for (let k = kMin; k <= kMax; k++) {
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > maxMag * 0.04) {
      const a = mag[k - 1], b = mag[k], c = mag[k + 1];
      const den = a + c - 2 * b;
      const off = den ? (a - c) / (2 * den) : 0;
      peaks.push({ f: (k + off) * binHz, mag: b, w: b });
    }
  }
  // Obertöne: Spitzen nahe einem ganzzahligen Vielfachen einer stärkeren tieferen Spitze abschwächen
  peaks.sort((x, y) => x.f - y.f);
  for (let i = 0; i < peaks.length; i++) {
    for (let j = 0; j < i; j++) {
      const r = peaks[i].f / peaks[j].f;
      const k = Math.round(r);
      if (k >= 2 && k <= 8 && Math.abs(r - k) / k < 0.012 && peaks[j].mag > peaks[i].mag * 0.25) {
        peaks[i].w *= 0.4;
        break;
      }
    }
  }
  const chroma = new Array(12).fill(0);
  const notes = [];
  for (const p of peaks) {
    const m = freqToMidi(p.f);
    if (Math.abs(m - Math.round(m)) > 0.35) continue; // zu weit zwischen den Tönen
    chroma[pc(m)] += p.w;
    notes.push({ midi: Math.round(m), w: p.w });
  }
  const mx = Math.max(...chroma) || 1;
  const level = rms(buf, start, start + n);
  return { chroma: chroma.map((v) => v / mx), notes, level };
}

/** Vergleicht das Chroma mit den erwarteten Tonklassen */
export function evaluateChord(chroma, expectedPcs) {
  const exp = new Set(expectedPcs);
  const total = chroma.reduce((a, b) => a + b, 0) || 1;
  const inside = chroma.reduce((a, v, i) => a + (exp.has(i) ? v : 0), 0);
  const missing = [...exp].filter((p) => chroma[p] < 0.15);
  const extra = chroma.map((v, i) => ({ p: i, v })).filter((x) => !exp.has(x.p) && x.v > 0.4).map((x) => x.p);
  const score = inside / total;
  let verdict = 'gut';
  if (extra.length || score < 0.6) verdict = 'falsch';
  else if (missing.length || score < 0.78) verdict = 'teilweise';
  return { score, missing, extra, verdict };
}

// ---------- Timing ----------

/**
 * Ordnet Anschläge den Schlägen zu.
 * onsetTimes, beatTimes in Sekunden (gleiche Zeitbasis, Latenz bereits abgezogen)
 */
export function evaluateTiming(onsetTimes, beatTimes, beatSec) {
  const win = beatSec * 0.45;
  const hits = [];
  const used = new Set();
  beatTimes.forEach((bt, i) => {
    let best = -1, bestD = Infinity;
    onsetTimes.forEach((ot, j) => {
      const d = Math.abs(ot - bt);
      if (d < bestD && d <= win && !used.has(j)) { bestD = d; best = j; }
    });
    if (best >= 0) { used.add(best); hits.push({ beat: i, offsetMs: (onsetTimes[best] - bt) * 1000 }); }
  });
  const extra = onsetTimes.length - used.size;
  const missed = beatTimes.length - hits.length;
  const offs = hits.map((h) => h.offsetMs);
  const mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
  const sd = offs.length > 1 ? Math.sqrt(offs.reduce((a, b) => a + (b - mean) ** 2, 0) / (offs.length - 1)) : 0;
  // Trend: Steigung der Abweichung über die Schläge (ms pro Schlag); negativ = wird schneller
  let slope = 0;
  if (hits.length > 3) {
    const xs = hits.map((h) => h.beat), mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    let num = 0, den = 0;
    hits.forEach((h, k) => { num += (xs[k] - mx) * (h.offsetMs - mean); den += (xs[k] - mx) ** 2; });
    slope = den ? num / den : 0;
  }
  return { hits, missed, extra, meanMs: mean, sdMs: sd, slopeMsPerBeat: slope };
}

// ---------- Stimme ----------

/** Tonhöhenverlauf (z. B. Gesang): Liste {t, midi} sicherer Frames */
export function pitchTrack(buf, sr, { hopSec = 0.04, fmin = 70, fmax = 1000, minClarity = 0.85, minLevel = 0.002 } = {}) {
  const size = sr > 32000 ? 2048 : 1024;
  const hop = Math.round(sr * hopSec);
  const out = [];
  for (let s = 0; s + size < buf.length; s += hop) {
    if (rms(buf, s, s + size) < minLevel) continue;
    const r = yin(buf, s, size, sr, { fmin, fmax, threshold: 0.12 });
    if (r.clarity >= minClarity && r.freq >= fmin && r.freq <= fmax) out.push({ t: s / sr, midi: freqToMidi(r.freq) });
  }
  return out;
}

export function percentile(values, q) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
}

/**
 * Verschiebung in Halbtönen, damit die Melodie [low, high] bequem in die Stimmlage [vLow, vHigh] passt.
 * Bevorzugt kleine Verschiebungen; gibt auch an, ob es überhaupt passt.
 */
export function suggestShift(low, high, vLow, vHigh, maxShift = 7) {
  let best = null;
  for (let s = -maxShift; s <= maxShift; s++) {
    const lo = low + s, hi = high + s;
    const over = Math.max(0, hi - (vHigh - 1)) + Math.max(0, (vLow + 1) - lo);
    const centre = Math.abs((lo + hi) / 2 - (vLow + vHigh) / 2);
    const score = over * 10 + centre + Math.abs(s) * 0.3;
    if (!best || score < best.score) best = { shift: s, score, fits: over === 0 };
  }
  return best;
}

// ---------- Akkordwechsel ----------

/** Ordnet einen Anschlag einem von zwei Akkorden zu (Tonklassen-Listen); 'A' | 'B' | null */
export function classifyAB(chroma, pcsA, pcsB) {
  const total = chroma.reduce((a, b) => a + b, 0) || 1;
  const share = (pcs) => pcs.reduce((a, p) => a + chroma[p], 0) / total;
  // Gemeinsame Töne zählen für beide; entscheidend sind die unterschiedlichen
  const onlyA = pcsA.filter((p) => !pcsB.includes(p));
  const onlyB = pcsB.filter((p) => !pcsA.includes(p));
  const a = onlyA.reduce((x, p) => x + chroma[p], 0), b = onlyB.reduce((x, p) => x + chroma[p], 0);
  const sa = share(pcsA), sb = share(pcsB);
  if (Math.max(sa, sb) < 0.5) return null;
  if (a > b * 1.4 && sa >= 0.5) return 'A';
  if (b > a * 1.4 && sb >= 0.5) return 'B';
  return null;
}

/** Zählt saubere Wechsel in einer Folge von Zuordnungen */
export function countChanges(labels) {
  let n = 0;
  for (let i = 1; i < labels.length; i++) if (labels[i] && labels[i - 1] && labels[i] !== labels[i - 1]) n++;
  return n;
}

// ---------- Tempoverlauf ----------

/**
 * Tempo über die Zeit aus den Abständen erkannter Anschläge (Fenster 8 s, Schritt 4 s).
 * hintBpm: erwartetes Tempo; damit werden Achtel- oder Halbe-Abstände auf das richtige Tempo umgerechnet.
 */
export function tempoCurve(buf, sr, hintBpm = null) {
  // Bei durchgehendem Spiel klingt fast immer etwas: als Rauschen nur die leisesten 5 % nehmen
  const floor = noiseFloor(buf, sr, 0, buf.length, 0.05);
  const times = detectOnsets(buf, sr, { absMin: Math.max(0.0004, floor * 2), relMin: 0.05, ratio: 1.5, minGapMs: 150 }).map((o) => o / sr);
  const total = buf.length / sr;
  const out = [];
  for (let s = 0; s + 8 <= total + 0.01; s += 4) {
    const iv = [];
    for (let i = 1; i < times.length; i++) {
      if (times[i] < s || times[i] > s + 8) continue;
      const d = times[i] - times[i - 1];
      if (d >= 0.18 && d <= 1.6) iv.push(d);
    }
    if (iv.length < 4) continue;
    iv.sort((a, b) => a - b);
    // Mittelwert des mittleren Drittels: robust gegen Ausreißer, genauer als der Median
    const mid = iv.slice(Math.floor(iv.length / 3), Math.ceil((iv.length * 2) / 3));
    let bpm = 60 / (mid.reduce((a, b) => a + b, 0) / mid.length);
    if (hintBpm) {
      while (bpm > hintBpm * 1.45) bpm /= 2;
      while (bpm < hintBpm / 1.45) bpm *= 2;
    } else {
      while (bpm > 140) bpm /= 2;
      while (bpm < 55) bpm *= 2;
    }
    out.push({ t: s + 4, bpm });
  }
  return out;
}
