import { useEffect, useRef, useState } from 'react';
import { saveRecording, deleteRecording, listRecordings } from '../lib/recordings.js';
import { tempoCurve } from '../lib/audio/dsp.js';
import { newId } from '../lib/storage.js';

const SPEEDS = [0.25, 0.5, 0.75, 1];
const MAX_SNAPS = 3;

function pickVideoMime() {
  for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']) {
    if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  }
  return '';
}

/** Standbild aus einem <video> als JPEG (base64 ohne Präfix) plus kleines Vorschaubild */
function grab(video, mirrored) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  const draw = (maxW, quality) => {
    const scale = Math.min(1, maxW / w);
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const g = c.getContext('2d');
    if (mirrored) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  };
  const full = draw(1280, 0.85);
  return { data: full.split(',')[1], thumb: draw(240, 0.7), mirrored };
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function Camera({ category, song, onAskTeacher }) {
  const liveRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [facing, setFacing] = useState('user');
  const [mirror, setMirror] = useState(true);
  const [err, setErr] = useState('');
  const [rec, setRec] = useState(null);
  const [secs, setSecs] = useState(0);
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [snaps, setSnaps] = useState([]);
  const [storage, setStorage] = useState(null);
  const urls = useRef(new Map());

  const reload = async () => {
    try { setList((await listRecordings(category)).filter((r) => r.kind === 'video')); } catch (e) { setErr(e.message); }
    try { const est = await navigator.storage?.estimate?.(); if (est) setStorage(est); } catch { /* egal */ }
  };
  useEffect(() => { reload(); }, [category]); // eslint-disable-line
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  useEffect(() => { if (liveRef.current && stream) liveRef.current.srcObject = stream; }, [stream]);

  const urlFor = (r) => {
    if (!urls.current.has(r.id)) urls.current.set(r.id, URL.createObjectURL(r.blob));
    return urls.current.get(r.id);
  };

  const startCamera = async (opts = {}) => {
    setErr('');
    stream?.getTracks().forEach((t) => t.stop());
    const dev = opts.deviceId ?? deviceId;
    const face = opts.facing ?? facing;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: dev ? { deviceId: { exact: dev }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      setStream(s);
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch (e) {
      setErr(e.name === 'NotAllowedError'
        ? 'Kamera-Zugriff abgelehnt. In der Adresszeile auf das Schloss klicken und Kamera und Mikrofon erlauben.'
        : 'Kamera nicht verfügbar: ' + e.message);
    }
  };
  const stopCamera = () => { stream?.getTracks().forEach((t) => t.stop()); setStream(null); };

  const startRec = () => {
    const mime = pickVideoMime();
    const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 96_000 });
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const t0 = performance.now();
    const iv = setInterval(() => setSecs((performance.now() - t0) / 1000), 250);
    mr.onstop = async () => {
      clearInterval(iv);
      setRec(null);
      const blob = new Blob(chunks, { type: mr.mimeType || 'video/webm' });
      const seconds = (performance.now() - t0) / 1000;
      let summary = null;
      try {
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        const curve = tempoCurve(buf.getChannelData(0), buf.sampleRate, song?.tempo || null);
        if (curve.length) summary = { start: Math.round(curve[0].bpm), end: Math.round(curve[curve.length - 1].bpm) };
        ctx.close();
      } catch { /* Tonspur nicht auswertbar */ }
      const item = { id: newId(), kind: 'video', category, songId: song?.id || null, songTitle: song?.title || 'Freies Spiel', at: new Date().toISOString(), seconds, blob, mirrored: mirror, summary };
      try {
        await navigator.storage?.persist?.();
        await saveRecording(item);
      } catch (e) { setErr('Speichern fehlgeschlagen (Speicher voll?): ' + e.message); }
      await reload();
      setSelected(item.id);
    };
    mr.start(1000);
    setRec(mr);
    setSecs(0);
  };

  const snapLive = () => {
    const s = grab(liveRef.current, mirror);
    if (s) setSnaps((x) => [...x, s].slice(-MAX_SNAPS));
  };

  const remove = async (r) => {
    if (!confirm('Video löschen?')) return;
    await deleteRecording(r.id);
    if (selected === r.id) setSelected(null);
    reload();
  };

  const sel = list.find((r) => r.id === selected) || null;
  const usedMb = storage ? Math.round(storage.usage / 1e6) : null;
  const quotaMb = storage ? Math.round(storage.quota / 1e6) : null;

  return (
    <div className="listen__body camera">
      <div className="camera__live">
        {stream ? (
          <video ref={liveRef} autoPlay muted playsInline className={mirror ? 'is-mirror' : ''} />
        ) : (
          <div className="camera__off">
            <p>Kamera aus. Am besten auf Höhe des Griffbretts, etwa 1 m entfernt, Licht von vorn. Auf dem Handy liefert die hintere Kamera auf einem Stativ die besten Bilder.</p>
            <button className="btn btn--primary" onClick={() => startCamera()}>Kamera einschalten</button>
          </div>
        )}
        {rec && <span className="camera__rec">● {fmt(secs)}</span>}
      </div>

      {stream && (
        <div className="camera__bar">
          {devices.length > 1 && (
            <select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); startCamera({ deviceId: e.target.value }); }} aria-label="Kamera wählen" disabled={!!rec}>
              <option value="">Standardkamera</option>
              {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Kamera ${i + 1}`}</option>)}
            </select>
          )}
          <button className="btn" onClick={() => { const f = facing === 'user' ? 'environment' : 'user'; setFacing(f); setDeviceId(''); setMirror(f === 'user'); startCamera({ facing: f, deviceId: '' }); }} disabled={!!rec}>Vorn/hinten</button>
          <label className="tool__check"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Spiegeln</label>
          <button className="btn" onClick={snapLive}>Standbild</button>
          {rec
            ? <button className="btn btn--primary is-active" onClick={() => rec.stop()}>Aufnahme beenden</button>
            : <button className="btn btn--primary" onClick={startRec}>Video aufnehmen</button>}
          <button className="btn btn--quiet" onClick={stopCamera} disabled={!!rec}>Kamera aus</button>
        </div>
      )}
      {err && <p className="listen__error">{err}</p>}

      {sel && <Player key={sel.id} rec={sel} url={urlFor(sel)} onSnap={(s) => setSnaps((x) => [...x, s].slice(-MAX_SNAPS))} />}

      {snaps.length > 0 && (
        <SnapPanel
          snaps={snaps} song={song}
          onRemove={(i) => setSnaps((x) => x.filter((_, j) => j !== i))}
          onSend={(text) => { onAskTeacher(text, song?.id || null, { images: snaps.map((s) => s.data), thumbs: snaps.map((s) => s.thumb) }); setSnaps([]); }}
        />
      )}

      <div className="camera__list">
        <h2>Videos{song ? ` zu „${song.title}“` : ''}</h2>
        {usedMb !== null && <p className="listen__hint">Belegter Speicher im Browser: {usedMb} MB{quotaMb ? ` von etwa ${quotaMb} MB` : ''}. Videos bleiben auf diesem Gerät.</p>}
        <ul className="recs">
          {list.filter((r) => !song || r.songId === song.id).map((r) => (
            <li key={r.id} className={'rec' + (r.id === selected ? ' is-active' : '')}>
              <div className="rec__head">
                <strong>{r.songTitle}</strong>
                <span>{new Date(r.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · {fmt(r.seconds)} · {Math.round(r.blob.size / 1e6)} MB{r.summary ? ` · Tempo ${r.summary.start}→${r.summary.end} bpm` : ''}</span>
              </div>
              <div className="rec__actions">
                <button className="btn" onClick={() => setSelected(r.id)}>Ansehen</button>
                <a className="btn btn--quiet" href={urlFor(r)} download={`${r.songTitle}-${r.at.slice(0, 10)}.webm`}>Herunterladen</a>
                <button className="btn btn--quiet" onClick={() => remove(r)}>Löschen</button>
              </div>
            </li>
          ))}
          {list.length === 0 && <li className="listen__hint">Noch keine Videos.</li>}
        </ul>
      </div>
    </div>
  );
}

function Player({ rec, url, onSnap }) {
  const ref = useRef(null);
  const [rate, setRate] = useState(1);
  const [mirror, setMirror] = useState(Boolean(rec.mirrored));
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(rec.seconds || 0);
  const [paused, setPaused] = useState(true);
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [loop, setLoop] = useState(false);
  const loopRef = useRef({});
  loopRef.current = { a, b, loop };

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      setT(v.currentTime);
      const l = loopRef.current;
      if (l.loop && l.a !== null && l.b !== null && v.currentTime >= l.b) v.currentTime = l.a;
    };
    const onMeta = () => { if (Number.isFinite(v.duration)) setDur(v.duration); };
    const onPlay = () => setPaused(false), onPause = () => setPaused(true);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', onMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime); v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('durationchange', onMeta); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause);
    };
  }, []);

  const v = () => ref.current;
  const step = (d) => { v().pause(); v().currentTime = Math.max(0, v().currentTime + d); };
  const speed = (r) => { v().playbackRate = r; setRate(r); };

  return (
    <div className="player">
      <video ref={ref} src={url} playsInline className={mirror ? 'is-mirror' : ''} onClick={() => (paused ? v().play() : v().pause())} />
      <div className="player__seek">
        <button className="btn btn--primary btn--icon" onClick={() => (paused ? v().play() : v().pause())} aria-label={paused ? 'Abspielen' : 'Pause'}>{paused ? '▶' : '❚❚'}</button>
        <input type="range" min="0" max={Math.max(0.1, dur)} step="0.01" value={Math.min(t, dur || t)} onChange={(e) => { v().currentTime = Number(e.target.value); }} aria-label="Position" />
        <span className="vtime">{fmt(t)} / {fmt(dur)}</span>
      </div>
      <div className="vcontrols">
        <div className="tool">
          <span className="tool__label">Tempo</span>
          {SPEEDS.map((r) => <button key={r} className={'btn btn--icon' + (rate === r ? ' btn--primary is-active' : '')} onClick={() => speed(r)}>{r}×</button>)}
        </div>
        <div className="tool">
          <button className="btn btn--icon" onClick={() => step(-2)} aria-label="2 Sekunden zurück">−2 s</button>
          <button className="btn btn--icon" onClick={() => step(-1 / 30)} aria-label="Ein Bild zurück">◂|</button>
          <button className="btn btn--icon" onClick={() => step(1 / 30)} aria-label="Ein Bild vor">|▸</button>
        </div>
        <div className="tool">
          <span className="tool__label">Schleife</span>
          <button className="btn btn--icon" onClick={() => { setA(v().currentTime); setLoop(false); }}>A{a !== null ? ' ' + fmt(a) : ''}</button>
          <button className="btn btn--icon" onClick={() => { if (a !== null && v().currentTime > a) { setB(v().currentTime); setLoop(true); v().currentTime = a; v().play(); } }} disabled={a === null}>B{b !== null ? ' ' + fmt(b) : ''}</button>
          <button className={'btn' + (loop ? ' btn--primary is-active' : '')} onClick={() => setLoop((x) => !x)} disabled={a === null || b === null}>{loop ? 'an' : 'aus'}</button>
        </div>
        <div className="tool">
          <label className="tool__check"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Spiegeln</label>
          <button className="btn" onClick={() => { v().pause(); const s = grab(v(), mirror); if (s) onSnap(s); }}>Standbild für Lehrer</button>
        </div>
      </div>
    </div>
  );
}

function SnapPanel({ snaps, song, onRemove, onSend }) {
  const [text, setText] = useState(
    'Auf den Standbildern spiele ich Gitarre. Bitte schau dir Griffhand und Schlaghand an: Daumen, Handgelenk, Fingerstellung, Haltung. Was fällt dir auf, und was soll ich zuerst verbessern?'
  );
  const mirrored = snaps.some((s) => s.mirrored);
  return (
    <div className="snaps theory__card">
      <h2>Standbilder für den Lehrer ({snaps.length}/{MAX_SNAPS})</h2>
      <div className="snaps__row">
        {snaps.map((s, i) => (
          <figure key={i} className="snap">
            <img src={s.thumb} alt={`Standbild ${i + 1}`} />
            <button className="btn btn--quiet" onClick={() => onRemove(i)}>Entfernen</button>
          </figure>
        ))}
      </div>
      <label>Deine Frage<textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <p className="listen__hint">Der Lehrer sieht nur diese Einzelbilder, keine Bewegung. Haltung und Griffform kann er gut einschätzen, Druck und Spannung nicht.</p>
      <button
        className="btn btn--primary"
        onClick={() => onSend(`${text}\n\n(Hinweis: ${snaps.length} Standbild(er)${song ? ` beim Lied „${song.title}“` : ''}${mirrored ? '; spiegelverkehrt wie im Spiegel, die Griffhand erscheint also auf der anderen Seite' : '; nicht gespiegelt'}. Benenne nur, was du auf den Bildern sicher erkennst, und sag, wenn etwas nicht zu beurteilen ist.)`)}
      >
        An den Lehrer senden
      </button>
    </div>
  );
}
