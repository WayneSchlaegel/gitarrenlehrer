import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CATEGORIES, loadState, saveState, blankSong, exportState, importStateFile
} from './lib/storage.js';
import SongList from './components/SongList.jsx';
import SongSheet from './components/SongSheet.jsx';
import SongEditor from './components/SongEditor.jsx';
import Teacher from './components/Teacher.jsx';
import Listen from './components/Listen.jsx';
import Videos from './components/Videos.jsx';
import Theory from './components/Theory.jsx';
import ProfilePanel from './components/ProfilePanel.jsx';
import { readImportHash, clearImportHash } from './lib/bookmarklet.js';
import { parseSong } from './lib/parser.js';
import { syncable, syncOnce, changedSinceSync, mergeSync, isUntouchedDemo } from './lib/sync.js';

const AREAS = [
  { id: 'lieder', label: 'Lieder' },
  { id: 'lehrer', label: 'Lehrer' },
  { id: 'hoeren', label: 'Hören' },
  { id: 'videos', label: 'Videos' },
  { id: 'theorie', label: 'Theorie' }
];

const VIEW_KEY = 'gitarrenlehrer.view';

export default function App() {
  const [state, setState] = useState(loadState);
  const [view, setView] = useState(() => {
    try { return { category: 'western', area: 'lieder', ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') }; }
    catch { return { category: 'western', area: 'lieder' }; }
  });
  const [songId, setSongId] = useState(null);
  const [editing, setEditing] = useState(null); // Liedentwurf oder null
  const [panel, setPanel] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingAsk, setPendingAsk] = useState(null);

  useEffect(() => {
    if (!saveState(state)) setNotice('Speichern im Browser fehlgeschlagen. Bitte Sicherung herunterladen.');
  }, [state]);
  useEffect(() => { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); }, [view]);

  // ---------- Abgleich zwischen Geräten ----------
  const [syncStatus, setSyncStatus] = useState({ busy: false, at: null, error: '' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const syncBusy = useRef(false);
  const canSync = state.settings.syncOn && state.settings.apiUrl && state.settings.apiToken;
  const runSync = useCallback(async (force = false) => {
    const st = stateRef.current;
    if (syncBusy.current || !(st.settings.syncOn && st.settings.apiUrl && st.settings.apiToken)) return;
    if (!force && !changedSinceSync(syncable(st)) && syncStatus.at && Date.now() - new Date(syncStatus.at) < 55000) return;
    syncBusy.current = true;
    setSyncStatus((s) => ({ ...s, busy: true }));
    try {
      const res = await syncOnce(st.settings, syncable(st));
      if (res.merged) setState((cur) => {
        const base = syncable(cur);
        if (res.firstSync) base.songs = base.songs.filter((s) => !isUntouchedDemo(s) || res.merged.songs.some((m) => m.id === s.id));
        return { ...cur, ...mergeSync(base, res.merged) };
      });
      setSyncStatus({ busy: false, at: res.at, error: '' });
    } catch (e) {
      setSyncStatus((s) => ({ ...s, busy: false, error: e.message }));
    } finally {
      syncBusy.current = false;
    }
  }, [syncStatus.at]);
  // Beim Start, alle 60 s und beim Zurückkehren zur App
  useEffect(() => {
    if (!canSync) return;
    runSync(true);
    const iv = setInterval(() => runSync(true), 60000);
    const vis = () => { if (document.visibilityState === 'visible') runSync(true); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, [canSync]); // eslint-disable-line react-hooks/exhaustive-deps
  // Nach lokalen Änderungen mit 5 s Verzögerung
  useEffect(() => {
    if (!canSync) return;
    const t = setTimeout(() => { if (changedSinceSync(syncable(stateRef.current))) runSync(true); }, 5000);
    return () => clearTimeout(t);
  }, [state.songs, state.videos, state.practice, state.chats, state.profile, state.patterns]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lied vom Lesezeichen-Skript übernehmen (#import=...)
  useEffect(() => {
    const take = () => {
      const data = readImportHash();
      if (!data) return;
      clearImportHash();
      const meta = parseSong(data.raw).meta;
      setView((v) => ({ ...v, area: 'lieder' }));
      setSongId(null);
      setEditing((cur) => ({
        ...blankSong(cur?.category || view.category),
        title: data.title || meta.title || '',
        artist: data.artist || meta.artist || '',
        raw: data.raw,
        capo: meta.capo || 0,
        sheetCapo: meta.capo || 0,
        tempo: meta.tempo || null,
        source: data.source,
        importedHow: data.how
      }));
    };
    take();
    window.addEventListener('hashchange', take);
    return () => window.removeEventListener('hashchange', take);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(t); } }, [notice]);

  const category = CATEGORIES.find((c) => c.id === view.category) || CATEGORIES[0];
  const song = state.songs.find((s) => s.id === songId);

  const updateSong = useCallback((id, patch) => {
    const updated = new Date().toISOString();
    setState((st) => ({ ...st, songs: st.songs.map((s) => (s.id === id ? { ...s, ...patch, updated } : s)) }));
  }, []);
  const updateSettings = useCallback((patch) => setState((st) => ({ ...st, settings: { ...st.settings, ...patch } })), []);
  const addPractice = useCallback((entry) => setState((st) => ({ ...st, practice: [...(st.practice || []), entry].slice(-300) })), []);
  const setVideos = useCallback((videos) => setState((st) => {
    const now = new Date().toISOString();
    const ids = new Set(videos.map((v) => v.id));
    const removed = (st.videos || []).filter((v) => !ids.has(v.id)).map((v) => ({ kind: 'video', id: v.id, at: now }));
    const before = new Map((st.videos || []).map((v) => [v.id, v]));
    const stamped = videos.map((v) => (before.get(v.id) === v ? v : { ...v, updated: now }));
    return { ...st, videos: stamped, deleted: [...(st.deleted || []), ...removed] };
  }), []);
  const setPatterns = useCallback((patterns) => setState((st) => {
    const ids = new Set(patterns.map((p) => p.id));
    const now = new Date().toISOString();
    const removed = (st.patterns || []).filter((p) => !ids.has(p.id)).map((p) => ({ kind: 'pattern', id: p.id, at: now }));
    return { ...st, patterns, deleted: [...(st.deleted || []), ...removed] };
  }), []);
  const openVideo = (id) => { setView((v) => ({ ...v, area: 'videos', videoId: id })); };
  const setChat = useCallback((catId, msgs) => setState((st) => ({ ...st, chats: { ...st.chats, [catId]: msgs } })), []);
  const updateProfile = useCallback((patch) => setState((st) => ({ ...st, profile: { ...st.profile, ...patch, updated: new Date().toISOString() } })), []);

  const saveSong = (s) => {
    setState((st) => {
      const exists = st.songs.some((x) => x.id === s.id);
      return { ...st, songs: exists ? st.songs.map((x) => (x.id === s.id ? s : x)) : [...st.songs, s] };
    });
    if (s.category !== view.category) setView((v) => ({ ...v, category: s.category }));
    setSongId(s.id);
    setEditing(null);
    setNotice('Gespeichert.');
  };

  const deleteSong = (id) => {
    setState((st) => ({ ...st, songs: st.songs.filter((s) => s.id !== id), deleted: [...(st.deleted || []), { kind: 'song', id, at: new Date().toISOString() }] }));
    setEditing(null);
    setSongId(null);
    setNotice('Lied gelöscht.');
  };

  const importFile = async (file) => {
    try {
      const data = await importStateFile(file);
      if (!confirm(`${data.songs.length} Lieder einspielen? Die Lieder in diesem Browser werden ersetzt.`)) return;
      // Verbindung zum Lehrer auf diesem Gerät behalten
      setState((st) => ({ ...data, settings: { ...data.settings, apiUrl: data.settings.apiUrl || st.settings.apiUrl, apiToken: st.settings.apiToken } }));
      setSongId(null);
      setNotice('Sicherung eingespielt.');
    } catch (e) {
      setNotice('Datei konnte nicht gelesen werden: ' + e.message);
    }
  };

  const goCategory = (id) => { setView((v) => ({ ...v, category: id })); setSongId(null); setEditing(null); };
  const goArea = (id) => { setView((v) => ({ ...v, area: id })); setEditing(null); };

  const askAbout = (id) => { setView((v) => ({ ...v, area: 'lehrer', chatSong: id })); };
  // extra: { images, thumbs } für Standbilder aus dem Kamerabereich
  const askWith = (text, id, extra = null) => { setPendingAsk(extra ? { text, ...extra } : text); setView((v) => ({ ...v, area: 'lehrer', chatSong: id || v.chatSong })); };

  let main;
  if (view.area === 'lehrer')
    main = (
      <Teacher
        key={category.id}
        category={category}
        profile={state.profile}
        songs={state.songs}
        settings={state.settings}
        messages={state.chats[category.id] || []}
        onMessages={(msgs) => setChat(category.id, msgs)}
        songId={view.chatSong}
        onSongId={(id) => setView((v) => ({ ...v, chatSong: id }))}
        onOpenSettings={() => setPanel(true)}
        pending={pendingAsk}
        practice={state.practice || []}
        onPendingDone={() => setPendingAsk(null)}
      />
    );
  else if (view.area === 'hoeren')
    main = (
      <Listen
        key={category.id}
        category={category}
        songs={state.songs}
        settings={state.settings}
        onSettings={updateSettings}
        songId={view.chatSong}
        onSongId={(id) => setView((v) => ({ ...v, chatSong: id }))}
        practice={state.practice || []}
        onPractice={addPractice}
        onAskTeacher={askWith}
        profile={state.profile}
        onProfile={updateProfile}
        onSongChange={updateSong}
      />
    );
  else if (view.area === 'videos')
    main = (
      <Videos
        key={category.id}
        category={category}
        songs={state.songs}
        settings={state.settings}
        videos={state.videos || []}
        onVideos={setVideos}
        selectedId={view.videoId}
        onSelect={(id) => setView((v) => ({ ...v, videoId: id }))}
        onOpenSettings={() => setPanel(true)}
      />
    );
  else if (view.area === 'theorie')
    main = (
      <Theory
        key={category.id}
        category={category}
        songs={state.songs}
        settings={state.settings}
        songId={view.chatSong}
        onSongId={(id) => setView((v) => ({ ...v, chatSong: id }))}
        onAskTeacher={askWith}
        patterns={state.patterns || []}
        onPatterns={setPatterns}
      />
    );
  else if (editing)
    main = (
      <SongEditor
        key={editing.id}
        song={editing}
        onSave={saveSong}
        onCancel={() => setEditing(null)}
        onDelete={state.songs.some((s) => s.id === editing.id) ? () => deleteSong(editing.id) : null}
      />
    );
  else if (song)
    main = (
      <SongSheet
        key={song.id}
        song={song}
        settings={state.settings}
        onChange={(patch) => updateSong(song.id, patch)}
        onSettings={updateSettings}
        onEdit={() => setEditing(song)}
        onAsk={() => askAbout(song.id)}
        videos={(state.videos || []).filter((v) => v.songIds?.includes(song.id))}
        onOpenVideo={openVideo}
        customPatterns={state.patterns || []}
        onBack={() => setSongId(null)}
      />
    );
  else
    main = (
      <SongList
        songs={state.songs}
        category={category}
        onOpen={setSongId}
        onNew={() => setEditing(blankSong(category.id))}
      />
    );

  return (
    <div className="app">
      <nav className="rail" aria-label="Gitarre wählen">
        <div className="rail__brand" aria-hidden="true">
          <svg viewBox="0 0 64 64"><g stroke="currentColor" strokeWidth="2.4"><path d="M14 14v36M21.2 14v36M28.4 14v36M35.6 14v36M42.8 14v36M50 14v36"/><path d="M14 14h36" strokeWidth="4"/><path d="M14 26h36M14 38h36"/></g><circle cx="28.4" cy="20" r="3.8" fill="var(--brass)"/><circle cx="42.8" cy="32" r="3.8" fill="var(--brass)"/></svg>
        </div>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={'rail__cat' + (c.id === category.id ? ' is-active' : '')}
            onClick={() => goCategory(c.id)}
            aria-current={c.id === category.id ? 'page' : undefined}
          >
            <span className="rail__num">{c.numeral}</span>
            <span className="rail__name">{c.name}</span>
          </button>
        ))}
        <button className="rail__profile" onClick={() => setPanel(true)}>
          Profil<span className="rail__profile-long"> und Sichern</span>
        </button>
      </nav>

      <div className="workspace">
        <header className="topbar">
          <p className="topbar__guitar">
            {category.name}
            {state.profile.guitars[category.id] ? <span>{state.profile.guitars[category.id]}</span> : null}
          </p>
          <div className="tabs" role="tablist">
            {AREAS.map((a) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={view.area === a.id}
                className={view.area === a.id ? 'is-active' : ''}
                onClick={() => goArea(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </header>
        <main className="main">{main}</main>
      </div>

      {panel && (
        <ProfilePanel
          profile={state.profile}
          settings={state.settings}
          onProfile={updateProfile}
          onSettings={updateSettings}
          onExport={() => exportState(state)}
          onImport={importFile}
          syncStatus={syncStatus}
          onSyncNow={() => runSync(true)}
          onClose={() => setPanel(false)}
        />
      )}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
