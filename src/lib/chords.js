// Akkord-Logik: erkennen, transponieren, Capo-Vorschläge, Anzeige-Notation

export const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const ROOT_INDEX = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, H: 11
};

const SUFFIX_RE = /^(?:maj|min|dim|aug|sus|add|m|M|[0-9]|\+|-|°|ø|\(|\)|#|b|\*)*$/;
const TOKEN_RE = /^([A-H])([#b]?)([^/\s]*)(?:\/([A-H])([#b]?))?$/;

/** Zerlegt einen Akkord in Grundton, Zusatz und Bass. Gibt null zurück, wenn es kein Akkord ist. */
export function parseChord(token) {
  if (!token) return null;
  const t = token.trim();
  const m = TOKEN_RE.exec(t);
  if (!m) return null;
  const [, r, acc, suffix, br, bacc] = m;
  if (!SUFFIX_RE.test(suffix)) return null;
  const root = r + acc;
  if (!(root in ROOT_INDEX)) return null;
  const bass = br ? br + (bacc || '') : null;
  if (bass && !(bass in ROOT_INDEX)) return null;
  return { root, suffix, bass };
}

export function isChord(token) {
  return parseChord(token) !== null;
}

/** Tokens, die in Akkordzeilen vorkommen dürfen, ohne Akkord zu sein */
export function isChordLineFiller(token) {
  return /^(\||\|\||\/|-+|x\d+|\d+x|N\.?C\.?|\(|\)|%|:\|\|?|\|\|?:|\.+)$/i.test(token);
}

const FLAT_KEYS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb (Dur)
const FLAT_MINOR_KEYS = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm Bbm Ebm

export function keyUsesFlats(chordToken) {
  const c = parseChord(chordToken);
  if (!c) return false;
  const idx = ROOT_INDEX[c.root];
  const minor = /^m(?!aj)/.test(c.suffix);
  return minor ? FLAT_MINOR_KEYS.has(idx) : FLAT_KEYS.has(idx);
}

function noteName(idx, useFlats) {
  return (useFlats ? FLATS : SHARPS)[((idx % 12) + 12) % 12];
}

/** Transponiert einen Akkord um n Halbtöne */
export function transposeChord(token, steps, useFlats = false) {
  const c = parseChord(token);
  if (!c) return token;
  if (!steps) return token;
  const root = noteName(ROOT_INDEX[c.root] + steps, useFlats);
  const bass = c.bass ? '/' + noteName(ROOT_INDEX[c.bass] + steps, useFlats) : '';
  return root + c.suffix + bass;
}

/** Anzeige: international (B) oder deutsch (H, B = Bb) */
export function displayChord(token, notation = 'international') {
  if (notation !== 'deutsch') return token;
  const c = parseChord(token);
  if (!c) return token;
  const conv = (n) => (n === 'B' ? 'H' : n === 'Bb' || n === 'A#' ? 'B' : n);
  return conv(c.root) + c.suffix + (c.bass ? '/' + conv(c.bass) : '');
}

/** Griffe, die für Begleitung als „leicht“ gelten (offene Akkorde) */
const EASY = new Set([
  'C', 'D', 'E', 'G', 'A', 'Am', 'Dm', 'Em',
  'C7', 'D7', 'E7', 'G7', 'A7', 'B7', 'Am7', 'Em7', 'Dm7',
  'Cmaj7', 'Dsus2', 'Dsus4', 'Asus2', 'Asus4', 'Esus4', 'Cadd9', 'Gsus4'
]);
const MEDIUM = new Set(['F', 'Fmaj7', 'Bm', 'Bm7', 'F#m', 'Gm', 'Cm', 'B', 'Bb', 'B7']);

// Kanonische Schreibweise für Griffe (so, wie Gitarristen sie meist nennen)
const CANON = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Normalisiert einen Akkord auf die übliche Griff-Schreibweise */
export function canonicalChord(token) {
  const c = parseChord(token);
  if (!c) return token;
  const b = c.bass ? '/' + CANON[ROOT_INDEX[c.bass]] : '';
  return CANON[ROOT_INDEX[c.root]] + c.suffix + b;
}

/** Vereinfacht Akkord für die Bewertung (Bass weglassen) */
function core(token) {
  const c = parseChord(token);
  if (!c) return token;
  return CANON[ROOT_INDEX[c.root]] + c.suffix;
}

export function difficulty(token) {
  const k = core(token);
  if (EASY.has(k)) return 0;
  if (MEDIUM.has(k)) return 2;
  return 3;
}

/**
 * Schlägt Capo-Positionen vor: Welche Bundposition ergibt die leichtesten Griffe,
 * damit das Lied in derselben Tonart klingt?
 * chords: Liste der klingenden Akkorde (bereits transponiert)
 */
export function capoSuggestions(chords, maxCapo = 7) {
  const unique = [...new Set(chords)];
  if (!unique.length) return [];
  const res = [];
  for (let capo = 0; capo <= maxCapo; capo++) {
    const shapes = unique.map((c) => canonicalChord(transposeChord(c, -capo, false)));
    const score = shapes.reduce((s, c) => s + difficulty(c), 0) + capo * 0.3;
    res.push({ capo, shapes, score });
  }
  return res.sort((a, b) => a.score - b.score).slice(0, 3);
}

export function semitoneLabel(n) {
  if (!n) return '±0';
  return (n > 0 ? '+' : '−') + Math.abs(n);
}
