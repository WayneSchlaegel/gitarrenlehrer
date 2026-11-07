// Lehrer: baut den Kontext (Profil, Gitarre, Liederbuch, aktuelles Lied) und spricht mit dem Worker

import { CATEGORIES, STATUS } from './storage.js';
import { parseSong } from './parser.js';
import { transposeChord } from './chords.js';

const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.id, s.label]));
const MAX_SHEET_CHARS = 6000;
const MAX_HISTORY = 20;

function songSummary(s) {
  const chords = [...new Set(parseSong(s.raw).chords)];
  return `- ${s.title || 'Ohne Titel'}${s.artist ? ' (' + s.artist + ')' : ''}: ${STATUS_LABEL[s.status] || s.status}, ` +
    `${s.practiceCount || 0}× geübt; Akkorde: ${chords.join(' ') || '–'}`;
}

function songDetail(s) {
  const parsed = parseSong(s.raw);
  const shift = (s.transpose || 0) + (s.sheetCapo || 0);
  const sounding = [...new Set(parsed.chords.map((c) => transposeChord(c, shift)))];
  const lines = [
    `Titel: ${s.title || 'Ohne Titel'}`,
    s.artist && `Interpret: ${s.artist}`,
    `Capo laut Liedblatt: ${s.sheetCapo || 0}; Wayne spielt mit Capo ${s.capo || 0}; Transponierung: ${s.transpose || 0} Halbtöne`,
    `Klingende Akkorde: ${sounding.join(' ') || '–'}`,
    s.tempo && `Tempo: ${s.tempo} bpm`,
    s.strum && `Schlagmuster (Notiz): ${s.strum}`,
    s.notes && `Waynes Notizen: ${s.notes}`,
    `Lernstand: ${STATUS_LABEL[s.status] || s.status}, ${s.practiceCount || 0}× geübt`,
    '',
    'Liedblatt (Akkorde sind Griffe für den Capo laut Liedblatt):',
    s.raw.length > MAX_SHEET_CHARS ? s.raw.slice(0, MAX_SHEET_CHARS) + '\n[…gekürzt]' : s.raw
  ];
  return lines.filter((l) => l !== false && l !== null && l !== undefined && l !== '').join('\n')
    .replace('Liedblatt (Akkorde', '\nLiedblatt (Akkorde');
}

/** Systemanweisung für den Lehrer */
function practiceLine(p) {
  const d = new Date(p.at).toLocaleDateString('de-DE');
  const lied = p.songTitle ? ` („${p.songTitle}“)` : '';
  if (p.type === 'saiten') return `- ${d}: Saite für Saite ${p.chord}${lied}: ` + p.results.map((r) => `${['E', 'A', 'D', 'G', 'H', 'e'][r.s]} ${r.status || '–'}`).join(', ');
  if (p.type === 'akkord') return `- ${d}: Akkord-Check ${p.chord}${lied}: ${p.score} %, ${p.verdict}`;
  if (p.type === 'timing') return `- ${d}: Timing ${p.bpm} bpm: Mittel ${p.meanMs} ms, Streuung ${p.sdMs} ms, Trend ${p.slope} ms/Schlag, ${p.missed} ausgelassen`;
  if (p.type === 'wechsel') return `- ${d}: Akkordwechsel ${p.a}↔${p.b}: ${p.changes} saubere Wechsel in ${p.seconds} s`;
  if (p.type === 'aufnahme') return `- ${d}: Aufnahme${lied}, ${Math.round(p.seconds)} s, Tempo ${p.tempoStart}→${p.tempoEnd} bpm`;
  if (p.type === 'stimme') return `- ${d}: Singprobe${lied}: Melodie ${p.melody}`;
  return null;
}

export function buildSystemPrompt({ profile, categoryId, songs, song, practice = [] }) {
  const cat = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
  const guitar = profile.guitars?.[cat.id] || cat.name;
  const catSongs = songs.filter((s) => s.category === cat.id).slice(0, 40);

  const focus = {
    western: 'Liedbegleitung mit Plektrum und Fingern: Akkordwechsel, Schlagmuster, Rhythmus beim Singen, Capo, einfache Fingerpicking-Muster.',
    klassik: 'Begleitung auf Nylonsaiten: Zupfmuster (p-i-m-a), Arpeggien, Bassläufe, saubere Haltung der Anschlagshand.',
    e: 'E-Gitarre zur Begleitung: Powerchords, Palm Muting, Riffs, Dämpfen nicht gespielter Saiten, Grundlagen zu Verstärker und Effekten.'
  }[cat.id];

  return `Du bist ein geduldiger, erfahrener Gitarrenlehrer für Wayne und unterrichtest ihn zu Hause über eine App.

Über Wayne:
- Stand: ${profile.level}
- Ziel: ${profile.goal}
- Musikgeschmack: ${profile.taste || 'noch nicht angegeben'}
- Aktuelle Gitarre: ${cat.name} – ${guitar}
- Schwerpunkt in dieser Kategorie: ${focus}

So unterrichtest du:
- Antworte auf Deutsch, kurz und praktisch. Keine langen Einleitungen, kein Lob ohne Anlass.
- Er hatte nie Unterricht: Rechne mit eingeschliffenen Fehlern (Daumenhaltung, Handgelenk, verkrampfter Griff, Tempo zu schnell). Sprich sie an, wenn sie zur Frage passen.
- Gib konkrete Übungen mit Dauer und Tempo (z. B. „3 Minuten, Metronom 60 bpm, nur Wechsel C→G“).
- Theorie nur, soweit sie für Begleitung und Singen nützt, und immer mit Bezug auf seine Lieder.
- Griffe als Grifftabelle von tiefer E- zu hoher e-Saite (z. B. „x32010“, x = nicht anschlagen), Tabs und Schlagmuster in Codeblöcken.
- Schlagmuster mit ↓ ↑ und Zählzeiten (1 + 2 + 3 + 4 +).
- Schreibe keine vollständigen Liedtexte ab. Für Erklärungen genügen Akkordfolgen und kurze Textstellen.
- Wenn du dir bei einem Lied, Griff oder einer Fakteninfo nicht sicher bist, sag das.
- Du kannst ihn nicht hören. Wenn Hören nötig wäre, gib ihm Selbstprüfungen (Saite für Saite einzeln anschlagen, mit dem Handy aufnehmen und anhören).

Sein Liederbuch (${cat.name}):
${catSongs.length ? catSongs.map(songSummary).join('\n') : '- noch keine Lieder'}
${(() => {
  const lines = practice.filter((p) => p.category === cat.id).slice(-15).map(practiceLine).filter(Boolean);
  return lines.length ? `\nLetzte Messungen aus der Hör-Funktion (älteste zuerst):\n${lines.join('\n')}\nNutze sie, wenn sie zur Frage passen: Fortschritte benennen, wiederkehrende Probleme gezielt angehen.\n` : '';
})()}${profile.voiceLow != null && profile.voiceHigh != null ? `\nStimmumfang (bequem): MIDI ${Math.round(profile.voiceLow)} bis ${Math.round(profile.voiceHigh)}.\n` : ''}${song ? `\nAktuelles Lied, auf das sich die Frage bezieht:\n${songDetail(song)}` : '\nEs ist kein bestimmtes Lied ausgewählt.'}`;
}

/** Gesprächsverlauf für die API: abwechselnd, beginnt mit Frage, die letzten N Einträge */
export function apiHistory(messages) {
  let list = messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim() && !m.error);
  list = list.slice(-MAX_HISTORY);
  while (list.length && list[0].role !== 'user') list.shift();
  // Zwei gleiche Rollen hintereinander zusammenfassen
  const out = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

/** Hängt Bilder (JPEG, base64 ohne Präfix) an die letzte Frage an */
export function withImages(messages, images = []) {
  if (!images.length) return messages;
  const out = messages.slice();
  const last = out[out.length - 1];
  out[out.length - 1] = {
    role: 'user',
    content: [
      ...images.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
      { type: 'text', text: last.content }
    ]
  };
  return out;
}

function workerUrl(base, path) {
  return base.replace(/\/+$/, '') + path;
}

export async function pingWorker({ apiUrl, apiToken }) {
  const r = await fetch(workerUrl(apiUrl, '/ping'), { headers: { Authorization: 'Bearer ' + apiToken } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
  return data;
}

/**
 * Fragt den Lehrer; onText wird mit dem jeweils bisherigen Antworttext aufgerufen.
 * Gibt {text, stopReason} zurück; stopReason 'max_tokens' = Antwort wurde abgeschnitten.
 */
export async function askTeacher({ apiUrl, apiToken, system, messages, onText, signal }) {
  const r = await fetch(workerUrl(apiUrl, '/chat'), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiToken, 'content-type': 'application/json' },
    body: JSON.stringify({ system, messages }),
    signal
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `Verbindungsfehler ${r.status}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let stopReason = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          text += ev.delta.text;
          onText?.(text);
        } else if (ev.type === 'message_delta' && ev.delta?.stop_reason) {
          stopReason = ev.delta.stop_reason;
        } else if (ev.type === 'error') {
          throw new Error(ev.error?.message || 'Fehler während der Antwort.');
        }
      }
    }
  }
  return { text, stopReason };
}
