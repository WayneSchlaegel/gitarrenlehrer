// Liest Liedtexte mit Akkorden in zwei Formaten:
// 1) Akkorde über dem Text (wie bei Ultimate Guitar)
// 2) ChordPro: [G]Akkorde [D7]im Text, {title: ...}
// Ergebnis: Liste von Zeilen, jede Zeile besteht aus Segmenten {chord, text}.

import { isChord, isChordLineFiller } from './chords.js';

const SECTION_WORDS =
  /^(intro|outro|vers|verse|strophe|refrain|chorus|pre-?chorus|bridge|interlude|zwischenspiel|solo|instrumental|coda|ende|ending|tag|hook)\b/i;

const DIRECTIVE_RE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i;

// Tabulatur-Zeilen wie "e|---0---3---|" oder "B|-1-----|"
const TAB_STRING_RE = /^\s*[A-Ga-g][#b]?\s*[|:][^A-Za-z]*(?:[hpbrsxv~][^A-Za-z]*)*$/;
const TAB_BARE_RE = /^\s*\|?[-0-9hpbrsx\/\\~|()*.^ ]+\|?\s*$/;

/** Ist die Zeile Teil einer Tabulatur? */
export function isTabLine(line) {
  const dashes = (line.match(/-/g) || []).length;
  if (dashes < 4) return false;
  return TAB_STRING_RE.test(line) || (TAB_BARE_RE.test(line) && dashes >= 8);
}

// Angaben, die Ultimate Guitar und andere Seiten über das Liedblatt schreiben
const CAPO_RE = /^\s*capo\s*[:\-]?\s*(?:on\s*|bund\s*)?(\d{1,2})(?!\d)/i;
const NO_CAPO_RE = /^\s*capo\s*[:\-]?\s*(no capo|none|kein|ohne)/i;
const TUNING_RE = /^\s*(tuning|stimmung)\s*:\s*(.+)$/i;
const KEY_RE = /^\s*(key|tonart)\s*:\s*([A-H][#b]?m?)\s*$/i;

function tokens(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

/** Zeile besteht nur aus Akkorden (und Taktstrichen o. Ä.)? */
export function isChordLine(line) {
  const t = tokens(line);
  if (!t.length) return false;
  let chords = 0;
  for (const tok of t) {
    const clean = tok.replace(/^\(|\)$/g, '');
    if (isChord(clean)) chords++;
    else if (!isChordLineFiller(tok)) return false;
  }
  return chords > 0;
}

/** Abschnittsüberschrift wie [Chorus], Strophe 1:, Refrain */
export function sectionName(line) {
  const t = line.trim();
  const bracket = /^\[([^\]]+)\]$/.exec(t);
  if (bracket && !isChord(bracket[1])) return bracket[1].trim();
  const colon = /^([^:]{1,30}):\s*$/.exec(t);
  if (colon && SECTION_WORDS.test(colon[1].trim())) return colon[1].trim();
  if (SECTION_WORDS.test(t) && t.length <= 24 && !/[.,!?]/.test(t)) return t;
  return null;
}

/** Akkordpositionen (Spalte) einer Akkordzeile */
function chordPositions(line) {
  const res = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) {
    const clean = m[0].replace(/^\(|\)$/g, '');
    if (isChord(clean)) res.push({ col: m.index, chord: clean });
  }
  return res;
}

/** Kombiniert Akkordzeile und Textzeile zu Segmenten */
export function mergeChordAndLyric(chordLine, lyric) {
  const pos = chordPositions(chordLine);
  const segs = [];
  const width = Math.max(lyric.length, ...pos.map((p) => p.col + 1));
  const text = lyric.padEnd(width, ' ');
  if (pos.length === 0 || pos[0].col > 0) {
    const end = pos.length ? pos[0].col : text.length;
    segs.push({ chord: null, text: text.slice(0, end) });
  }
  pos.forEach((p, i) => {
    const end = i + 1 < pos.length ? pos[i + 1].col : text.length;
    segs.push({ chord: p.chord, text: text.slice(p.col, end) });
  });
  // Überzählige Leerzeichen am Ende entfernen
  const last = segs[segs.length - 1];
  if (last) last.text = last.text.replace(/\s+$/, '');
  return segs;
}

function chordOnlyLine(line) {
  return chordPositions(line).map((p) => ({ chord: p.chord, text: '' }));
}

/** ChordPro-Zeile: "Die Ge[D7]danken" */
function parseInlineLine(line) {
  const segs = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let current = { chord: null, text: '' };
  let m;
  while ((m = re.exec(line))) {
    current.text += line.slice(last, m.index);
    if (current.chord !== null || current.text) segs.push(current);
    current = { chord: m[1].trim(), text: '' };
    last = re.lastIndex;
  }
  current.text += line.slice(last);
  segs.push(current);
  return segs;
}

function hasInlineChords(line) {
  const re = /\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(line))) if (isChord(m[1].trim())) return true;
  return false;
}

/**
 * Hauptfunktion
 * @returns {{meta: object, lines: Array<{type:string, segments?:Array, text?:string}>, chords: string[]}}
 */
export function parseSong(raw = '') {
  const meta = {};
  const lines = [];
  const src = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/\u00a0/g, ' ')
    .replace(/\[\/?(ch|tab)\]/gi, '') // Ultimate-Guitar-Kennzeichnungen
    .split('\n');

  for (let i = 0; i < src.length; i++) {
    const line = src[i].replace(/\s+$/, '');
    const trimmed = line.trim();

    if (isTabLine(line)) {
      const prev = lines[lines.length - 1];
      if (prev && prev.type === 'tab') prev.lines.push(line);
      else lines.push({ type: 'tab', lines: [line] });
      continue;
    }

    const capo = CAPO_RE.exec(trimmed);
    if (capo) { meta.capo = parseInt(capo[1], 10); continue; }
    if (NO_CAPO_RE.test(trimmed)) { meta.capo = 0; continue; }
    const tuning = TUNING_RE.exec(trimmed);
    if (tuning) {
      meta.tuning = tuning[2].trim();
      if (!/^(e a d g b e|standard|eadgbe|e-a-d-g-b-e)/i.test(meta.tuning)) lines.push({ type: 'comment', text: 'Stimmung: ' + meta.tuning });
      continue;
    }
    const key = KEY_RE.exec(trimmed);
    if (key) { meta.key = key[2]; continue; }

    if (!trimmed) {
      if (lines.length && lines[lines.length - 1].type !== 'empty') lines.push({ type: 'empty' });
      continue;
    }

    const dir = DIRECTIVE_RE.exec(trimmed);
    if (dir) {
      const key = dir[1].toLowerCase();
      const val = dir[2] || '';
      if (key === 'title' || key === 't') meta.title = val;
      else if (key === 'artist' || key === 'subtitle' || key === 'st') meta.artist = val;
      else if (key === 'key') meta.key = val;
      else if (key === 'capo') meta.capo = parseInt(val, 10) || 0;
      else if (key === 'tempo') meta.tempo = parseInt(val, 10) || null;
      else if (key === 'comment' || key === 'c' || key === 'ci') lines.push({ type: 'comment', text: val });
      else if (key === 'start_of_chorus' || key === 'soc') lines.push({ type: 'section', text: val || 'Refrain' });
      else if (key === 'start_of_verse' || key === 'sov') lines.push({ type: 'section', text: val || 'Strophe' });
      else if (key === 'start_of_bridge' || key === 'sob') lines.push({ type: 'section', text: val || 'Bridge' });
      continue;
    }

    const sec = sectionName(trimmed);
    if (sec) {
      lines.push({ type: 'section', text: sec });
      continue;
    }

    if (hasInlineChords(line)) {
      lines.push({ type: 'lyrics', segments: parseInlineLine(line) });
      continue;
    }

    if (isChordLine(line)) {
      const next = src[i + 1];
      const nextUsable =
        next !== undefined &&
        next.trim() &&
        !isChordLine(next) &&
        !sectionName(next.trim()) &&
        !DIRECTIVE_RE.test(next.trim()) &&
        !hasInlineChords(next);
      if (nextUsable) {
        lines.push({ type: 'lyrics', segments: mergeChordAndLyric(line, next.replace(/\s+$/, '')) });
        i++;
      } else {
        lines.push({ type: 'chords', segments: chordOnlyLine(line) });
      }
      continue;
    }

    lines.push({ type: 'lyrics', segments: [{ chord: null, text: line }] });
  }

  while (lines.length && lines[lines.length - 1].type === 'empty') lines.pop();

  const chords = [];
  for (const l of lines) for (const s of l.segments || []) if (s.chord && isChord(s.chord)) chords.push(s.chord);

  return { meta, lines, chords };
}

/** Wandelt geparste Zeilen in ChordPro-Text um (für Export) */
export function toChordPro(parsed, song = {}) {
  const out = [];
  if (song.title) out.push(`{title: ${song.title}}`);
  if (song.artist) out.push(`{artist: ${song.artist}}`);
  if (song.capo) out.push(`{capo: ${song.capo}}`);
  if (song.tempo) out.push(`{tempo: ${song.tempo}}`);
  if (out.length) out.push('');
  for (const l of parsed.lines) {
    if (l.type === 'empty') out.push('');
    else if (l.type === 'section') out.push(`[${l.text}]`.replace(/^\[(.*)\]$/, '{comment: $1}'));
    else if (l.type === 'comment') out.push(`{comment: ${l.text}}`);
    else if (l.type === 'tab') out.push('{start_of_tab}', ...l.lines, '{end_of_tab}');
    else out.push(l.segments.map((s) => (s.chord ? `[${s.chord}]` : '') + s.text).join(''));
  }
  return out.join('\n');
}
