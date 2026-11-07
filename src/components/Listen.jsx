import { useEffect, useMemo, useRef, useState } from 'react';
import { openAudio, captureStrike, micSupported, micDiagnose } from '../lib/audio/mic.js';
import {
  OPEN_STRINGS, STRING_NAMES, analyzeString, chordChroma, evaluateChord, detectOnsets, evaluateTiming,
  noteLabel, pcLabel, pc, noiseFloor, onsetMinLevel
} from '../lib/audio/dsp.js';
import { getShape } from '../lib/shapes.js';
import { parseSong } from '../lib/parser.js';
import { transposeChord, canonicalChord, displayChord, isChord } from '../lib/chords.js';
import ChordDiagram from './ChordDiagram.jsx';
import VoiceCoach from './VoiceCoach.jsx';
import ChangeTrainer from './ChangeTrainer.jsx';
import Recorder from './Recorder.jsx';
import Camera from './Camera.jsx';

const OPEN_CHORD = '__leersaiten__';
const STATUS_TEXT = { ok: 'sauber', falsch: 'falscher Ton', gedaempft: 'gedämpft / zu kurz', unsauber: 'unsauber, evtl. Schnarren' };

/** Griffe, die im Lied tatsächlich gegriffen werden (berücksichtigt Capo und Transponierung) */
function grippedChords(song) {
  if (!song) return [];
  const parsed = parseSong(song.raw);
  const shift = (song.transpose || 0) + (song.sheetCapo || 0) - (song.capo || 0);
  const out = [];
  for (const c of parsed.chords) {
    const g = shift ? canonicalChord(transposeChord(c, shift)) : c;
    if (!out.includes(g)) out.push(g);
  }
  return out;
}

function expectedStrings(chord, capo) {
  if (chord === OPEN_CHORD) return OPEN_STRINGS.map((m, s) => ({ s, midi: m, fret: 0 }));
  const shape = getShape(chord);
  if (!shape) return [];
  return shape.frets
    .map((f, s) => (f < 0 ? null : { s, fret: f, midi: OPEN_STRINGS[s] + f + capo }))
    .filter(Boolean);
}

export default function Listen({ category, songs, settings, onSettings, songId, onSongId, onPractice, practice, onAskTeacher, profile, onProfile, onSongChange }) {
  const n = settings.notation;
  const catSongs = useMemo(() => songs.filter((s) => s.category === category.id), [songs, category]);
  const song = catSongs.find((s) => s.id === songId) || null;
  const chords = useMemo(() => grippedChords(song), [song]);
  const capo = song?.capo || 0;

  const [mode, setMode] = useState('saiten');
  const [chord, setChord] = useState(OPEN_CHORD);
  const [free, setFree] = useState('');
  const [audio, setAudio] = useState(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const abortRef = useRef(null);

  // Ergebnisse
  const [strRes, setStrRes] = useState({});
  const [current, setCurrent] = useState(null);
  const [chordRes, setChordRes] = useState(null);
  const [timing, setTiming] = useState(null);
  const [bpm, setBpm] = useState(song?.tempo || 70);
  const [bars, setBars] = useState(4);
  const [beatNow, setBeatNow] = useState(-1);
  const [peak, setPeak] = useState(0);
  const sens = settings.micSensitivity || 3;

  useEffect(() => { if (song?.tempo) setBpm(song.tempo); }, [song]);
  useEffect(() => { if (chords.length && chord === OPEN_CHORD && mode !== 'saiten') setChord(chords[0]); }, [chords, mode]); // eslint-disable-line
  useEffect(() => () => { abortRef.current?.abort(); audio?.close(); }, [audio]);
  useEffect(() => {
    if (!audio) return;
    let last = 0;
    let pk = 0, pkAt = 0;
    return audio.onLevel((l) => {
      const now = performance.now();
      if (l > pk || now - pkAt > 1500) { pk = l; pkAt = now; }
      if (now - last > 80) { last = now; setLevel(l); setPeak(pk); }
    });
  }, [audio]);

  const activeChord = free.trim() && isChord(free.trim()) ? free.trim() : chord;
  const expected = expectedStrings(activeChord, activeChord === OPEN_CHORD ? 0 : capo);
  const chordLabel = activeChord === OPEN_CHORD ? 'Leersaiten (Stimmung)' : displayChord(activeChord, n);

  const enableMic = async () => {
    setError('');
    try { setAudio(await openAudio({ agc: Boolean(settings.micAgc) })); }
    catch (e) {
      setError(e.name === 'NotAllowedError'
        ? 'Mikrofon-Zugriff wurde abgelehnt. In der Adresszeile auf das Schloss-Symbol klicken und das Mikrofon erlauben.'
        : e.message);
    }
  };

  const stop = () => { abortRef.current?.abort(); };

  const [diag, setDiag] = useState(null);
  const toggleAgc = async () => {
    const next = !settings.micAgc;
    onSettings({ micAgc: next });
    if (audio) { await audio.close(); setAudio(null); try { setAudio(await openAudio({ agc: next })); } catch (e) { setError(e.message); } }
  };
  const runDiag = async () => {
    setBusy('diagnose'); setError(''); setDiag(null);
    try { setDiag(await micDiagnose(audio)); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  const log = (entry) => onPractice({ ...entry, category: category.id, songId: song?.id || null, songTitle: song?.title || null, at: new Date().toISOString() });

  // ---------- Saite für Saite ----------
  const checkString = async (exp, signal) => {
    setCurrent(exp.s);
    const { data, hitIndex } = await captureStrike(audio, { afterSec: 0.8, signal, sensitivity: sens });
    const sr = audio.sampleRate;
    const minL = onsetMinLevel(noiseFloor(data, sr, 0, Math.round(sr * 0.2)), sens);
    const ons = detectOnsets(data, sr, { absMin: minL, relMin: 0, ratio: 1.5 }).filter((o) => o >= hitIndex - sr * 0.15);
    const r = analyzeString(data, sr, ons.length ? ons[0] : hitIndex, exp.midi);
    setStrRes((prev) => ({ ...prev, [exp.s]: r }));
    return r;
  };

  const runStrings = async (only = null) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy('saiten');
    setError('');
    if (only === null) setStrRes({});
    const results = {};
    try {
      for (const exp of expected) {
        if (only !== null && exp.s !== only) continue;
        results[exp.s] = await checkString(exp, ctrl.signal);
        await new Promise((r) => setTimeout(r, 350));
      }
      if (only === null) {
        log({ type: 'saiten', chord: chordLabel, results: expected.map((e) => ({ s: e.s, status: results[e.s]?.status, cents: results[e.s]?.cents })) });
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setBusy(''); setCurrent(null); abortRef.current = null;
    }
  };

  const stringsSummary = () => {
    const parts = expected.map((e) => {
      const r = strRes[e.s];
      if (!r) return `${STRING_NAMES[e.s]}: nicht geprüft`;
      if (r.status === 'falsch') return `${STRING_NAMES[e.s]}: falscher Ton (erwartet ${noteLabel(e.midi, n)}, gehört ${noteLabel(r.midi, n)})`;
      return `${STRING_NAMES[e.s]}: ${STATUS_TEXT[r.status]}${r.cents ? ` (${r.cents > 0 ? '+' : ''}${r.cents} Cent)` : ''}`;
    });
    const shape = activeChord === OPEN_CHORD ? 'Leersaiten' : `Griff ${getShape(activeChord)?.frets.map((f) => (f < 0 ? 'x' : f)).join('')}${capo ? `, Capo ${capo}` : ''}`;
    return `Saite-für-Saite-Check ${chordLabel} (${shape}) auf der ${category.name}:\n${parts.join('\n')}`;
  };

  // ---------- Ganzer Akkord ----------
  const runChord = async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy('akkord'); setError(''); setChordRes(null);
    try {
      const { data, hitIndex } = await captureStrike(audio, { afterSec: 1.6, signal: ctrl.signal, sensitivity: sens });
      const sr = audio.sampleRate;
      const minL = onsetMinLevel(noiseFloor(data, sr, 0, Math.round(sr * 0.2)), sens);
      const ons = detectOnsets(data, sr, { absMin: minL, relMin: 0, ratio: 1.5 }).filter((o) => o >= hitIndex - sr * 0.15);
      const c = chordChroma(data, sr, ons.length ? ons[0] : hitIndex);
      if (!c) throw new Error('Aufnahme zu kurz.');
      const exp = [...new Set(expected.map((e) => pc(e.midi)))];
      const ev = evaluateChord(c.chroma, exp);
      setChordRes({ ...c, ...ev, exp });
      log({ type: 'akkord', chord: chordLabel, score: Math.round(ev.score * 100), verdict: ev.verdict, missing: ev.missing, extra: ev.extra });
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setBusy(''); abortRef.current = null;
    }
  };

  const chordSummary = () => {
    const r = chordRes;
    const names = (arr) => (arr.length ? arr.map((p) => pcLabel(p, n)).join(', ') : 'keine');
    return `Akkord-Check ${chordLabel}${capo ? ` (Capo ${capo})` : ''} auf der ${category.name}: ${Math.round(r.score * 100)} % der Klangenergie liegt auf Akkordtönen. ` +
      `Erwartete Töne: ${names(r.exp)}. Schwach oder fehlend: ${names(r.missing)}. Fremde Töne: ${names(r.extra)}.`;
  };

  // ---------- Timing ----------
  const latency = () => (settings.latencyMs != null ? settings.latencyMs / 1000 : audio.estimatedLatency);

  const runTiming = async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy('timing'); setError(''); setTiming(null);
    const ctx = audio.ctx;
    const beat = 60 / bpm;
    const countIn = 4;
    const total = countIn + bars * 4;
    try {
      audio.start();
      const t0 = ctx.currentTime + 0.5;
      for (let i = 0; i < total; i++) audio.click(t0 + i * beat, i >= countIn && (i - countIn) % 4 === 0, i < countIn);
      const end = t0 + total * beat + 0.6;
      await new Promise((resolve, reject) => {
        const iv = setInterval(() => {
          if (ctrl.signal.aborted) { clearInterval(iv); reject(new DOMException('Abgebrochen', 'AbortError')); return; }
          const b = Math.floor((ctx.currentTime - t0) / beat);
          setBeatNow(b);
          if (ctx.currentTime >= end) { clearInterval(iv); resolve(); }
        }, 40);
      });
      const rec = audio.stop();
      const sr = audio.sampleRate;
      const lat = latency();
      const floor = noiseFloor(rec.data, sr, 0, Math.round(sr * 0.4));
      const onsets = detectOnsets(rec.data, sr, { absMin: onsetMinLevel(floor, sens), relMin: 0.05, ratio: 1.5 }).map((i) => rec.t0 + i / sr - lat);
      const playBeats = Array.from({ length: bars * 4 }, (_, i) => t0 + (countIn + i) * beat);
      const res = evaluateTiming(onsets.filter((t) => t > playBeats[0] - beat / 2), playBeats, beat);
      setTiming({ ...res, bpm, bars, total: playBeats.length });
      log({ type: 'timing', bpm, bars, meanMs: Math.round(res.meanMs), sdMs: Math.round(res.sdMs), slope: +res.slopeMsPerBeat.toFixed(1), missed: res.missed, extra: res.extra });
    } catch (e) {
      audio.stop();
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setBusy(''); setBeatNow(-1); abortRef.current = null;
    }
  };

  const calibrate = async () => {
    setBusy('kalibrieren'); setError('');
    const ctx = audio.ctx;
    try {
      audio.start();
      const t0 = ctx.currentTime + 0.4;
      const clicks = Array.from({ length: 8 }, (_, i) => t0 + i * 0.5);
      clicks.forEach((t) => audio.click(t, true));
      await new Promise((r) => setTimeout(r, (0.4 + 8 * 0.5 + 0.6) * 1000));
      const rec = audio.stop();
      const sr = audio.sampleRate;
      const ons = detectOnsets(rec.data, sr, { relMin: 0.2, minGapMs: 200 }).map((i) => rec.t0 + i / sr);
      const diffs = clicks.map((c) => { const o = ons.find((x) => x >= c - 0.01 && x < c + 0.4); return o === undefined ? null : o - c; }).filter((d) => d !== null).sort((a, b) => a - b);
      if (diffs.length < 5) throw new Error('Klicks nicht erkannt. Kalibrieren mit Lautsprechern (nicht Kopfhörern) und etwas lauter.');
      const ms = Math.round(diffs[Math.floor(diffs.length / 2)] * 1000);
      onSettings({ latencyMs: ms });
    } catch (e) {
      audio.stop();
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const timingVerdict = (t) => {
    const out = [];
    if (t.meanMs > 25) out.push(`eher spät (im Mittel ${Math.round(t.meanMs)} ms nach dem Klick)`);
    else if (t.meanMs < -25) out.push(`eher früh (im Mittel ${Math.round(-t.meanMs)} ms vor dem Klick)`);
    else out.push('im Mittel gut auf dem Klick');
    if (t.sdMs < 20) out.push('sehr gleichmäßig');
    else if (t.sdMs < 35) out.push('ordentlich gleichmäßig');
    else out.push(`unruhig (Streuung ${Math.round(t.sdMs)} ms)`);
    const drift = t.slopeMsPerBeat * (t.total - 1);
    if (drift < -60) out.push('du wirst im Verlauf schneller');
    else if (drift > 60) out.push('du wirst im Verlauf langsamer');
    if (t.missed) out.push(`${t.missed} Schlag/Schläge nicht erkannt`);
    if (t.extra) out.push(`${t.extra} zusätzliche Anschläge`);
    return out;
  };

  const timingSummary = () => {
    const t = timing;
    return `Timing-Test auf der ${category.name}: ${t.bpm} bpm, ${t.bars} Takte, ein Abschlag pro Zählzeit. ` +
      `Mittlere Abweichung ${Math.round(t.meanMs)} ms (positiv = zu spät), Streuung ${Math.round(t.sdMs)} ms, ` +
      `Trend ${t.slopeMsPerBeat.toFixed(1)} ms pro Schlag (negativ = schneller werdend), ${t.missed} ausgelassen, ${t.extra} zusätzlich. ` +
      `Latenz ${settings.latencyMs != null ? 'kalibriert' : 'geschätzt'}.`;
  };

  const ask = (summary) => onAskTeacher(`${summary}\n\nBitte kommentiere das Ergebnis kurz und gib mir eine passende Übung.`, song?.id || null);

  // ---------- Darstellung ----------
  if (!micSupported()) {
    return (
      <section className="listen">
        <h1>Hören</h1>
        <p className="listen__warn">
          Das Mikrofon funktioniert nur über https oder auf localhost. Über die WLAN-Adresse (http://192.168…) erlaubt der
          Browser keinen Zugriff. Auf dem Laptop http://localhost:5173 nutzen; für das Handy kommt die Veröffentlichung auf GitHub Pages.
        </p>
      </section>
    );
  }

  const recent = practice.filter((p) => p.category === category.id).slice(-6).reverse();

  return (
    <section className="listen">
      <header className="listen__head">
        <h1>Hören</h1>
        <div className="segmented" role="tablist">
          {[['saiten', 'Saite für Saite'], ['akkord', 'Ganzer Akkord'], ['timing', 'Timing'], ['wechsel', 'Wechsel'], ['stimme', 'Stimme'], ['aufnahme', 'Aufnahme'], ['kamera', 'Kamera']].map(([id, label]) => (
            <button key={id} className={mode === id ? 'is-active' : ''} onClick={() => !busy && setMode(id)} disabled={Boolean(busy)}>{label}</button>
          ))}
        </div>
      </header>

      {mode === 'kamera' ? null : !audio ? (
        <div className="listen__mic">
          <p>Für Messungen braucht die App dein Mikrofon. Leg das Gerät 30–50 cm vor das Schallloch, Umgebung möglichst ruhig.</p>
          <label className="meter__sens">
            <input type="checkbox" checked={Boolean(settings.micAgc)} onChange={() => onSettings({ micAgc: !settings.micAgc })} />
            Automatische Verstärkung (bei leisem Laptop-Mikrofon; „gedämpft“ wird dann ungenauer)
          </label>
          <button className="btn btn--primary" onClick={enableMic}>Mikrofon einschalten</button>
        </div>
      ) : (
        <div className="meter" aria-label="Pegel">
          <span>Pegel</span>
          <div className="meter__bar">
            <div style={{ width: Math.min(100, Math.sqrt(level) * 220) + '%' }} />
            <i className="meter__peak" style={{ left: Math.min(100, Math.sqrt(peak) * 220) + '%' }} />
          </div>
          <span className="meter__num">{(peak * 1000).toFixed(1)}</span>
          <label className="meter__sens">
            Empfindlichkeit
            <input type="range" min="1" max="5" step="1" value={sens} onChange={(e) => onSettings({ micSensitivity: Number(e.target.value) })} />
            <span>{sens}</span>
          </label>
          <label className="meter__sens">
            <input type="checkbox" checked={Boolean(settings.micAgc)} onChange={toggleAgc} disabled={Boolean(busy)} />
            Automatische Verstärkung
          </label>
          <button className="btn btn--quiet" onClick={runDiag} disabled={Boolean(busy)}>
            {busy === 'diagnose' ? 'Teste … jetzt 3–4 Mal anschlagen' : 'Mikrofon-Test'}
          </button>
        </div>
      )}
      {error && <p className="listen__error">{error}</p>}
      {diag && (
        <pre className="listen__diag">{`Mikrofon: ${diag.label}
Abtastrate: ${diag.rate} Hz, Kanäle: ${diag.channels ?? '?'}, Verstärkung: ${diag.agc ? 'an' : 'aus'}
Grundrauschen: ${(diag.floor * 1000).toFixed(3)}
Lautester Pegel: ${(diag.max * 1000).toFixed(2)} (Spitze ${(diag.peakSample * 1000).toFixed(1)})
Erkannte Anschläge: ${diag.onsets}
Benötigt bei Empfindlichkeit ${sens}: ${(onsetMinLevel(diag.floor, sens) * 1000).toFixed(2)}`}</pre>
      )}

      {mode !== 'timing' && (
        <div className="listen__pick">
          <label>
            Lied
            <select value={songId || ''} onChange={(e) => onSongId(e.target.value || null)} disabled={Boolean(busy)}>
              <option value="">Kein Lied</option>
              {catSongs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
          {(mode === 'saiten' || mode === 'akkord') && <>
          <label>
            Akkord
            <select value={chord} onChange={(e) => { setChord(e.target.value); setFree(''); setStrRes({}); setChordRes(null); }} disabled={Boolean(busy)}>
              {mode === 'saiten' && <option value={OPEN_CHORD}>Leersaiten (Stimmung)</option>}
              {chords.map((c) => <option key={c} value={c}>{displayChord(c, n)}</option>)}
              {!chords.includes('G') && <option value="G">G</option>}
              {!chords.includes('C') && <option value="C">C</option>}
            </select>
          </label>
          <label>
            oder eingeben
            <input value={free} placeholder="z. B. Fmaj7" onChange={(e) => { setFree(e.target.value); setStrRes({}); setChordRes(null); }} disabled={Boolean(busy)} />
          </label>
          </>}
          {capo > 0 && (mode === 'saiten' || mode === 'akkord' || mode === 'wechsel') && activeChord !== OPEN_CHORD && <p className="listen__capo">Capo {capo} aus dem Lied wird berücksichtigt.</p>}
        </div>
      )}

      {mode === 'wechsel' && audio && (
        <ChangeTrainer
          audio={audio} chords={chords} capo={capo} sens={sens} practice={practice} category={category.id}
          onPractice={log} notation={n} onAskTeacher={(t) => onAskTeacher(t, song?.id || null)}
        />
      )}
      {mode === 'stimme' && audio && (
        <VoiceCoach
          audio={audio} profile={profile} onProfile={onProfile} song={song}
          onSongChange={(patch) => song && onSongChange(song.id, patch)}
          onPractice={log} notation={n} onAskTeacher={(t) => onAskTeacher(t, song?.id || null)}
        />
      )}
      {mode === 'kamera' && (
        <Camera category={category.id} song={song} onAskTeacher={onAskTeacher} />
      )}
      {mode === 'aufnahme' && audio && (
        <Recorder audio={audio} song={song} songs={songs} category={category.id} onPractice={log} onAskTeacher={onAskTeacher} />
      )}

      {mode === 'saiten' && (
        <div className="listen__body">
          <div className="listen__shape">
            {activeChord !== OPEN_CHORD && <ChordDiagram chord={activeChord} notation={n} size={1.3} />}
            <ol className="strings">
              {[...expected].reverse().map((e) => {
                const r = strRes[e.s];
                return (
                  <li key={e.s} className={'str' + (current === e.s ? ' is-now' : '') + (r ? ' str--' + r.status : '')}>
                    <span className="str__name">{STRING_NAMES[e.s]}</span>
                    <span className="str__note">{noteLabel(e.midi, n)}</span>
                    <span className="str__res">
                      {current === e.s ? 'jetzt anschlagen …' : r ? (r.status === 'falsch' ? `${STATUS_TEXT.falsch}: ${noteLabel(r.midi, n)}` : STATUS_TEXT[r.status]) : ''}
                      {r && r.status === 'ok' && Math.abs(r.cents) >= 10 ? ` (${r.cents > 0 ? '+' : ''}${r.cents} Cent)` : ''}
                    </span>
                    {r && !busy && <button className="btn btn--quiet str__again" onClick={() => runStrings(e.s)} disabled={!audio}>nochmal</button>}
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="listen__hint">
            {activeChord === OPEN_CHORD
              ? 'Saiten einzeln leer anschlagen, von der tiefen E zur hohen e. Zeigt, ob die Gitarre gestimmt ist (± Cent).'
              : 'Akkord greifen und halten. Dann jede Saite einzeln anschlagen, von tief nach hoch, und ausklingen lassen. „Gedämpft“ heißt meist: ein Finger berührt die Saite oder drückt zu schwach.'}
          </p>
          <div className="listen__actions">
            {busy === 'saiten'
              ? <button className="btn" onClick={stop}>Abbrechen</button>
              : <button className="btn btn--primary" onClick={() => runStrings()} disabled={!audio || !expected.length}>Prüfung starten</button>}
            {Object.keys(strRes).length > 0 && !busy && (
              <button className="btn btn--quiet" onClick={() => ask(stringsSummary())}>Lehrer kommentieren lassen</button>
            )}
          </div>
        </div>
      )}

      {mode === 'akkord' && (
        <div className="listen__body">
          <div className="listen__shape">
            {activeChord !== OPEN_CHORD && <ChordDiagram chord={activeChord} notation={n} size={1.3} />}
            <div className="chroma" aria-label="Gehörte Töne">
              {Array.from({ length: 12 }, (_, p) => {
                const v = chordRes ? chordRes.chroma[p] : 0;
                const isExp = chordRes ? chordRes.exp.includes(p) : expected.some((e) => pc(e.midi) === p);
                return (
                  <div key={p} className={'chroma__col' + (isExp ? ' is-exp' : '') + (chordRes?.extra.includes(p) ? ' is-extra' : '')}>
                    <div className="chroma__bar"><div style={{ height: Math.round(v * 100) + '%' }} /></div>
                    <span>{pcLabel(p, n)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {chordRes && (
            <p className={'listen__verdict listen__verdict--' + chordRes.verdict}>
              {chordRes.verdict === 'gut' && 'Klingt sauber: Die Akkordtöne dominieren.'}
              {chordRes.verdict === 'teilweise' && `Fast: ${chordRes.missing.length ? 'schwach oder fehlend ' + chordRes.missing.map((p) => pcLabel(p, n)).join(', ') + '. ' : ''}Mit „Saite für Saite“ findest du die Ursache.`}
              {chordRes.verdict === 'falsch' && `Da klingen Töne, die nicht in den Akkord gehören${chordRes.extra.length ? ': ' + chordRes.extra.map((p) => pcLabel(p, n)).join(', ') : ''}. Meist ein Finger auf dem falschen Bund oder eine Saite, die nicht klingen soll.`}
              {' '}({Math.round(chordRes.score * 100)} %)
            </p>
          )}
          <p className="listen__hint">Petrol markiert die Töne, die der Akkord haben soll. Akkord einmal kräftig anschlagen und ausklingen lassen.</p>
          <div className="listen__actions">
            {busy === 'akkord'
              ? <button className="btn" onClick={stop}>Abbrechen</button>
              : <button className="btn btn--primary" onClick={runChord} disabled={!audio || !expected.length}>Jetzt anschlagen</button>}
            {chordRes && !busy && <button className="btn btn--quiet" onClick={() => ask(chordSummary())}>Lehrer kommentieren lassen</button>}
          </div>
        </div>
      )}

      {mode === 'timing' && (
        <div className="listen__body">
          <div className="listen__pick">
            <label>Tempo (bpm)<input type="number" min="40" max="200" value={bpm} onChange={(e) => setBpm(Math.max(40, Math.min(200, Number(e.target.value) || 70)))} disabled={Boolean(busy)} /></label>
            <label>Takte<input type="number" min="2" max="16" value={bars} onChange={(e) => setBars(Math.max(2, Math.min(16, Number(e.target.value) || 4)))} disabled={Boolean(busy)} /></label>
            <p className="listen__capo">
              Latenz: {settings.latencyMs != null ? `${settings.latencyMs} ms (kalibriert)` : audio ? `${Math.round(audio.estimatedLatency * 1000)} ms (geschätzt)` : '–'}
              {audio && !busy && <button className="btn btn--quiet" onClick={calibrate}>Kalibrieren</button>}
            </p>
          </div>
          <div className="beats" aria-hidden="true">
            {Array.from({ length: 4 + bars * 4 }, (_, i) => (
              <span key={i} className={'beat' + (i < 4 ? ' beat--count' : '') + (i === beatNow ? ' is-now' : '') + (i >= 4 && (i - 4) % 4 === 0 ? ' beat--one' : '')} />
            ))}
          </div>
          {timing && <TimingChart t={timing} />}
          {timing && (
            <ul className="listen__verdicts">{timingVerdict(timing).map((v) => <li key={v}>{v}</li>)}</ul>
          )}
          <p className="listen__hint">
            Mit Kopfhörern spielen, damit das Mikrofon nur die Gitarre hört. Vier Klicks zählen ein, dann auf jede Zählzeit einen
            Abschlag. Kalibrieren einmalig über Lautsprecher: Die App misst dabei, wie lange Ton und Mikrofon zusammen brauchen.
          </p>
          <div className="listen__actions">
            {busy === 'timing'
              ? <button className="btn" onClick={stop}>Abbrechen</button>
              : <button className="btn btn--primary" onClick={runTiming} disabled={!audio || Boolean(busy)}>{busy === 'kalibrieren' ? 'Kalibriere …' : 'Start'}</button>}
            {timing && !busy && <button className="btn btn--quiet" onClick={() => ask(timingSummary())}>Lehrer kommentieren lassen</button>}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <aside className="listen__log">
          <h2>Letzte Messungen</h2>
          <ul>
            {recent.map((p, i) => (
              <li key={i}>
                <span>{new Date(p.at).toLocaleDateString('de-DE')}</span>
                {p.type === 'saiten' && <span>Saiten {p.chord}: {p.results.filter((r) => r.status === 'ok').length}/{p.results.length} sauber</span>}
                {p.type === 'akkord' && <span>Akkord {p.chord}: {p.score} %</span>}
                {p.type === 'timing' && <span>Timing {p.bpm} bpm: Streuung {p.sdMs} ms, Mittel {p.meanMs > 0 ? '+' : ''}{p.meanMs} ms</span>}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </section>
  );
}

function TimingChart({ t }) {
  const W = 640, H = 140, pad = 24, maxMs = 120;
  const x = (b) => pad + (b / Math.max(1, t.total - 1)) * (W - 2 * pad);
  const y = (ms) => H / 2 - (Math.max(-maxMs, Math.min(maxMs, ms)) / maxMs) * (H / 2 - 12);
  return (
    <svg className="timing-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Abweichung je Schlag">
      <rect x={pad} y={y(30)} width={W - 2 * pad} height={y(-30) - y(30)} className="tc-band" />
      <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} className="tc-zero" />
      <text x={4} y={14} className="tc-label">spät</text>
      <text x={4} y={H - 4} className="tc-label">früh</text>
      {t.hits.map((h) => (
        <circle key={h.beat} cx={x(h.beat)} cy={y(h.offsetMs)} r={5} className={Math.abs(h.offsetMs) <= 30 ? 'tc-dot' : 'tc-dot tc-dot--off'} />
      ))}
    </svg>
  );
}
