import { useEffect, useRef, useState } from 'react';
import { countLabels } from '../lib/theory.js';
import { meterBeats, patternTab, Accompanist } from '../lib/accompany.js';
import { Guitar } from '../lib/audio/guitar.js';
import { newId } from '../lib/storage.js';

// Reihenfolge beim Durchklicken eines Schlagfelds
const STRUM_CYCLE = ['', 'D', 'U', 'A', 'X', 'M', 'B', 'W'];
export const STRUM_SYMBOL = { '': '·', D: '↓', U: '↑', A: '⇓', X: '×', M: 'PM', B: 'B', W: 'W' };
export const STRUM_HELP = '↓ ab · ↑ auf · ⇓ betont · × Chuck · PM Palm Muting · B Bass · W Wechselbass';
// Zeilen des Zupf-Rasters von oben nach unten
const PICK_ROWS = [
  { role: 5, label: 'e (a)' },
  { role: 4, label: 'H (m)' },
  { role: 3, label: 'G (i)' },
  { role: 'W', label: 'Wechselbass (p)' },
  { role: 'B', label: 'Bass (p)' }
];

function emptyGrid(kind, meter, sub) {
  const { beats } = meterBeats(meter);
  const per = meter === '6/8' ? (sub === 16 ? 2 : 1) : sub === 16 ? 4 : 2;
  return Array.from({ length: beats * per }, () => (kind === 'zupf' ? [] : ''));
}

export default function PatternEditor({ initial, chord, bpm, onSave, onDelete, onCancel, onAsk }) {
  const [p, setP] = useState(() => initial || { id: newId(), name: '', kind: 'schlag', meter: '4/4', grid: emptyGrid('schlag', '4/4', 8), use: '' });
  const sub = p.meter === '6/8' ? (p.grid.length > 6 ? 16 : 8) : p.grid.length / meterBeats(p.meter).beats === 4 ? 16 : 8;
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const eng = useRef(null);
  useEffect(() => () => { eng.current?.acc.stop(); eng.current?.guitar.close(); }, []);

  const reshape = (patch) => {
    const next = { ...p, ...patch };
    const s = patch.sub ?? sub;
    if (patch.kind || patch.meter || patch.sub) next.grid = emptyGrid(next.kind, next.meter, s);
    delete next.sub;
    stop();
    setP(next);
  };

  const cycle = (i) => {
    const g = p.grid.slice();
    g[i] = STRUM_CYCLE[(STRUM_CYCLE.indexOf(g[i]) + 1) % STRUM_CYCLE.length];
    setP({ ...p, grid: g });
  };
  const toggle = (i, role) => {
    const g = p.grid.map((c) => (Array.isArray(c) ? c.slice() : []));
    const cell = g[i];
    const k = cell.indexOf(role);
    if (k >= 0) cell.splice(k, 1);
    else {
      // Bass und Wechselbass schließen sich aus (beides ist der Daumen)
      if (role === 'B' || role === 'W') { const o = cell.indexOf(role === 'B' ? 'W' : 'B'); if (o >= 0) cell.splice(o, 1); }
      cell.push(role);
    }
    setP({ ...p, grid: g });
  };

  const stop = () => { eng.current?.acc.stop(); setPlaying(false); setStep(-1); };
  const play = () => {
    if (playing) { stop(); return; }
    if (!eng.current) { const guitar = new Guitar(); eng.current = { guitar, acc: new Accompanist(guitar) }; }
    setPlaying(true);
    eng.current.acc.start({ events: [{ chord, beats: meterBeats(p.meter).beats * 2 }], pattern: p, bpm, meter: p.meter, countIn: false, loop: true, onStep: setStep });
  };
  useEffect(() => { if (playing) { stop(); setTimeout(play, 0); } }, [p.grid]); // eslint-disable-line

  const labels = countLabels(p.meter, p.grid.length);
  const empty = p.grid.every((c) => (Array.isArray(c) ? !c.length : !c));

  return (
    <div className="pattern pattern--edit">
      <div className="pattern__head">
        <h2>{initial?.custom ? 'Muster bearbeiten' : 'Neues Muster'}</h2>
        <button className={'btn' + (playing ? ' btn--primary is-active' : '')} onClick={play} disabled={empty}>{playing ? 'Stopp' : 'Anhören'}</button>
      </div>
      <div className="pedit__fields">
        <label>Name<input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="z. B. Strophe aus dem Video" /></label>
        <label>Art
          <select value={p.kind} onChange={(e) => reshape({ kind: e.target.value })}>
            <option value="schlag">Schlagmuster</option><option value="zupf">Zupfmuster</option>
          </select>
        </label>
        <label>Taktart
          <select value={p.meter} onChange={(e) => reshape({ meter: e.target.value })}>
            <option value="4/4">4/4</option><option value="3/4">3/4</option><option value="6/8">6/8</option>
          </select>
        </label>
        <label>Raster
          <select value={sub} onChange={(e) => reshape({ sub: Number(e.target.value) })}>
            <option value={8}>Achtel</option><option value={16}>Sechzehntel</option>
          </select>
        </label>
        {p.kind === 'schlag' && (
          <label>Klang
            <select value={p.voicing || ''} onChange={(e) => setP({ ...p, voicing: e.target.value || undefined })}>
              <option value="">Normale Akkorde</option><option value="power">Powerchords (E-Gitarre)</option>
            </select>
          </label>
        )}
      </div>

      {p.kind === 'schlag' ? (
        <>
          <div className="pattern__grid" style={{ gridTemplateColumns: `repeat(${p.grid.length}, 1fr)` }}>
            {p.grid.map((g, i) => (
              <button key={i} className={'pattern__cell pedit__cell' + (step === i ? ' is-now' : '') + (g ? '' : ' is-rest')} onClick={() => cycle(i)} title="Klicken zum Ändern">
                <b>{STRUM_SYMBOL[g]}</b><small>{labels[i]}</small>
              </button>
            ))}
          </div>
          <p className="pattern__use">Feld anklicken, um zu wechseln: {STRUM_HELP}</p>
        </>
      ) : (
        <>
          <div className="pedit__matrix" style={{ gridTemplateColumns: `8.5em repeat(${p.grid.length}, minmax(22px, 1fr))` }}>
            {PICK_ROWS.map((row) => (
              <div key={row.label} className="pedit__row" style={{ display: 'contents' }}>
                <span className="pedit__label">{row.label}</span>
                {p.grid.map((c, i) => (
                  <button key={i} className={'pedit__dot' + (c.includes(row.role) ? ' is-on' : '') + (step === i ? ' is-now' : '')} onClick={() => toggle(i, row.role)} aria-label={`${row.label}, Schritt ${i + 1}`} />
                ))}
              </div>
            ))}
            <span />
            {labels.map((l, i) => <small key={i} className="pedit__count">{l}</small>)}
          </div>
          {!empty && <pre className="pattern__tab">{patternTab(p, chord)}</pre>}
        </>
      )}

      <label>Wofür / Notiz<input value={p.use || ''} onChange={(e) => setP({ ...p, use: e.target.value })} placeholder="z. B. Refrain, aus Video von …" /></label>
      <div className="listen__actions">
        <button className="btn btn--primary" disabled={empty || !p.name.trim()} onClick={() => { stop(); onSave({ ...p, name: p.name.trim(), custom: true, updated: new Date().toISOString() }); }}>Speichern</button>
        <button className="btn btn--quiet" onClick={() => { stop(); onCancel(); }}>Abbrechen</button>
        <button className="btn btn--quiet" onClick={() => onAsk(p)}>Lehrer hilft beim Eintragen</button>
        {initial?.custom && onDelete && <button className="btn btn--danger" onClick={() => { if (confirm('Muster löschen?')) { stop(); onDelete(p.id); } }}>Löschen</button>}
      </div>
    </div>
  );
}
