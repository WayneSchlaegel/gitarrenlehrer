import { useMemo, useState } from 'react';
import { parseSong } from '../lib/parser.js';
import { CATEGORIES, STATUS } from '../lib/storage.js';

const HELP = `So fügst du ein Lied ein:

• Akkorde über dem Text – einfach aus dem Netz kopieren:
    G              C        G
    Amazing grace, how sweet the sound

• oder ChordPro – Akkord in eckigen Klammern vor der Silbe:
    [G]Amazing [C]grace, how [G]sweet the sound

• Abschnitte: [Strophe 1], [Refrain], Bridge:`;

export default function SongEditor({ song, onSave, onCancel, onDelete }) {
  const [draft, setDraft] = useState(song);
  const parsed = useMemo(() => parseSong(draft.raw), [draft.raw]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const applyMeta = () => {
    const m = parsed.meta;
    set({
      title: draft.title || m.title || '',
      artist: draft.artist || m.artist || '',
      capo: draft.sheetCapo ? draft.capo : m.capo || draft.capo || 0,
      sheetCapo: draft.sheetCapo || m.capo || 0,
      tempo: draft.tempo || m.tempo || null
    });
  };

  const save = () => {
    const m = parsed.meta;
    const { importedHow, ...clean } = draft; // eslint-disable-line no-unused-vars
    // Capo-Angabe im eingefügten Text übernehmen, falls im Feld noch nichts steht
    const capoFromText = !clean.sheetCapo && m.capo ? { sheetCapo: m.capo, capo: m.capo } : {};
    onSave({
      ...clean,
      ...capoFromText,
      title: draft.title.trim() || m.title || 'Ohne Titel',
      artist: draft.artist.trim() || m.artist || '',
      updated: new Date().toISOString()
    });
  };

  const unique = [...new Set(parsed.chords)];

  return (
    <section className="editor">
      <header className="editor__head">
        <h1>{song.title ? 'Lied bearbeiten' : 'Neues Lied'}</h1>
        <div className="editor__actions">
          <button className="btn btn--quiet" onClick={onCancel}>Abbrechen</button>
          <button className="btn btn--primary" onClick={save}>Speichern</button>
        </div>
      </header>

      {draft.importedHow && (
        <p className="editor__import">
          {draft.importedHow === 'markierung'
            ? 'Markierten Text übernommen.'
            : 'Liedblatt von der Seite übernommen.'}{' '}
          Bitte kurz prüfen, ob Titel, Akkorde und Text stimmen, dann speichern.
          {parsed.meta.capo ? ` Capo ${parsed.meta.capo} wurde erkannt.` : ''}
          {parsed.meta.tuning ? ` Stimmung: ${parsed.meta.tuning}.` : ''}
        </p>
      )}

      <div className="editor__grid">
        <label>Titel<input value={draft.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label>Interpret<input value={draft.artist} onChange={(e) => set({ artist: e.target.value })} /></label>
        <label>
          Gitarre
          <select value={draft.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.numeral}. {c.name}</option>)}
          </select>
        </label>
        <label>
          Lernstand
          <select value={draft.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label>Tempo (bpm)<input type="number" min="30" max="260" value={draft.tempo || ''} onChange={(e) => set({ tempo: e.target.value ? Number(e.target.value) : null })} /></label>
        <label title="Für welchen Capo sind die Akkorde im Liedblatt notiert? Bei Ultimate Guitar steht das oben, z. B. „Capo: 2nd fret“.">
          Capo laut Liedblatt
          <input
            type="number" min="0" max="9" value={draft.sheetCapo || 0}
            onChange={(e) => { const v = Number(e.target.value) || 0; set({ sheetCapo: v, capo: v }); }}
          />
        </label>
        <label>
          Taktart
          <select value={draft.meter || '4/4'} onChange={(e) => set({ meter: e.target.value })}>
            <option value="4/4">4/4</option>
            <option value="3/4">3/4 (Walzer)</option>
            <option value="6/8">6/8 (Klick auf Achteln)</option>
          </select>
        </label>
        <label title="Für das Scrollen beim Mitspielen: Wie viele Takte dauert eine Zeile im Liedblatt ungefähr?">
          Takte pro Zeile
          <select value={draft.barsPerLine || 2} onChange={(e) => set({ barsPerLine: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="span-2">Schlagmuster<input placeholder="z. B. ↓ ↓↑ ↑↓↑" value={draft.strum} onChange={(e) => set({ strum: e.target.value })} /></label>
        <label className="span-2">Quelle (Adresse)<input value={draft.source || ''} onChange={(e) => set({ source: e.target.value })} /></label>
        <label className="span-2">Notizen<input placeholder="Was ist schwierig? Woran denken?" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
      </div>

      <div className="editor__body">
        <label className="editor__text">
          Akkorde und Text
          <textarea
            value={draft.raw}
            onChange={(e) => set({ raw: e.target.value })}
            placeholder={HELP}
            spellCheck={false}
          />
        </label>
        <aside className="editor__preview">
          <h2>Erkannt</h2>
          <p>{parsed.lines.filter((l) => l.type === 'lyrics' || l.type === 'chords').length} Zeilen, {unique.length} verschiedene Akkorde</p>
          {unique.length > 0 && <p className="editor__chords">{unique.join('  ')}</p>}
          {(parsed.meta.title || parsed.meta.artist) && (
            <button className="btn btn--quiet" onClick={applyMeta}>Titel und Angaben aus dem Text übernehmen</button>
          )}
          <p className="editor__note">
            Liedtexte bleiben nur in deinem Browser. Sichere sie regelmäßig über „Sichern“.
          </p>
          {onDelete && (
            <button
              className="btn btn--danger"
              onClick={() => { if (confirm(`„${song.title}“ endgültig löschen?`)) onDelete(); }}
            >
              Lied löschen
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}
