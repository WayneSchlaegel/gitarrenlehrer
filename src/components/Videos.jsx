import { useEffect, useMemo, useRef, useState } from 'react';
import { parseVideoId, parseStart, thumbUrl, videoInfo, searchVideos, loadYouTubeApi, fmtTime } from '../lib/youtube.js';
import { newId } from '../lib/storage.js';

const SPEEDS = [0.5, 0.75, 1];

export default function Videos({ category, songs, settings, videos, onVideos, selectedId, onSelect, onOpenSettings }) {
  const catVideos = useMemo(() => videos.filter((v) => v.category === category.id), [videos, category]);
  const catSongs = useMemo(() => songs.filter((s) => s.category === category.id), [songs, category]);
  const [filterSong, setFilterSong] = useState('');
  const [input, setInput] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const connected = Boolean(settings.apiUrl && settings.apiToken);
  const selected = catVideos.find((v) => v.id === selectedId) || null;

  const update = (id, patch) => onVideos(videos.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const remove = (id) => { onVideos(videos.filter((v) => v.id !== id)); onSelect(null); };

  const addVideo = async (videoId, extra = {}) => {
    const existing = catVideos.find((v) => v.videoId === videoId);
    if (existing) { onSelect(existing.id); setMsg('Dieses Video ist schon gespeichert.'); return; }
    let info = { title: extra.title || '', channel: extra.channel || '' };
    if (!info.title && connected) info = await videoInfo(settings, videoId);
    const v = {
      id: newId(), videoId, category: category.id, title: info.title || 'YouTube-Video', channel: info.channel,
      songIds: filterSong ? [filterSong] : [], topic: '', notes: '', loops: [], start: extra.start || 0,
      added: new Date().toISOString()
    };
    onVideos([...videos, v]);
    onSelect(v.id);
    setMsg('');
  };

  const submit = async (e) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setMsg('');
    const id = parseVideoId(q);
    if (id) { setBusy(true); await addVideo(id, { start: parseStart(q) }); setBusy(false); setInput(''); return; }
    if (!connected) { setMsg('Für die Suche braucht es die Lehrer-Verbindung. YouTube-Links funktionieren auch ohne.'); return; }
    setBusy(true);
    try { setResults(await searchVideos(settings, q)); }
    catch (err) { setMsg(err.message); setResults(null); }
    finally { setBusy(false); }
  };

  const shown = filterSong ? catVideos.filter((v) => v.songIds.includes(filterSong)) : catVideos;

  return (
    <section className="videos">
      <aside className="videos__side">
        <h1>Videos</h1>
        <form onSubmit={submit} className="videos__add">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="YouTube-Link einfügen oder suchen"
            aria-label="YouTube-Link oder Suchbegriff"
          />
          <button className="btn btn--primary" disabled={busy || !input.trim()}>{parseVideoId(input) ? 'Hinzufügen' : 'Suchen'}</button>
        </form>
        {msg && <p className="videos__msg">{msg}</p>}
        {!connected && <p className="videos__hint">Suche: <button className="linkbtn" onClick={onOpenSettings}>Lehrer-Verbindung einrichten</button></p>}

        {results && (
          <div className="videos__results">
            <div className="videos__results-head">
              <h2>Suchergebnisse</h2>
              <button className="btn btn--quiet" onClick={() => setResults(null)}>Schließen</button>
            </div>
            {results.length === 0 && <p className="videos__hint">Nichts gefunden.</p>}
            <ul>
              {results.map((r) => (
                <li key={r.videoId}>
                  <button className="vcard" onClick={() => addVideo(r.videoId, r).then(() => setResults(null))}>
                    <img src={thumbUrl(r.videoId)} alt="" loading="lazy" />
                    <span className="vcard__t">{r.title}</span>
                    <span className="vcard__c">{r.channel} · hinzufügen</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="videos__filter">
          Zu Lied
          <select value={filterSong} onChange={(e) => setFilterSong(e.target.value)}>
            <option value="">Alle Videos ({catVideos.length})</option>
            {catSongs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        {shown.length === 0 ? (
          <p className="videos__hint">
            {catVideos.length ? 'Zu diesem Lied ist noch kein Video verknüpft.' : 'Noch keine Videos. Link von YouTube kopieren und oben einfügen.'}
          </p>
        ) : (
          <ul className="videos__list">
            {shown.map((v) => (
              <li key={v.id}>
                <button className={'vcard' + (v.id === selectedId ? ' is-active' : '')} onClick={() => onSelect(v.id)}>
                  <img src={thumbUrl(v.videoId)} alt="" loading="lazy" />
                  <span className="vcard__t">{v.title}</span>
                  <span className="vcard__c">
                    {v.topic || v.channel}
                    {v.songIds.length ? ' · ' + v.songIds.map((id) => songs.find((s) => s.id === id)?.title).filter(Boolean).join(', ') : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="videos__main">
        {selected ? (
          <VideoDetail key={selected.id} video={selected} songs={catSongs} onChange={(p) => update(selected.id, p)} onDelete={() => remove(selected.id)} />
        ) : (
          <div className="videos__empty">
            <p>Wähle links ein Video oder füge eines hinzu.</p>
            <p className="videos__hint">
              Im Player kannst du das Tempo verringern und eine Stelle in Schleife laufen lassen: bei Punkt A und Punkt B
              klicken, dann „Schleife“. Gespeicherte Stellen bleiben beim Video.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function VideoDetail({ video, songs, onChange, onDelete }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [rate, setRate] = useState(1);
  const [rates, setRates] = useState(SPEEDS);
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [loop, setLoop] = useState(false);
  const [now, setNow] = useState(0);
  const loopRef = useRef({ a: null, b: null, on: false });
  loopRef.current = { a, b, on: loop };

  useEffect(() => {
    let cancelled = false;
    let iv;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId: video.videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { rel: 0, playsinline: 1, start: Math.floor(video.start || 0), modestbranding: 1 },
        events: {
          onReady: (e) => {
            setReady(true);
            const av = e.target.getAvailablePlaybackRates?.() || [];
            const ok = SPEEDS.filter((s) => av.includes(s));
            if (ok.length) setRates(ok);
          },
          onError: () => setErr('Dieses Video lässt sich nicht einbetten. Über „Auf YouTube öffnen“ ansehen.')
        }
      });
      iv = setInterval(() => {
        const p = playerRef.current;
        if (!p?.getCurrentTime) return;
        const t = p.getCurrentTime();
        setNow(t);
        const l = loopRef.current;
        if (l.on && l.a !== null && l.b !== null && t >= l.b) p.seekTo(l.a, true);
      }, 150);
    }).catch((e) => setErr(e.message));
    return () => { cancelled = true; clearInterval(iv); try { playerRef.current?.destroy(); } catch { /* egal */ } };
  }, [video.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = () => playerRef.current;
  const setSpeed = (r) => { p()?.setPlaybackRate(r); setRate(r); };
  const jump = (d) => { const t = p()?.getCurrentTime() || 0; p()?.seekTo(Math.max(0, t + d), true); };
  const markA = () => { setA(p()?.getCurrentTime() || 0); setLoop(false); };
  const markB = () => { const t = p()?.getCurrentTime() || 0; if (a !== null && t > a) { setB(t); setLoop(true); p()?.seekTo(a, true); } };
  const saveLoop = () => {
    if (a === null || b === null) return;
    const label = prompt('Name für diese Stelle (z. B. „Riff Strophe“):', `Stelle ${fmtTime(a)}–${fmtTime(b)}`);
    if (label === null) return;
    onChange({ loops: [...(video.loops || []), { a, b, label: label.trim() || `Stelle ${fmtTime(a)}` }] });
  };
  const useLoop = (l) => { setA(l.a); setB(l.b); setLoop(true); p()?.seekTo(l.a, true); p()?.playVideo(); };
  const toggleSong = (id) => onChange({ songIds: video.songIds.includes(id) ? video.songIds.filter((x) => x !== id) : [...video.songIds, id] });

  return (
    <div className="vdetail">
      <div className="vplayer"><div ref={hostRef} /></div>
      {err && <p className="videos__msg">{err}</p>}

      <div className="vcontrols" aria-label="Wiedergabe">
        <div className="tool">
          <span className="tool__label">Tempo</span>
          {rates.map((r) => (
            <button key={r} className={'btn btn--icon' + (rate === r ? ' is-active btn--primary' : '')} onClick={() => setSpeed(r)} disabled={!ready}>{r}×</button>
          ))}
        </div>
        <div className="tool">
          <button className="btn btn--icon" onClick={() => jump(-5)} disabled={!ready} aria-label="5 Sekunden zurück">−5 s</button>
          <span className="tool__val vtime">{fmtTime(now)}</span>
        </div>
        <div className="tool">
          <span className="tool__label">Schleife</span>
          <button className="btn btn--icon" onClick={markA} disabled={!ready}>A{a !== null ? ' ' + fmtTime(a) : ''}</button>
          <button className="btn btn--icon" onClick={markB} disabled={!ready || a === null}>B{b !== null ? ' ' + fmtTime(b) : ''}</button>
          <button className={'btn' + (loop ? ' btn--primary is-active' : '')} onClick={() => setLoop((v) => !v)} disabled={a === null || b === null}>
            {loop ? 'Schleife an' : 'Schleife aus'}
          </button>
          {a !== null && b !== null && <button className="btn btn--quiet" onClick={saveLoop}>Stelle merken</button>}
        </div>
      </div>

      {(video.loops || []).length > 0 && (
        <div className="vloops">
          {video.loops.map((l, i) => (
            <span key={i} className="vloop">
              <button className="chip" onClick={() => useLoop(l)}>{l.label} ({fmtTime(l.a)}–{fmtTime(l.b)})</button>
              <button className="btn btn--quiet" aria-label="Stelle löschen" onClick={() => onChange({ loops: video.loops.filter((_, j) => j !== i) })}>×</button>
            </span>
          ))}
        </div>
      )}

      <div className="vmeta">
        <label>Titel<input value={video.title} onChange={(e) => onChange({ title: e.target.value })} /></label>
        <label>Thema<input placeholder="z. B. Schlagmuster, Barré, Riff" value={video.topic} onChange={(e) => onChange({ topic: e.target.value })} /></label>
        <label className="vmeta__notes">Notizen<textarea rows={3} value={video.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Was zeigt das Video, was übe ich daraus?" /></label>
        <fieldset className="vsongs">
          <legend>Verknüpft mit Liedern</legend>
          {songs.length === 0 && <p className="videos__hint">Noch keine Lieder in dieser Kategorie.</p>}
          {songs.map((s) => (
            <label key={s.id} className="vsongs__item">
              <input type="checkbox" checked={video.songIds.includes(s.id)} onChange={() => toggleSong(s.id)} />
              {s.title}
            </label>
          ))}
        </fieldset>
        <div className="vmeta__actions">
          <a className="btn btn--quiet" href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer">Auf YouTube öffnen</a>
          <button className="btn btn--danger" onClick={() => { if (confirm('Video aus der Liste entfernen?')) onDelete(); }}>Entfernen</button>
        </div>
      </div>
    </div>
  );
}
