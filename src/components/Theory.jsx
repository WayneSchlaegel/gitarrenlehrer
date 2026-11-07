import { useEffect, useMemo, useRef, useState } from 'react';
import { detectKey, degreeOf, keyChords, capoTable, STRUM_PATTERNS, countLabels, CAGED_C, KEY_NAMES } from '../lib/theory.js';
import { parseSong } from '../lib/parser.js';
import { transposeChord, canonicalChord, displayChord } from '../lib/chords.js';
import ChordDiagram from './ChordDiagram.jsx';

const SECTIONS = [
  { id: 'tonart', label: 'Tonart und Stufen' },
  { id: 'capo', label: 'Capo und Transponieren' },
  { id: 'rhythmus', label: 'Schlagmuster' },
  { id: 'caged', label: 'CAGED' },
  { id: 'singen', label: 'Spielen und Singen' }
];

function soundingChords(song) {
  const parsed = parseSong(song.raw);
  const shift = (song.transpose || 0) + (song.sheetCapo || 0);
  return parsed.chords.map((c) => canonicalChord(transposeChord(c, shift)));
}

export default function Theory({ category, songs, settings, songId, onSongId, onAskTeacher }) {
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
      {section === 'rhythmus' && <StrumSection song={song} ask={ask} />}
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

function StrumSection({ song, ask }) {
  const [bpm, setBpm] = useState(song?.tempo || 80);
  useEffect(() => { setBpm(song?.tempo || 80); }, [song?.id, song?.tempo]);
  const [playing, setPlaying] = useState(null);
  const [step, setStep] = useState(-1);
  const ctxRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => () => { clearTimeout(timer.current); ctxRef.current?.close(); }, []);

  const hit = (ctx, t, kind) => {
    // Kurzes Rauschen, gefiltert: abwärts dunkler, aufwärts heller, Chuck sehr kurz
    const len = kind === 'X' ? 0.04 : 0.18;
    const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * (kind === 'X' ? 0.15 : 0.35)));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'U' ? 'highpass' : kind === 'X' ? 'bandpass' : 'lowpass';
    f.frequency.value = kind === 'U' ? 1800 : kind === 'X' ? 900 : 1400;
    const g = ctx.createGain();
    g.gain.value = kind === 'U' ? 0.5 : 0.8;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
  };

  const play = (p) => {
    clearTimeout(timer.current);
    if (playing === p.id) { setPlaying(null); setStep(-1); return; }
    const ctx = ctxRef.current || (ctxRef.current = new AudioContext());
    const eighth = (p.meter === '6/8' ? 60 / bpm / 2 : 60 / bpm / 2);
    const steps = p.grid.length * 4; // vier Takte
    const t0 = ctx.currentTime + 0.1;
    for (let i = 0; i < steps; i++) {
      const k = p.grid[i % p.grid.length];
      if (k) hit(ctx, t0 + i * eighth, k);
    }
    setPlaying(p.id);
    const tick = (i) => {
      if (i >= steps) { setPlaying(null); setStep(-1); return; }
      setStep(i % p.grid.length);
      timer.current = setTimeout(() => tick(i + 1), eighth * 1000);
    };
    timer.current = setTimeout(() => tick(0), 100);
  };

  return (
    <div className="theory__body">
      <p>
        Die Schlaghand bewegt sich gleichmäßig auf und ab wie ein Pendel, auch wenn sie die Saiten gerade nicht trifft.
        Abwärts auf den Zählzeiten (1, 2, 3, 4), aufwärts auf den „und“ dazwischen. Das hält den Rhythmus stabil, gerade beim Singen.
      </p>
      <div className="theory__row">
        <label className="theory__bpm">Tempo <input type="number" min="40" max="160" value={bpm} onChange={(e) => setBpm(Math.max(40, Math.min(160, Number(e.target.value) || 80)))} /> bpm</label>
      </div>
      <div className="patterns">
        {STRUM_PATTERNS.map((p) => (
          <div key={p.id} className="pattern">
            <div className="pattern__head">
              <h2>{p.name} <span>{p.meter}</span></h2>
              <button className={'btn' + (playing === p.id ? ' btn--primary is-active' : '')} onClick={() => play(p)}>{playing === p.id ? 'Stopp' : 'Vorspielen'}</button>
            </div>
            <div className="pattern__grid" style={{ gridTemplateColumns: `repeat(${p.grid.length}, 1fr)` }}>
              {p.grid.map((g, i) => (
                <span key={i} className={'pattern__cell' + (playing === p.id && step === i ? ' is-now' : '') + (g ? '' : ' is-rest')}>
                  <b>{g === 'D' ? '↓' : g === 'U' ? '↑' : g === 'X' ? '×' : '·'}</b>
                  <small>{countLabels(p.meter, p.grid.length)[i]}</small>
                </span>
              ))}
            </div>
            <p className="pattern__use">{p.use}</p>
          </div>
        ))}
      </div>
      <p className="theory__tip">× = Chuck: Saiten mit der Handfläche der Schlaghand abdämpfen und gleichzeitig anschlagen, ergibt einen trockenen Klatschlaut.</p>
      <AskBtn onClick={() => ask(song
        ? `Welches Schlagmuster passt zu „${song.title}“ (Tempo ${song.tempo || 'unbekannt'})? Zeig es mit Zählzeiten und sag, wie ich es mit dem Singen zusammenbringe.`
        : 'Wie übe ich ein Schlagmuster so, dass es automatisch läuft und ich dazu singen kann?')} />
    </div>
  );
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
