// Begleitung: Schlag- und Zupfmuster, Zeitplan aus dem Liedblatt, Abspielen mit dem Gitarrenklang

import { STRUM_PATTERNS } from './theory.js';
import { getShape } from './shapes.js';
import { parseChord, isChord } from './chords.js';
import { OPEN_STRINGS } from './audio/dsp.js';
import { shapeMidis } from './audio/guitar.js';

/**
 * Zupfmuster in Achteln. Einträge je Feld: Liste von Rollen.
 * 'B' = Grundton-Bass, 'W' = Wechselbass, 3/4/5 = G-, H-, hohe e-Saite (Saitenindex von der tiefen E aus)
 */
export const PICK_PATTERNS = [
  { id: 'arpeggio', name: 'Arpeggio p-i-m-a', meter: '4/4', grid: [['B'], [3], [4], [5], [4], [3], [4], [5]], fingers: 'p i m a m i m a',
    use: 'Ruhig fließend, Balladen. Daumen (p) auf dem Bass, dann Zeige-, Mittel-, Ringfinger auf G, H, e' },
  { id: 'wechselbass', name: 'Wechselbass', meter: '4/4', grid: [['B'], [[3, 4, 5]], ['W'], [[3, 4, 5]], ['B'], [[3, 4, 5]], ['W'], [[3, 4, 5]]], fingers: 'p (i m a) p (i m a)',
    use: 'Folk und Country: Daumen im Wechsel auf zwei Basssaiten, dazwischen die drei hohen Saiten zusammen' },
  { id: 'travis', name: 'Travis-Picking', meter: '4/4', grid: [['B', 5], [4], ['W'], [3], ['B'], [4], ['W'], [3]], fingers: 'p+a m p i p m p i',
    use: 'Klassisches Fingerstyle-Muster: Daumen spielt gleichmäßig Viertel, die Finger füllen dazwischen' },
  { id: 'walzer-zupf', name: 'Walzer gezupft', meter: '3/4', grid: [['B'], [], [[3, 4, 5]], [], [[3, 4, 5]], []], fingers: 'p (i m a) (i m a)',
    use: 'Dreivierteltakt: Bass auf 1, Akkord auf 2 und 3' },
  { id: 'sechsachtel-zupf', name: 'Sechsachtel gezupft', meter: '6/8', grid: [['B'], [3], [4], [5], [4], [3]], fingers: 'p i m a m i',
    use: 'Wiegend, viele Folk-Balladen' },
  { id: 'arpeggio-auf', name: 'Arpeggio aufwärts', meter: '4/4', grid: [['B'], [3], [4], [5], [3], [4], [5], [4]], fingers: 'p i m a i m a m',
    use: 'Klassische Liedbegleitung, läuft gleichmäßig nach oben' },
  { id: 'klavier', name: 'Klavier-Stil', meter: '4/4', grid: [['B'], [], [3, 4, 5], [], ['W'], [], [3, 4, 5], []], fingers: 'p (ima) p (ima)',
    use: 'Ruhig, lässt viel Platz für den Gesang: Bass, Akkord, Wechselbass, Akkord' },
  { id: 'travis-pinch', name: 'Travis mit Pinch auf 1 und 3', meter: '4/4', grid: [['B', 5], [4], ['W'], [3], ['B', 5], [4], ['W'], [3]], fingers: 'p+a m p i p+a m p i',
    use: 'Fingerstyle wie bei vielen Folk-Klassikern: Daumen und Ringfinger gleichzeitig (Pinch)' },
  { id: 'rueckwaerts', name: 'Arpeggio rückwärts', meter: '4/4', grid: [['B'], [5], [4], [3], ['W'], [5], [4], [3]], fingers: 'p a m i p a m i',
    use: 'Abwechslung zum normalen Arpeggio, klingt fallend' },
  { id: 'arpeggio34', name: 'Walzer-Arpeggio', meter: '3/4', grid: [['B'], [3], [4], [5], [4], [3]], fingers: 'p i m a m i',
    use: 'Dreivierteltakt, fließend; auch für klassische Stücke' },
  { id: 'klassik16', name: 'Klassisches Arpeggio (Sechzehntel)', meter: '4/4', grid: [['B'], [3], [4], [3], [5], [3], [4], [3], ['W'], [3], [4], [3], [5], [3], [4], [3]],
    fingers: 'p i m i a i m i', use: 'Klassische Gitarre, Etüden-Stil. Erst langsam, Tempo 50–60' }
];

/** Zusätzliche Schlagmuster. Zeichen: D ab, U auf, A betonter Abschlag, X Chuck, M Palm Muting, B Bass, W Wechselbass */
export const MORE_STRUM_PATTERNS = [
  { id: 'folkrock', name: 'Folk-Rock (Betonung 2 und 4)', meter: '4/4', grid: ['D', '', 'A', 'U', 'D', 'U', 'A', 'U'], use: 'Rock-Balladen, treibend mit Backbeat' },
  { id: 'synkope', name: 'Synkope', meter: '4/4', grid: ['D', '', 'D', 'U', '', 'U', '', 'U'], use: 'Luftig, sommerlich; die „und“ nach der 3 trägt' },
  { id: 'halbe', name: 'Halbe mit Ausklingen', meter: '4/4', grid: ['D', '', '', '', 'D', '', '', ''], use: 'Sehr langsame Balladen, Einstieg in neue Lieder' },
  { id: 'boomchick', name: 'Bass-Strum (Boom-Chick)', meter: '4/4', grid: ['B', '', 'D', '', 'W', '', 'D', ''], use: 'Country und Folk: Basssaite, Akkord, Wechselbass, Akkord' },
  { id: 'boomchicka', name: 'Bass-Strum mit Aufschlag', meter: '4/4', grid: ['B', '', 'D', 'U', 'W', '', 'D', 'U'], use: 'Wie Boom-Chick, lebendiger durch die Aufschläge' },
  { id: 'walzer-bass', name: 'Bass-Walzer', meter: '3/4', grid: ['B', '', 'D', '', 'D', ''], use: 'Volkslieder und Country-Walzer: Bass auf 1, Akkord auf 2 und 3' },
  { id: 'ballade68', name: '6/8-Ballade', meter: '6/8', grid: ['A', '', '', 'D', 'U', ''], use: 'Ruhige 6/8-Lieder: betonte 1, leichter Schlag auf 4' },
  { id: 'power8', name: 'Powerchords mit Palm Muting', meter: '4/4', grid: ['A', 'M', 'M', 'M', 'A', 'M', 'M', 'M'], voicing: 'power', use: 'E-Gitarre, Rock: gedämpfte Achtel, offene Schläge auf 1 und 3' },
  { id: 'funk16', name: 'Funk (Sechzehntel)', meter: '4/4', grid: ['D', '', 'X', 'U', '', 'U', 'D', '', 'X', '', 'D', 'U', '', 'U', 'X', 'U'], use: 'Fortgeschritten, eher E-Gitarre: Hand läuft in Sechzehnteln durch, × = abgedämpft' }
];

export const ALL_PATTERNS = [
  ...STRUM_PATTERNS.map((p) => ({ ...p, kind: 'schlag' })),
  ...MORE_STRUM_PATTERNS.map((p) => ({ ...p, kind: 'schlag' })),
  ...PICK_PATTERNS.map((p) => ({ ...p, kind: 'zupf' }))
];

/** Eingebaute und eigene Muster zusammen */
export function allPatterns(custom = []) {
  return [...ALL_PATTERNS, ...custom.map((p) => ({ ...p, custom: true }))];
}

/** Powerchord (Grundton, Quinte, Oktave) auf E- oder A-Saite, möglichst tief */
export function powerVoicing(chord, capo = 0) {
  const c = parseChord(chord);
  if (!c) return null;
  const pc = ROOT_PC[c.root];
  const onE = (pc - 4 + 12) % 12, onA = (pc - 9 + 12) % 12;
  const frets = onE <= onA ? [onE, onE + 2, onE + 2, -1, -1, -1] : [-1, onA, onA + 2, onA + 2, -1, -1];
  const midis = shapeMidis(frets, capo);
  const bass = midis.findIndex((m) => m != null);
  return { shape: { frets }, midis, bass, alt: bass };
}

const ROOT_PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, H: 11 };

/** Griff, Töne je Saite und Basssaiten (Grundton + Wechselbass) zu einem Akkord */
export function voicing(chord, capo = 0) {
  if (!isChord(chord)) return null;
  const shape = getShape(chord);
  if (!shape) return null;
  const midis = shapeMidis(shape.frets, capo);
  const c = parseChord(chord);
  const bassPc = ROOT_PC[c.bass || c.root];
  // Grundton: tiefste gespielte Saite (0–2) mit passendem Ton, sonst tiefste gespielte Saite
  let bass = [0, 1, 2].find((s) => midis[s] != null && (((midis[s] - capo) % 12) + 12) % 12 === bassPc);
  if (bass === undefined) bass = midis.findIndex((m) => m != null);
  // Wechselbass: nächste gespielte tiefe Saite (bei E-Saite die D-Saite)
  const altPref = bass === 0 ? [2, 1] : bass === 1 ? [2, 3] : [3, 1];
  let alt = altPref.find((s) => midis[s] != null);
  if (alt === undefined) alt = bass;
  return { shape, midis, bass, alt };
}

/** Rollen eines Musterfelds in konkrete Saiten auflösen */
export function stringsFor(cell, v) {
  const out = [];
  for (const r of cell) {
    if (r === 'B') out.push(v.bass);
    else if (r === 'W') out.push(v.alt);
    else if (Array.isArray(r)) out.push(...r);
    else out.push(r);
  }
  return [...new Set(out)].filter((s) => v.midis[s] != null);
}

/** Schläge pro Takt je Taktart (Achtel-Raster: 2 Felder pro Viertel, bei 6/8 1 Feld pro Achtel) */
export function meterBeats(meter) {
  if (meter === '3/4') return { beats: 3, stepsPerBeat: 2 };
  if (meter === '6/8') return { beats: 6, stepsPerBeat: 1 };
  return { beats: 4, stepsPerBeat: 2 };
}

/**
 * Zeitplan aus dem Liedblatt: jede Akkordstelle bekommt eine Anzahl Schläge.
 * Regel: Eine Zeile dauert `barsPerLine` Takte; hat sie mehr Akkorde, bekommt jeder mindestens einen halben Takt.
 * Rückgabe: [{ line, seg, chord, beats }]
 */
export function buildTimeline(parsed, { barsPerLine = 2, meter = '4/4' } = {}) {
  const { beats } = meterBeats(meter);
  const out = [];
  parsed.lines.forEach((l, li) => {
    if (l.type !== 'lyrics' && l.type !== 'chords') return;
    const chords = (l.segments || []).map((s, si) => ({ chord: s.chord, si })).filter((x) => x.chord && isChord(x.chord));
    if (!chords.length) return;
    const minBeats = Math.max(1, Math.round(beats / 2));
    const total = Math.max(barsPerLine * beats, chords.length * minBeats);
    // Gleichmäßig verteilen, auf ganze Schläge gerundet, Rest an den letzten Akkord
    const each = Math.max(minBeats, Math.floor(total / chords.length / minBeats) * minBeats);
    chords.forEach((c, i) => {
      const b = i === chords.length - 1 ? Math.max(each, total - each * (chords.length - 1)) : each;
      out.push({ line: li, seg: c.si, chord: c.chord, beats: b });
    });
  });
  return out;
}

/**
 * Spielt Muster über einen Zeitplan. Vorausplanung wie beim Metronom.
 * events: [{chord (klingend), beats, ...}], pattern: aus ALL_PATTERNS, onEvent(i) beim Akkordwechsel
 */
export class Accompanist {
  constructor(guitar) { this.guitar = guitar; this.timer = null; this.timeouts = []; }

  start({ events, pattern, bpm, meter = '4/4', countIn = true, loop = false, onEvent, onStep, onEnd }) {
    this.stop();
    const ctx = this.guitar.ensure();
    const { beats: perBar } = meterBeats(meter);
    // Achtel- oder Sechzehntelraster: Felder pro Schlag ergeben sich aus der Musterlänge
    const stepsPerBeat = Math.max(1, Math.round(pattern.grid.length / perBar));
    const stepDur = 60 / bpm / stepsPerBeat;
    const gridLen = pattern.grid.length;
    // Schrittliste: je Schritt Akkord und Musterfeld
    const steps = [];
    events.forEach((e, ei) => {
      const n = e.beats * stepsPerBeat;
      for (let k = 0; k < n; k++) steps.push({ ei, first: k === 0 });
    });
    if (!steps.length) return;
    const voicings = events.map((e) => (pattern.voicing === 'power' ? powerVoicing(e.chord, e.capo || 0) : voicing(e.chord, e.capo || 0)) || null);
    let t0 = ctx.currentTime + 0.15;
    // Einzählen: ein Takt Klicks
    if (countIn) {
      for (let b = 0; b < perBar; b++) this.click(t0 + b * stepDur * stepsPerBeat, b === 0);
      t0 += perBar * stepDur * stepsPerBeat;
    }
    let i = 0;
    let round = 0;
    const schedule = () => {
      const ahead = ctx.currentTime + 0.2;
      while (true) {
        const time = t0 + (round * steps.length + i) * stepDur;
        if (time >= ahead) break;
        const st = steps[i];
        const v = voicings[st.ei];
        const cell = pattern.grid[i % gridLen];
        if (v && cell && (!Array.isArray(cell) || cell.length)) {
          if (pattern.kind === 'zupf') {
            const ss = stringsFor(cell, v);
            ss.forEach((s) => this.guitar.pluck(time, s, v.midis[s], { gain: s <= 2 ? 0.75 : 0.6, variant: 'soft' }));
          } else if (cell === 'D' || cell === 'U') this.guitar.strum(time, v.midis, cell);
          else if (cell === 'A') this.guitar.strum(time, v.midis, 'D', { gain: 0.95 });
          else if (cell === 'X') this.guitar.chuck(time, v.midis);
          else if (cell === 'M') this.guitar.strum(time, v.midis, 'D', { gain: 0.7, variant: 'palm', only: [v.bass, v.bass + 1, v.bass + 2] });
          else if (cell === 'B') this.guitar.pluck(time, v.bass, v.midis[v.bass], { gain: 0.85 });
          else if (cell === 'W') this.guitar.pluck(time, v.alt, v.midis[v.alt], { gain: 0.8 });
        }
        if (onStep) {
          const si = i % gridLen;
          this.timeouts.push(setTimeout(() => onStep(si), Math.max(0, (time - ctx.currentTime) * 1000)));
        }
        if (this.timeouts.length > 400) this.timeouts = this.timeouts.slice(-200);
        if (st.first) {
          const ei = st.ei;
          this.timeouts.push(setTimeout(() => onEvent?.(ei), Math.max(0, (time - ctx.currentTime) * 1000)));
        }
        i++;
        if (i >= steps.length) {
          if (!loop) {
            const endIn = Math.max(0, (time + stepDur * 2 - ctx.currentTime) * 1000);
            this.timeouts.push(setTimeout(() => { this.stop(); onEnd?.(); }, endIn));
            clearInterval(this.timer);
            this.timer = null;
            return;
          }
          i = 0; round++;
        }
      }
    };
    this.timer = setInterval(schedule, 30);
    schedule();
  }

  click(time, accent) {
    const ctx = this.guitar.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1500 : 1100;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.5, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(time); o.stop(time + 0.06);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.timeouts.forEach(clearTimeout);
    this.timeouts = [];
    this.guitar.silence();
  }
}

/** Tab-Darstellung eines Zupfmusters für einen Akkord (6 Zeilen, hohe e oben) */
export function patternTab(pattern, chord) {
  const v = voicing(chord);
  if (!v) return '';
  const names = ['E', 'A', 'D', 'G', 'H', 'e'];
  const rows = names.map(() => []);
  pattern.grid.forEach((cell) => {
    const ss = cell.length ? stringsFor(cell, v) : [];
    for (let s = 0; s < 6; s++) {
      const f = v.shape.frets[s];
      rows[s].push(ss.includes(s) ? String(f).padEnd(2, '-') : '--');
    }
  });
  return rows.map((r, s) => names[s] + '|' + r.join('-') + '|').reverse().join('\n');
}

export { OPEN_STRINGS };
