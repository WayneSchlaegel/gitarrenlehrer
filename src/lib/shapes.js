// Griffbilder: Bünde von tiefer E- bis hoher e-Saite, -1 = nicht anschlagen, 0 = leer
// fingers: 0 = kein Finger, 1-4 = Zeige- bis kleiner Finger

import { parseChord, canonicalChord } from './chords.js';

const OPEN = {
  C: { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  Cmaj7: { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  C7: { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  Cadd9: { frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 2, 1, 0, 3, 0] },
  D: { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  Dm: { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  D7: { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  Dm7: { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
  Dmaj7: { frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] },
  Dsus2: { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0] },
  Dsus4: { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3] },
  E: { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  E7: { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  Em7: { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  Esus4: { frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0] },
  F: { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: 1 },
  Fmaj7: { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  G: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  G7: { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  Gsus4: { frets: [3, 3, 0, 0, 1, 3], fingers: [2, 3, 0, 0, 1, 4] },
  A: { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  Am: { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  A7: { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  Am7: { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  Amaj7: { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] },
  Asus2: { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0] },
  Asus4: { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0] },
  B7: { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] }
};

// Barré-Vorlagen relativ zum Barré-Bund (E-Form: Grundton auf tiefer E-Saite, A-Form: auf A-Saite)
const E_FORM = {
  '': [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0]
};
const A_FORM = {
  '': [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  '7': [-1, 0, 2, 0, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
  sus2: [-1, 0, 2, 2, 0, 0],
  sus4: [-1, 0, 2, 2, 3, 0]
};
const ROOT_IDX = { C: 0, 'C#': 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };

/** Reduziert den Akkordzusatz auf eine Grundform, für die es eine Vorlage gibt */
function simplifySuffix(suffix) {
  const s = suffix.replace(/[()]/g, '');
  if (/^(m|min|-)7/.test(s)) return 'm7';
  if (/^(m|min|-)(?!aj)/.test(s)) return 'm';
  if (/^(maj7|M7|maj9|maj)/.test(s)) return 'maj7';
  if (/^sus2/.test(s)) return 'sus2';
  if (/^sus/.test(s)) return 'sus4';
  if (/^(7|9|11|13)/.test(s)) return '7';
  return '';
}

function fingersFor(frets, barre) {
  // einfache Fingerverteilung: Barré = 1, Rest nach Bund und Saite aufsteigend
  const out = frets.map(() => 0);
  let next = barre ? 2 : 1;
  const notes = frets
    .map((f, s) => ({ f, s }))
    .filter((n) => n.f > 0 && !(barre && n.f === barre))
    .sort((a, b) => a.f - b.f || a.s - b.s);
  for (const n of notes) out[n.s] = Math.min(4, next++);
  if (barre) frets.forEach((f, s) => { if (f === barre) out[s] = 1; });
  return out;
}

function barreShape(root, suffix) {
  const kind = simplifySuffix(suffix);
  const idx = ROOT_IDX[root];
  const candidates = [];
  const eFret = (idx - 4 + 12) % 12;
  const aFret = (idx - 9 + 12) % 12;
  if (E_FORM[kind]) candidates.push({ base: eFret, tpl: E_FORM[kind] });
  if (A_FORM[kind]) candidates.push({ base: aFret, tpl: A_FORM[kind] });
  if (!candidates.length) candidates.push({ base: aFret, tpl: A_FORM[''] });
  // Bund 0 wäre der offene Griff; sonst die tiefere Lage bevorzugen
  candidates.sort((a, b) => (a.base || 12) - (b.base || 12));
  const { base, tpl } = candidates[0];
  const b = base || 12;
  const frets = tpl.map((f) => (f < 0 ? -1 : f + b));
  return { frets, fingers: fingersFor(frets, b), barre: b, approx: kind !== suffix };
}

/** Liefert ein Griffbild für beliebige Akkorde (offen, sonst Barré) */
export function getShape(token) {
  const canon = canonicalChord(token);
  const c = parseChord(canon);
  if (!c) return null;
  const full = c.root + c.suffix;
  if (OPEN[full]) return { name: token, ...OPEN[full], approx: false };
  const kind = simplifySuffix(c.suffix);
  const simple = c.root + kind;
  if (OPEN[simple]) return { name: token, ...OPEN[simple], approx: true, shown: simple };
  const shape = barreShape(c.root, c.suffix);
  return { name: token, ...shape, shown: shape.approx ? simple : undefined };
}
