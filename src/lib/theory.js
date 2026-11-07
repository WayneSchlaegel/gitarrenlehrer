// Theorie für Liedbegleitung: Tonarten, Stufen, Capo, Schlagmuster

import { parseChord, canonicalChord, transposeChord } from './chords.js';

const IDX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, H: 11 };
export const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Leitereigene Dreiklänge in Dur: Abstand zum Grundton, Art, Stufenzeichen
const DIATONIC = [
  { step: 0, q: '', roman: 'I', role: 'Tonika – Heimat, hier beginnt und endet das Lied meist' },
  { step: 2, q: 'm', roman: 'ii', role: 'Subdominant-Ersatz, führt oft zur V' },
  { step: 4, q: 'm', roman: 'iii', role: 'seltener, weich, Übergang' },
  { step: 5, q: '', roman: 'IV', role: 'Subdominante – Aufbruch, öffnet' },
  { step: 7, q: '', roman: 'V', role: 'Dominante – Spannung, will zurück zur I' },
  { step: 9, q: 'm', roman: 'vi', role: 'Moll-Parallele – traurige Farbe derselben Tonart' },
  { step: 11, q: 'dim', roman: 'vii°', role: 'selten in Begleitungen' }
];

function quality(suffix) {
  if (/^(m|min|-)(?!aj)/.test(suffix)) return 'm';
  if (/^(dim|°)/.test(suffix)) return 'dim';
  return '';
}

/** Leitereigene Akkorde einer Dur-Tonart */
export function keyChords(key) {
  const k = IDX[key];
  return DIATONIC.map((d) => ({ ...d, chord: KEY_NAMES[(k + d.step) % 12] + d.q }));
}

/** Stufe eines Akkords in einer Dur-Tonart (oder null, wenn leiterfremd) */
export function degreeOf(chord, key) {
  const c = parseChord(chord);
  if (!c) return null;
  const step = (IDX[c.root] - IDX[key] + 12) % 12;
  const q = quality(c.suffix);
  const d = DIATONIC.find((x) => x.step === step && x.q === q);
  // I7: Dominantseptakkord auf der Tonika führt zur IV (Zwischendominante)
  if (d && d.roman === 'I' && /^7/.test(c.suffix)) return 'I7 (führt zur IV)';
  if (d) return d.roman + (/7/.test(c.suffix) && d.roman === 'V' ? '7' : '');
  // Häufige leiterfremde Akkorde benennen
  if (step === 10 && q === '') return '♭VII';
  if (step === 2 && q === '') return 'II (Zwischendominante)';
  if (step === 4 && q === '') return 'III (Zwischendominante)';
  if (step === 5 && q === 'm') return 'iv (Moll-Subdominante)';
  return null;
}

/** Ermittelt die wahrscheinlichste Dur-Tonart (bzw. ihre Moll-Parallele) aus einer Akkordfolge */
export function detectKey(chords) {
  const list = chords.map((c) => canonicalChord(c)).filter((c) => parseChord(c));
  if (!list.length) return null;
  let best = null;
  for (const key of KEY_NAMES) {
    let score = 0;
    list.forEach((c, i) => {
      const d = degreeOf(c, key);
      if (!d) score -= 1;
      else if (d.includes('(')) score += 0.3;
      else score += 1;
      const isTonic = d === 'I';
      const isRelMinor = d === 'vi';
      if (i === 0 && (isTonic || isRelMinor)) score += 1.5;
      if (i === list.length - 1 && (isTonic || isRelMinor)) score += 1.5;
    });
    if (!best || score > best.score) best = { key, score };
  }
  const first = list[0], last = list[list.length - 1];
  const relMinor = KEY_NAMES[(IDX[best.key] + 9) % 12] + 'm';
  const minorish = (degreeOf(first, best.key) === 'vi') || (degreeOf(last, best.key) === 'vi' && degreeOf(first, best.key) !== 'I');
  const fit = list.filter((c) => { const d = degreeOf(c, best.key); return d && !d.includes('('); }).length / list.length;
  return { key: best.key, relMinor, minor: minorish, fit };
}

/** Capo-Tabelle: Griffform + Bund → klingender Akkord */
export function capoTable(shapes = ['C', 'A', 'G', 'E', 'D', 'Am', 'Em', 'Dm'], maxFret = 7) {
  return shapes.map((s) => ({
    shape: s,
    sounds: Array.from({ length: maxFret + 1 }, (_, f) => canonicalChord(transposeChord(s, f)))
  }));
}

/**
 * Schlagmuster: Raster in Achteln (8 Felder = 1 Takt 4/4, 6 = 3/4 oder 6/8)
 * 'D' = abwärts, 'U' = aufwärts, '' = Pause (Hand läuft trotzdem weiter), 'X' = abgedämpft (Chuck)
 */
export const STRUM_PATTERNS = [
  { id: 'viertel', name: 'Viertel abwärts', meter: '4/4', grid: ['D', '', 'D', '', 'D', '', 'D', ''], use: 'Einstieg, Balladen, wenn der Akkordwechsel noch hakt' },
  { id: 'basis', name: 'Grundmuster', meter: '4/4', grid: ['D', '', 'D', 'U', '', 'U', 'D', 'U'], use: 'Der Klassiker für Pop, Folk und Lagerfeuer' },
  { id: 'achtel', name: 'Durchgehende Achtel', meter: '4/4', grid: ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'], use: 'Treibend, Rock und Country' },
  { id: 'chuck', name: 'Mit Chuck auf 2 und 4', meter: '4/4', grid: ['D', '', 'X', 'U', 'D', 'U', 'X', 'U'], use: 'Funky, Reggae-nah, betont den Backbeat' },
  { id: 'walzer', name: 'Walzer', meter: '3/4', grid: ['D', '', 'D', 'U', 'D', 'U'], use: 'Dreivierteltakt, z. B. „Die Gedanken sind frei“, „Amazing Grace“' },
  { id: 'sechsachtel', name: 'Sechsachtel', meter: '6/8', grid: ['D', '', 'U', 'D', 'U', 'U'], use: 'Wiegend, viele Folk-Balladen' }
];

export function countLabels(meter, n) {
  const beats = meter === '3/4' ? 3 : meter === '6/8' ? 6 : 4;
  if (meter === '6/8' && n <= 6) return ['1', '2', '3', '4', '5', '6'].slice(0, n);
  const per = Math.max(1, Math.round(n / beats));
  const sub = per === 4 ? ['', 'e', '+', 'a'] : per === 2 ? ['', '+'] : per === 3 ? ['', '+', 'a'] : [''];
  const out = [];
  for (let b = 0; b < beats; b++) for (let k = 0; k < per; k++) out.push(k === 0 ? String(b + 1) : sub[k]);
  return out.slice(0, n);
}

/** CAGED: fünf Griffformen für denselben Akkord, hier C-Dur. Bünde tief E → hohe e. */
export const CAGED_C = [
  { form: 'C-Form', fret: 'offen', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  { form: 'A-Form', fret: '3. Bund', frets: [-1, 3, 5, 5, 5, 3], fingers: [0, 1, 3, 3, 3, 1], barre: 3 },
  { form: 'G-Form', fret: '5. Bund', frets: [-1, -1, 5, 5, 5, 8], fingers: [0, 0, 1, 1, 1, 4] },
  { form: 'E-Form', fret: '8. Bund', frets: [8, 10, 10, 9, 8, 8], fingers: [1, 3, 4, 2, 1, 1], barre: 8 },
  { form: 'D-Form', fret: '10. Bund', frets: [-1, -1, 10, 12, 13, 12], fingers: [0, 0, 1, 2, 4, 3] }
];
