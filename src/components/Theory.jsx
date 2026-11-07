import { useEffect, useMemo, useRef, useState } from 'react';
import { detectKey, degreeOf, keyChords, capoTable, countLabels, CAGED_C, KEY_NAMES } from '../lib/theory.js';
import { parseSong } from '../lib/parser.js';
import { transposeChord, canonicalChord, displayChord } from '../lib/chords.js';
import ChordDiagram from './ChordDiagram.jsx';
import { Guitar } from '../lib/audio/guitar.js';
import { Accompanist, allPatterns, meterBeats, patternTab } from '../lib/accompany.js';
import { newId } from '../lib/storage.js';
import PatternEditor, { STRUM_SYMBOL, STRUM_HELP } from './PatternEditor.jsx';

const SECTIONS = [
  { id: 'tonart', label: 'Tonart und Stufen' },
  { id: 'capo', label: 'Capo und Transponieren' },
  { id: 'rhythmus', label: 'Schlag- und Zupfmuster' },
  { id: 'caged', label: 'CAGED' },
  { id: 'singen', label: 'Spielen und Singen' }
];

function soundingChords(song) {
  const parsed = parseSong(song.raw);
  const shift = (song.transpose || 0) + (song.sheetCapo || 0);
  return parsed.chords.map((c) => canonicalChord(transposeChord(c, shift)));
}

export default function Theory({ category, songs, settings, songId, onSongId, onAskTeacher, patterns = [], onPatterns }) {
  const n = settings.notation;
  const catSongs = useMemo(() => songs.filter((s) => s.category === category.id), [songs, category]);
  const song = catSongs.find((s) => s.id === songId) || null;
  const [section, setSection] = useState('tonart');
  const ask = (text) => onAskTeacher(text, song?.id || null);

  return (
    <section className="theory">
      <header className="theory__head">
        <h1>Theorie</h1>
        <label>
          Bezug
          <select value={songId || ''} onChange={(e) => onSongId(e.target.value || null)}>
            <option value="">Kein bestimmtes Lied</option>
            {catSongs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
      </header>
      <nav className="theory__nav" aria-label="Themen">
        {SECTIONS.map((s) => (
          <button key={s.id} className={section === s.id ? 'is-active' : ''} onClick={() => setSection(s.id)}>{s.label}</button>
        ))}
      </nav>

      {section === 'tonart' && <KeySection song={song} n={n} ask={ask} />}
      {section === 'capo' && <CapoSection song={song} n={n} ask={ask} />}
      {section === 'rhythmus' && <StrumSection song={song} ask={ask} n={n} custom={patterns} onCustom={onPatterns} />}
      {section === 'caged' && <CagedSection n={n} ask={ask} />}
      {section === 'singen' && <SingSection song={song} ask={ask} />}
    </section>
  );
}

function AskBtn({ onClick, children = 'Lehrer dazu fragen' }) {
  return <button className="btn btn--quiet theory__ask" onClick={onClick}>{children}</button>;
}

function KeySection({ song, n, ask }) {
  const chords = song ? soundingChords(song) : [];
  const unique = [...new Set(chords)];
  const detected = chords.length ? detectKey(chords) : null;
  const [key, setKey] = useState(detected?.key || 'G');
  useEffect(() => { if (detected) setKey(detected.key); }, [song?.id]); // eslint-disable-line
  const family = keyChords(key);
  const keyName = (k, minor) => (minor ? displayChord(k, n).replace(/m$/, '') + '-Moll' : displayChord(k, n) + '-Dur');

  return (
    <div className="theory__body">
      <p>
        Jede Tonart hat eine feste „Akkordfamilie“. Die meisten Lieder kommen mit drei bis vier davon aus: I, IV, V und oft vi.
        Wer die Stufen kennt, sieht sofort, welche Akkorde zusammengehören, und kann ein Lied in jede Tonart übertragen.
      </p>

      {song && detected && (
        <div className="theory__card">
          <h2>„{song.title}“</h2>
          <p>
            Klingt in <strong>{detected.minor ? keyName(detected.relMinor, true) : keyName(detected.key)}</strong>
            {detected.minor ? ` (Akkordfamilie von ${keyName(detected.key)})` : ''}.
            {detected.fit < 0.8 ? ' Einige Akkorde sind leiterfremd, das ist in Pop und Rock normal.' : ''}
          </p>
          <div className="degrees">
            {unique.map((c) => (
              <span key={c} className="degree">
                <strong>{displayChord(c, n)}</strong>
                <span>{degreeOf(c, detected.key) || 'leiterfremd'}</span>
              </span>
            ))}
          </div>
          <AskBtn onClick={() => ask(`Erkläre mir die Akkordfolge von „${song.title}“ mit Stufen (${unique.map((c) => `${c}=${degreeOf(c, detected.key) || '?'}`).join(', ')}). Was macht jede Stufe hier, und wie hilft mir das beim Spielen und Auswendiglernen?`)} />
        </div>
      )}

      <div className="theory__card">
        <div className="theory__row">
          <h2>Akkordfamilie</h2>
          <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Tonart">
            {KEY_NAMES.map((k) => <option key={k} value={k}>{keyName(k)}</option>)}
          </select>
        </div>
        <div className="family">
          {family.slice(0, 6).map((d) => (
            <div key={d.roman} className={'family__item' + (['I', 'IV', 'V'].includes(d.roman) ? ' is-main' : '')}>
              <span className="family__roman">{d.roman}</span>
              <ChordDiagram chord={d.chord} notation={n} size={0.95} />
              <span className="family__role">{d.role}</span>
            </div>
          ))}
        </div>
        <p className="theory__tip">
          Bequeme Tonarten für Begleitung mit offenen Griffen: G, C, D, A und E sowie die Moll-Parallelen Em, Am, Bm.
          Liegt ein Lied unbequem, mit Capo in eine dieser Tonarten ausweichen.
        </p>
      </div>
    </div>
  );
}

function CapoSection({ song, n, ask }) {
  const table = capoTable(['C', 'A', 'G', 'E', 'D', 'Am', 'Em', 'Dm'], 7);
  return (
    <div className="theory__body">
      <p>
        Der Capo verkürzt alle Saiten gleichzeitig. Du greifst dieselben Formen wie ohne Capo, es klingt aber pro Bund einen
        Halbton höher. So singst du in deiner Stimmlage und behältst die einfachen Griffe.
      </p>
      <ol className="theory__steps">
        <li>Erst die Tonart finden, in der du gut singst: Im Liedblatt mit „Tonart + / −“ verschieben und mitsingen.</li>
        <li>Dann im Liedblatt „Capo → Vorschlag“: zeigt die Capo-Position mit den leichtesten Griffen für genau diese Tonart.</li>
        <li>Ablesen ohne App: Griffform in der Tabelle suchen, Spalte = Bund, Feld = klingender Akkord.</li>
      </ol>
      <div className="capo-table-wrap">
        <table className="capo-table">
          <thead>
            <tr><th>Griff</th>{Array.from({ length: 8 }, (_, f) => <th key={f}>{f === 0 ? 'ohne' : f}</th>)}</tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.shape}>
                <th>{displayChord(row.shape, n)}</th>
                {row.sounds.map((s, f) => <td key={f}>{displayChord(s, n)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="theory__tip">Faustregel: Über dem 7. Bund klingt eine Westerngitarre dünn. Dann lieber andere Griffformen wählen.</p>
      <AskBtn onClick={() => ask(song
        ? `Ich will „${song.title}“ singen. Wie finde ich meine Tonart und den passenden Capo? Gib mir eine kurze Anleitung zum Ausprobieren.`
        : 'Wie finde ich für ein Lied die Tonart, in der ich gut singen kann, und den passenden Capo?')} />
    </div>
  );
}

function StrumSection({ song, ask, n, custom = [], onCustom }) {
  const songChords = song ? [...new Set(soundingChords(song))] : [];
  const choices = [...new Set([...songChords, 'G', 'C', 'D', 'Em', 'Am', 'A', 'E'])];
  const [bpm, setBpm] = useState(song?.tempo || 80);
  const [chord, setChord] = useState(songChords[0] || 'G');
  const [playing, setPlaying] = useState(null);
  const [step, setStep] = useState(-1);
  const [kind, setKind] = useState('schlag');
  const [editing, setEditing] = useState(null); // Muster im Editor oder null
  const engine = useRef(null);
  const ALL = allPatterns(custom);
  useEffect(() => { setBpm(song?.tempo || 80); if (songChords[0]) setChord(songChords[0]); }, [song?.id, song?.tempo]); // eslint-disable-line
  useEffect(() => () => { engine.current?.acc.stop(); engine.current?.guitar.close(); }, []);

  const stop = () => { engine.current?.acc.stop(); setPlaying(null); setStep(-1); };
  const play = (p) => {
    if (playing === p.id) { stop(); return; }
    if (!engine.current) { const guitar = new Guitar(); engine.current = { guitar, acc: new Accompanist(guitar) }; }
    const { beats } = meterBeats(p.meter);
    setPlaying(p.id);
    engine.current.acc.start({
      events: [{ chord, beats: beats * 2 }], pattern: p, bpm, meter: p.meter, countIn: false, loop: true,
      onStep: (i) => setStep(i)
    });
  };
  // Tempo oder Akkord geändert: neu starten
  useEffect(() => { if (playing) { const p = ALL.find((x) => x.id === playing); setPlaying(null); if (p) setTimeout(() => play(p), 0); } }, [bpm, chord]); // eslint-disable-line

  const list = ALL.filter((p) => p.kind === kind);
  const copyOf = (p) => ({ ...p, id: newId(), name: p.name + ' (angepasst)', custom: false, grid: p.grid.map((c) => (Array.isArray(c) ? c.flat() : c)) });
  const saveCustom = (p) => { onCustom([...custom.filter((x) => x.id !== p.id), p]); setEditing(null); setKind(p.kind); };
  const askHelp = (p) => ask(
    `Ich möchte ein ${p.kind === 'schlag' ? 'Schlagmuster' : 'Zupfmuster'} in meine App eintragen${p.name ? ` („${p.name}“)` : ''}. ` +
    `Taktart ${p.meter}, Raster mit ${p.grid.length} Feldern pro Takt. ` +
    (p.kind === 'schlag'
      ? `Gib mir für jedes Feld eines dieser Zeichen: ↓ ab, ↑ auf, ⇓ betont, × Chuck, PM Palm Muting, B Bass, W Wechselbass, · Pause. `
      : `Gib mir für jedes Feld an, welche Saiten gezupft werden: Bass (Daumen), Wechselbass (Daumen), G (i), H (m), e (a), oder Pause. `) +
    `Beschreibe es als Tabelle mit Zählzeit und Zeichen. Was ich über das Muster weiß: `
  );

  return (
    <div className="theory__body">
      <p>
        {kind === 'schlag'
          ? 'Die Schlaghand bewegt sich gleichmäßig auf und ab wie ein Pendel, auch wenn sie die Saiten gerade nicht trifft. Abwärts auf den Zählzeiten (1, 2, 3, 4), aufwärts auf den „und“ dazwischen. Das hält den Rhythmus stabil, gerade beim Singen.'
          : 'Beim Zupfen spielt der Daumen (p) die Basssaiten, Zeige- (i), Mittel- (m) und Ringfinger (a) die G-, H- und hohe e-Saite. Jeder Finger bleibt bei „seiner“ Saite, dann läuft das Muster bald von allein.'}
      </p>
      <div className="theory__row theory__controls">
        <div className="segmented" role="tablist">
          <button className={kind === 'schlag' ? 'is-active' : ''} onClick={() => { stop(); setKind('schlag'); }}>Schlagmuster</button>
          <button className={kind === 'zupf' ? 'is-active' : ''} onClick={() => { stop(); setKind('zupf'); }}>Zupfmuster</button>
        </div>
        <label className="theory__bpm">Akkord
          <select value={chord} onChange={(e) => setChord(e.target.value)}>{choices.map((c) => <option key={c} value={c}>{displayChord(c, n)}</option>)}</select>
        </label>
        <label className="theory__bpm">Tempo <input type="number" min="40" max="160" value={bpm} onChange={(e) => setBpm(Math.max(40, Math.min(160, Number(e.target.value) || 80)))} /> bpm</label>
      </div>
      <div className="theory__row">
        <button className="btn" onClick={() => { stop(); setEditing({ id: newId(), name: '', kind, meter: song?.meter || '4/4', grid: Array.from({ length: (song?.meter === '3/4' || song?.meter === '6/8') ? 6 : 8 }, () => (kind === 'zupf' ? [] : '')), use: '' }); }}>Eigenes Muster anlegen</button>
      </div>
      {editing && (
        <PatternEditor
          key={editing.id} initial={editing} chord={chord} bpm={bpm}
          onSave={saveCustom} onCancel={() => setEditing(null)} onAsk={askHelp}
          onDelete={(id) => { onCustom(custom.filter((x) => x.id !== id)); setEditing(null); }}
        />
      )}
      <div className="patterns">
        {list.map((p) => (
          <div key={p.id} className="pattern">
            <div className="pattern__head">
              <h2>{p.name} <span>{p.meter}{p.custom ? ' · eigenes' : ''}</span></h2>
              <span className="pattern__btns">
                <button className="btn btn--quiet" onClick={() => { stop(); setEditing(p.custom ? p : copyOf(p)); }} title={p.custom ? 'Bearbeiten' : 'Als eigenes Muster kopieren und anpassen'}>{p.custom ? 'Bearbeiten' : 'Anpassen'}</button>
                <button className={'btn' + (playing === p.id ? ' btn--primary is-active' : '')} onClick={() => play(p)}>{playing === p.id ? 'Stopp' : 'Vorspielen'}</button>
              </span>
            </div>
            <div className="pattern__grid" style={{ gridTemplateColumns: `repeat(${p.grid.length}, 1fr)` }}>
              {p.grid.map((g, i) => (
                <span key={i} className={'pattern__cell' + (playing === p.id && step === i ? ' is-now' : '') + ((Array.isArray(g) ? g.length : g) ? '' : ' is-rest')}>
                  <b>{p.kind === 'zupf' ? cellLabel(g) : STRUM_SYMBOL[g] ?? '·'}</b>
                  <small>{countLabels(p.meter, p.grid.length)[i]}</small>
                </span>
              ))}
            </div>
            {p.kind === 'zupf' && <pre className="pattern__tab">{patternTab(p, chord)}</pre>}
            {p.fingers && <p className="pattern__use">Finger: {p.fingers}</p>}
            <p className="pattern__use">{p.use}</p>
          </div>
        ))}
      </div>
      {kind === 'schlag' && <p className="theory__tip">Zeichen: {STRUM_HELP}. Chuck: Saiten mit der Handfläche der Schlaghand abdämpfen und gleichzeitig anschlagen. Palm Muting: Handballen leicht auf die Saiten am Steg legen.</p>}
      <p className="theory__tip">Im Liedblatt spielt „Begleitung“ dein Lied mit diesen Mustern und den Akkorden des Lieds vor.</p>
      <AskBtn onClick={() => ask(song
        ? `Welches ${kind === 'schlag' ? 'Schlag' : 'Zupf'}muster passt zu „${song.title}“ (Tempo ${song.tempo || 'unbekannt'})? Zeig es mit Zählzeiten und sag, wie ich es mit dem Singen zusammenbringe.`
        : `Wie übe ich ein ${kind === 'schlag' ? 'Schlag' : 'Zupf'}muster so, dass es automatisch läuft und ich dazu singen kann?`)} />
    </div>
  );
}

function cellLabel(cell) {
  if (!cell || !cell.length) return '·';
  const flat = cell.flat();
  return [...new Set(flat.map((r) => (r === 'B' || r === 'W' ? 'p' : ({ 3: 'i', 4: 'm', 5: 'a' })[r])))].join('');
}

function CagedSection({ n, ask }) {
  return (
    <div className="theory__body">
      <p>
        CAGED heißt: Jeder Dur-Akkord lässt sich mit den fünf offenen Griffformen C, A, G, E und D an fünf Stellen des
        Griffbretts greifen. Der Zeigefinger übernimmt dabei die Rolle des Sattels, genau wie ein Capo. Für Begleitung
        nützt das, um einen Akkord höher zu spielen (z. B. für eine zweite Gitarre) und um Capo und Barré zu verstehen.
      </p>
      <p>Hier fünfmal C-Dur, von der offenen Form bis in den 10. Bund:</p>
      <div className="family">
        {CAGED_C.map((c) => (
          <div key={c.form} className="family__item">
            <span className="family__roman">{c.form}</span>
            <ChordDiagram chord="C" label={displayChord('C', n)} shape={{ frets: c.frets, fingers: c.fingers, barre: c.barre }} notation={n} size={0.95} />
            <span className="family__role">{c.fret}</span>
          </div>
        ))}
      </div>
      <p className="theory__tip">
        Deine PDFs zum CAGED-System und zur Pentatonik passen hierher. Für reine Begleitung genügen zunächst die A-Form und die
        E-Form als Barré-Griffe: Damit kannst du jeden Dur- und Moll-Akkord greifen.
      </p>
      <AskBtn onClick={() => ask('Wie nutze ich CAGED ganz praktisch für Liedbegleitung, ohne Solospiel? Gib mir eine Übung mit A-Form und E-Form.')} />
    </div>
  );
}

function SingSection({ song, ask }) {
  return (
    <div className="theory__body">
      <ol className="theory__steps">
        <li><strong>Griffe automatisieren.</strong> Akkordwechsel müssen ohne Hinschauen klappen, sonst bleibt keine Aufmerksamkeit für die Stimme. Wechsel einzeln üben: eine Minute nur C ↔ G, langsam.</li>
        <li><strong>Erst nur Viertel.</strong> Ein Abschlag pro Zählzeit, dazu singen. Das Schlagmuster kommt erst, wenn das sitzt.</li>
        <li><strong>Text sprechen statt singen.</strong> Den Text im Rhythmus sprechen und dazu spielen. Danach die Melodie dazunehmen.</li>
        <li><strong>Betonte Silben auf die 1.</strong> Markiere im Liedblatt, auf welcher Silbe der Akkordwechsel kommt. Der Wechsel kommt meist kurz vor der betonten Silbe.</li>
        <li><strong>Summen.</strong> Spielen und die Melodie summen trennt Rhythmus und Text als Schwierigkeit.</li>
        <li><strong>Tonart prüfen.</strong> Wenn es an hohen oder tiefen Stellen hakt: Tonart verschieben, Capo nutzen (siehe „Capo und Transponieren“).</li>
        <li><strong>Aufnehmen.</strong> Handy hinlegen, einmal komplett durchspielen, anhören. Du hörst Timing-Wackler, die beim Spielen untergehen.</li>
      </ol>
      <AskBtn onClick={() => ask(song
        ? `Ich will „${song.title}“ spielen und dazu singen. Mach mir einen Übungsplan in kleinen Schritten, bis beides zusammen klappt.`
        : 'Gitarre spielen und gleichzeitig singen fällt mir schwer. Was ist der beste Weg, das zu lernen?')} />
    </div>
  );
}
