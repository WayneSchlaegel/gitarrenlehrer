import { useEffect, useRef, useState } from 'react';
import { detectOnsets, chordChroma, classifyAB, countChanges, noiseFloor, onsetMinLevel, OPEN_STRINGS, pc } from '../lib/audio/dsp.js';
import { getShape } from '../lib/shapes.js';
import { displayChord, isChord } from '../lib/chords.js';

const COMMON = ['G', 'C', 'D', 'Em', 'Am', 'A', 'E', 'Dm', 'F'];

function pcsOf(chord, capo) {
  const s = getShape(chord);
  if (!s) return [];
  return [...new Set(s.frets.map((f, i) => (f < 0 ? null : pc(OPEN_STRINGS[i] + f + capo))).filter((x) => x !== null))];
}

export default function ChangeTrainer({ audio, chords, capo, sens, practice, onPractice, notation: n, onAskTeacher, category }) {
  const options = [...new Set([...chords, ...COMMON])];
  const [a, setA] = useState(chords[0] || 'G');
  const [b, setB] = useState(chords.find((c) => c !== (chords[0] || 'G')) || 'C');
  const [seconds, setSeconds] = useState(60);
  const [state, setState] = useState('idle'); // idle | count | run | done
  const [left, setLeft] = useState(0);
  const [labels, setLabels] = useState([]);
  const [err, setErr] = useState('');
  const runRef = useRef(null);

  useEffect(() => () => { if (runRef.current) clearInterval(runRef.current.iv); }, []);

  const start = () => {
    if (a === b || !isChord(a) || !isChord(b)) { setErr('Bitte zwei verschiedene Akkorde wählen.'); return; }
    setErr(''); setLabels([]); setState('count');
    const ctx = audio.ctx;
    const t0 = ctx.currentTime + 0.2;
    for (let i = 0; i < 3; i++) audio.click(t0 + i * 0.7, false, true);
    const pa = pcsOf(a, capo), pb = pcsOf(b, capo);
    setTimeout(() => {
      setState('run');
      audio.start();
      const startAt = performance.now();
      const done = new Set();
      const found = [];
      const sr = audio.sampleRate;
      let floor = null;
      const iv = setInterval(() => {
        const r = audio.peek();
        if (!r) return;
        const d = r.data;
        if (floor === null && d.length > sr * 0.2) floor = noiseFloor(d, sr, 0, Math.round(sr * 0.2));
        if (floor !== null) {
          const ons = detectOnsets(d, sr, { absMin: onsetMinLevel(floor, sens), relMin: 0, ratio: 1.4, minGapMs: 250 });
          for (const o of ons) {
            if (done.has(o) || o + sr * 0.42 > d.length) continue;
            done.add(o);
            const c = chordChroma(d, sr, o, { fast: true });
            found.push({ o, l: c ? classifyAB(c.chroma, pa, pb) : null });
          }
          found.sort((x, y) => x.o - y.o);
          setLabels(found.map((f) => f.l));
        }
        const rest = seconds - (performance.now() - startAt) / 1000;
        setLeft(Math.max(0, Math.ceil(rest)));
        if (rest <= 0) {
          clearInterval(iv);
          audio.stop();
          runRef.current = null;
          const ls = found.map((f) => f.l);
          setState('done');
          onPractice({ type: 'wechsel', a, b, seconds, changes: countChanges(ls), strikes: ls.length, unclear: ls.filter((x) => !x).length });
        }
      }, 400);
      runRef.current = { iv };
    }, 2300);
  };

  const cancel = () => {
    if (runRef.current) clearInterval(runRef.current.iv);
    runRef.current = null;
    audio.stop();
    setState('idle');
  };

  const changes = countChanges(labels);
  const last = labels[labels.length - 1];
  const history = practice.filter((p) => p.type === 'wechsel' && p.category === category &&
    ((p.a === a && p.b === b) || (p.a === b && p.b === a))).slice(-12);
  const maxH = Math.max(10, ...history.map((h) => h.changes));

  return (
    <div className="listen__body">
      <div className="listen__pick">
        <label>Akkord 1<select value={a} onChange={(e) => setA(e.target.value)} disabled={state === 'run' || state === 'count'}>{options.map((c) => <option key={c} value={c}>{displayChord(c, n)}</option>)}</select></label>
        <label>Akkord 2<select value={b} onChange={(e) => setB(e.target.value)} disabled={state === 'run' || state === 'count'}>{options.map((c) => <option key={c} value={c}>{displayChord(c, n)}</option>)}</select></label>
        <label>Dauer<select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} disabled={state === 'run' || state === 'count'}><option value={30}>30 Sekunden</option><option value={60}>1 Minute</option></select></label>
      </div>

      <div className="trainer">
        <div className="trainer__count">
          <span className="trainer__num">{state === 'idle' ? '–' : changes}</span>
          <span>saubere Wechsel</span>
        </div>
        <div className="trainer__now">
          {state === 'count' && 'Gleich geht es los …'}
          {state === 'run' && <>Noch {left} s · zuletzt erkannt: <strong>{last === 'A' ? displayChord(a, n) : last === 'B' ? displayChord(b, n) : '?'}</strong></>}
          {state === 'done' && `${labels.length} Anschläge, davon ${labels.filter((x) => !x).length} nicht eindeutig.`}
        </div>
      </div>

      <p className="listen__hint">
        Akkord 1 greifen, einmal kräftig anschlagen, sofort zu Akkord 2 wechseln, anschlagen, zurück, so schnell wie es sauber geht.
        Gezählt wird nur, wenn der Anschlag klar als der richtige Akkord erkannt wird. Nicht hetzen: Sauberkeit vor Tempo.
      </p>
      {err && <p className="listen__error">{err}</p>}
      <div className="listen__actions">
        {state === 'run' || state === 'count'
          ? <button className="btn" onClick={cancel}>Abbrechen</button>
          : <button className="btn btn--primary" onClick={start} disabled={!audio}>{state === 'done' ? 'Nochmal' : 'Start'}</button>}
        {state === 'done' && (
          <button className="btn btn--quiet" onClick={() => onAskTeacher(`Akkordwechsel-Training ${a} ↔ ${b}: ${changes} saubere Wechsel in ${seconds} Sekunden (bisherige Werte: ${history.map((h) => h.changes).join(', ') || 'keine'}). Wie werde ich schneller, ohne unsauber zu werden?`)}>
            Lehrer kommentieren lassen
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="trainer__hist">
          <h2>Verlauf {displayChord(a, n)} ↔ {displayChord(b, n)}</h2>
          <div className="hist">
            {history.map((h, i) => (
              <div key={i} className="hist__bar" title={`${new Date(h.at).toLocaleDateString('de-DE')}: ${h.changes}`}>
                <div style={{ height: (h.changes / maxH) * 100 + '%' }} />
                <span>{h.changes}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
