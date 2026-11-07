import { useEffect, useMemo, useRef, useState } from 'react';
import { saveRecording, deleteRecording, listRecordings } from '../lib/recordings.js';
import { tempoCurve } from '../lib/audio/dsp.js';
import { newId } from '../lib/storage.js';

function pickMime() {
  for (const m of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  }
  return '';
}

function summarize(curve) {
  if (!curve.length) return null;
  const avg = (arr) => arr.reduce((s, x) => s + x.bpm, 0) / arr.length;
  const start = avg(curve.slice(0, 2)), end = avg(curve.slice(-2));
  const mean = avg(curve);
  const sd = Math.sqrt(curve.reduce((s, x) => s + (x.bpm - mean) ** 2, 0) / curve.length);
  return { start: Math.round(start), end: Math.round(end), varPct: Math.round((sd / mean) * 100) };
}

export default function Recorder({ audio, song, category, songs, onPractice, onAskTeacher }) {
  const [list, setList] = useState([]);
  const [rec, setRec] = useState(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const urls = useRef(new Map());

  const reload = async () => { try { setList(await listRecordings(category)); } catch (e) { setErr('Aufnahmen konnten nicht geladen werden: ' + e.message); } };
  useEffect(() => { reload(); }, [category]); // eslint-disable-line
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const urlFor = (r) => {
    if (!urls.current.has(r.id)) urls.current.set(r.id, URL.createObjectURL(r.blob));
    return urls.current.get(r.id);
  };

  const start = () => {
    if (!window.MediaRecorder) { setErr('Dieser Browser kann nicht aufnehmen.'); return; }
    setErr('');
    const mime = pickMime();
    const mr = new MediaRecorder(audio.stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const t0 = performance.now();
    const iv = setInterval(() => setSecs(Math.floor((performance.now() - t0) / 1000)), 250);
    mr.onstop = async () => {
      clearInterval(iv);
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      const seconds = (performance.now() - t0) / 1000;
      setRec(null);
      setAnalyzing(true);
      let curve = [];
      try {
        const buf = await audio.ctx.decodeAudioData(await blob.arrayBuffer());
        curve = tempoCurve(buf.getChannelData(0), buf.sampleRate, song?.tempo || null);
      } catch { /* Analyse optional */ }
      const sum = summarize(curve);
      const item = { id: newId(), category, songId: song?.id || null, songTitle: song?.title || 'Freies Spiel', at: new Date().toISOString(), seconds, blob, tempo: curve, summary: sum };
      try { await saveRecording(item); } catch (e) { setErr('Speichern fehlgeschlagen: ' + e.message); }
      if (sum) onPractice({ type: 'aufnahme', seconds, tempoStart: sum.start, tempoEnd: sum.end });
      setAnalyzing(false);
      reload();
    };
    mr.start(1000);
    setRec(mr);
    setSecs(0);
  };

  const remove = async (r) => {
    if (!confirm('Aufnahme löschen?')) return;
    await deleteRecording(r.id);
    reload();
  };

  const shown = useMemo(() => list.filter((r) => r.kind !== 'video' && (!song || r.songId === song.id)), [list, song]);

  return (
    <div className="listen__body">
      <p className="listen__hint">
        Spiel {song ? `„${song.title}“` : 'ein Lied'} einmal komplett mit Gesang. Beim Anhören fallen Tempo-Wackler und
        Hänger auf, die beim Spielen untergehen. Die App zeigt zusätzlich, ob dein Tempo über das Lied gleich bleibt.
        Aufnahmen bleiben nur auf diesem Gerät.
      </p>
      <div className="listen__actions">
        {rec
          ? <button className="btn btn--primary is-active" onClick={() => rec.stop()}>Aufnahme beenden ({Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')})</button>
          : <button className="btn btn--primary" onClick={start} disabled={!audio || analyzing}>{analyzing ? 'Werte aus …' : 'Aufnahme starten'}</button>}
      </div>
      {err && <p className="listen__error">{err}</p>}

      <ul className="recs">
        {shown.length === 0 && <li className="listen__hint">Noch keine Aufnahmen{song ? ' zu diesem Lied' : ''}.</li>}
        {shown.map((r) => (
          <li key={r.id} className="rec">
            <div className="rec__head">
              <strong>{r.songTitle}</strong>
              <span>{new Date(r.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · {Math.floor(r.seconds / 60)}:{String(Math.round(r.seconds % 60)).padStart(2, '0')}</span>
            </div>
            <audio controls preload="none" src={urlFor(r)} />
            {r.summary && (
              <div className="rec__tempo">
                <TempoLine curve={r.tempo} target={songs.find((s) => s.id === r.songId)?.tempo} />
                <span>
                  Tempo {r.summary.start} → {r.summary.end} bpm, Schwankung {r.summary.varPct} %
                  {r.summary.end - r.summary.start >= 5 ? ' · wird schneller' : r.summary.start - r.summary.end >= 5 ? ' · wird langsamer' : ' · gleichmäßig'}
                </span>
              </div>
            )}
            <div className="rec__actions">
              {r.summary && (
                <button className="btn btn--quiet" onClick={() => onAskTeacher(`Aufnahme von „${r.songTitle}“ (${Math.round(r.seconds)} s): Tempo am Anfang ${r.summary.start} bpm, am Ende ${r.summary.end} bpm, Schwankung ${r.summary.varPct} %. Was bedeutet das und wie übe ich ein stabileres Tempo beim Singen?`, r.songId)}>Lehrer kommentieren lassen</button>
              )}
              <a className="btn btn--quiet" href={urlFor(r)} download={`${r.songTitle}-${r.at.slice(0, 10)}.webm`}>Herunterladen</a>
              <button className="btn btn--quiet" onClick={() => remove(r)}>Löschen</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TempoLine({ curve, target }) {
  if (!curve || curve.length < 2) return null;
  const W = 220, H = 48;
  const vals = curve.map((c) => c.bpm);
  const lo = Math.min(...vals, target || Infinity) - 3, hi = Math.max(...vals, target || -Infinity) + 3;
  const x = (i) => (i / (curve.length - 1)) * (W - 4) + 2;
  const y = (v) => H - 2 - ((v - lo) / (hi - lo)) * (H - 4);
  return (
    <svg className="tempo-line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tempoverlauf">
      {target ? <line x1="0" x2={W} y1={y(target)} y2={y(target)} className="tl-target" /> : null}
      <polyline points={curve.map((c, i) => `${x(i)},${y(c.bpm)}`).join(' ')} className="tl-line" />
    </svg>
  );
}
