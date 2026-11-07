import { useMemo, useState } from 'react';
import { STATUS } from '../lib/storage.js';
import { parseSong } from '../lib/parser.js';

const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.id, s.label]));

function since(iso) {
  if (!iso) return 'noch nie geübt';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'heute geübt';
  if (days === 1) return 'gestern geübt';
  return `vor ${days} Tagen geübt`;
}

export default function SongList({ songs, category, onOpen, onNew }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('alle');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return songs
      .filter((s) => s.category === category.id)
      .filter((s) => status === 'alle' || s.status === status)
      .filter((s) => !needle || (s.title + ' ' + s.artist).toLowerCase().includes(needle))
      .sort((a, b) => (b.lastPracticed || b.updated || '').localeCompare(a.lastPracticed || a.updated || ''));
  }, [songs, category, q, status]);

  return (
    <section className="songlist">
      <header className="songlist__head">
        <h1>Liederbuch</h1>
        <button className="btn btn--primary" onClick={onNew}>Lied hinzufügen</button>
      </header>
      <div className="songlist__filters">
        <input type="search" placeholder="Titel oder Interpret suchen" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="segmented" role="group" aria-label="Nach Lernstand filtern">
          {[{ id: 'alle', label: 'Alle' }, ...STATUS].map((s) => (
            <button key={s.id} className={status === s.id ? 'is-active' : ''} onClick={() => setStatus(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <p>
            {songs.some((s) => s.category === category.id)
              ? 'Kein Lied passt zu diesem Filter.'
              : `Für die ${category.name} ist noch kein Lied angelegt.`}
          </p>
          <button className="btn btn--primary" onClick={onNew}>Erstes Lied hinzufügen</button>
        </div>
      ) : (
        <ul className="songs">
          {list.map((s) => {
            const chords = [...new Set(parseSong(s.raw).chords)];
            return (
              <li key={s.id}>
                <button className="song" onClick={() => onOpen(s.id)}>
                  <span className="song__title">{s.title || 'Ohne Titel'}</span>
                  <span className="song__artist">{s.artist}</span>
                  <span className="song__chords">{chords.slice(0, 8).join(' ')}{chords.length > 8 ? ' …' : ''}</span>
                  <span className={'song__status song__status--' + s.status}>{STATUS_LABEL[s.status]}</span>
                  <span className="song__when">{since(s.lastPracticed)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
