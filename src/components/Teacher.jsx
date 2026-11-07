import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from './Markdown.jsx';
import { askTeacher, apiHistory, buildSystemPrompt, withImages } from '../lib/teacher.js';

const SONG_PROMPTS = [
  'Wie übe ich dieses Lied am besten? Gib mir einen Plan für die nächsten 7 Tage, je 20 Minuten.',
  'Welche Akkordwechsel in diesem Lied sind am schwierigsten, und wie übe ich sie?',
  'Schlag mir ein passendes Schlagmuster vor, mit Zählzeiten.',
  'Ich singe eher tief. Welche Tonart und welcher Capo wären sinnvoll?'
];
const GENERAL_PROMPTS = [
  'Ich will sauberer greifen, es schnarrt oft. Woran liegt das und was übe ich?',
  'Wie lerne ich, gleichzeitig zu spielen und zu singen?',
  'Stell mir ein 15-Minuten-Aufwärmprogramm zusammen.',
  'Welche Lieder aus meinem Liederbuch passen zusammen, um ähnliche Griffe zu üben?'
];

export default function Teacher({ category, profile, songs, settings, messages, onMessages, songId, onSongId, onOpenSettings, pending, onPendingDone, practice = [] }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef(null);
  const partialRef = useRef('');
  const endRef = useRef(null);
  const catSongs = useMemo(() => songs.filter((s) => s.category === category.id), [songs, category]);
  const song = catSongs.find((s) => s.id === songId) || null;
  const connected = Boolean(settings.apiUrl && settings.apiToken);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, streamText]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Frage aus einem anderen Bereich (z. B. Hören) automatisch stellen
  useEffect(() => {
    if (!pending) return;
    onPendingDone?.();
    const p = typeof pending === 'string' ? { text: pending } : pending;
    if (settings.apiUrl && settings.apiToken) send(p.text, p.images || [], p.thumbs || []);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  // images: volle Bilder (nur für diese Anfrage), thumbs: kleine Vorschaubilder für den Verlauf
  const send = async (text, images = [], thumbs = []) => {
    const q = text.trim();
    if (!q || busy) return;
    const userMsg = { role: 'user', content: q, at: new Date().toISOString(), songTitle: song?.title || null, ...(thumbs.length ? { thumbs } : {}) };
    const next = [...messages, userMsg];
    onMessages(next);
    setInput('');
    setBusy(true);
    setStreamText('');
    partialRef.current = '';
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const system = buildSystemPrompt({ profile, categoryId: category.id, songs, song, practice });
      const { text: answer, stopReason } = await askTeacher({
        apiUrl: settings.apiUrl,
        apiToken: settings.apiToken,
        system,
        messages: withImages(apiHistory(next), images),
        onText: (s) => { partialRef.current = s; setStreamText(s); },
        signal: ctrl.signal
      });
      if (!answer.trim()) {
        onMessages([...next, {
          role: 'assistant', error: true, at: new Date().toISOString(),
          content: stopReason === 'max_tokens'
            ? 'Die Antwort war leer: Das Längenlimit im Worker (MAX_TOKENS in wrangler.toml) ist zu knapp. Wert erhöhen und neu deployen, dann noch einmal fragen.'
            : 'Die Antwort war leer. Bitte noch einmal fragen.'
        }]);
      } else {
        const cut = stopReason === 'max_tokens'
          ? '\n\n*Antwort wegen Längenbegrenzung abgeschnitten. Schreib „weiter“, dann setzt der Lehrer fort.*'
          : '';
        onMessages([...next, { role: 'assistant', content: answer + cut, at: new Date().toISOString() }]);
      }
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Abgebrochen.' : e.message || 'Unbekannter Fehler.';
      const partial = partialRef.current;
      onMessages([
        ...next,
        partial ? { role: 'assistant', content: partial, at: new Date().toISOString() } : null,
        { role: 'assistant', content: msg, error: true, at: new Date().toISOString() }
      ].filter(Boolean));
    } finally {
      setBusy(false);
      setStreamText('');
      abortRef.current = null;
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(input); }
  };

  if (!connected) {
    return (
      <section className="teacher teacher--setup">
        <h1>Lehrer</h1>
        <p>Der Lehrer braucht eine Verbindung zu deinem Cloudflare Worker.</p>
        <p>Trag unter „Profil und Sichern“ → „Lehrer-Verbindung“ die Worker-Adresse und deinen Zugangsschlüssel ein.</p>
        <button className="btn btn--primary" onClick={onOpenSettings}>Verbindung einrichten</button>
      </section>
    );
  }

  const prompts = song ? SONG_PROMPTS : GENERAL_PROMPTS;

  return (
    <section className="teacher">
      <header className="teacher__head">
        <h1>Lehrer</h1>
        <label className="teacher__song">
          Bezug
          <select value={songId || ''} onChange={(e) => onSongId(e.target.value || null)}>
            <option value="">Kein bestimmtes Lied</option>
            {catSongs.map((s) => <option key={s.id} value={s.id}>{s.title}{s.artist ? ' – ' + s.artist : ''}</option>)}
          </select>
        </label>
        {messages.length > 0 && (
          <button
            className="btn btn--quiet"
            onClick={() => { if (confirm('Gespräch löschen und neu beginnen?')) onMessages([]); }}
            disabled={busy}
          >
            Neues Gespräch
          </button>
        )}
      </header>

      <div className="chat" aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="chat__start">
            <p>
              {song
                ? `Frag etwas zu „${song.title}“ oder allgemein zum Spielen auf der ${category.name}.`
                : `Frag etwas zum Spielen auf der ${category.name}. Wähle oben ein Lied, wenn es um ein bestimmtes Stück geht.`}
            </p>
            <div className="chips">
              {prompts.map((p) => <button key={p} className="chip" onClick={() => send(p)}>{p}</button>)}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={'msg msg--' + m.role + (m.error ? ' msg--error' : '')}>
            {m.role === 'user' ? (
              <>
                {m.songTitle && <span className="msg__ref">{m.songTitle}</span>}
                {m.thumbs?.length > 0 && <span className="msg__thumbs">{m.thumbs.map((t, j) => <img key={j} src={t} alt={`Standbild ${j + 1}`} />)}</span>}
                <p>{m.content}</p>
              </>
            ) : m.error ? <p>{m.content}</p> : <Markdown text={m.content} />}
          </div>
        ))}

        {busy && (
          <div className="msg msg--assistant">
            {streamText ? <Markdown text={streamText} /> : <p className="msg__wait">Der Lehrer überlegt …</p>}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="Deine Frage … (Strg+Enter sendet)"
          aria-label="Frage an den Lehrer"
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>Abbrechen</button>
        ) : (
          <button type="submit" className="btn btn--primary" disabled={!input.trim()}>Fragen</button>
        )}
      </form>
    </section>
  );
}
