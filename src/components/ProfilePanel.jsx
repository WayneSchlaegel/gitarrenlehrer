import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '../lib/storage.js';
import { buildBookmarklet, currentAppUrl } from '../lib/bookmarklet.js';
import { pingWorker } from '../lib/teacher.js';

export default function ProfilePanel({ profile, settings, onProfile, onSettings, onExport, onImport, onClose, syncStatus, onSyncNow }) {
  const fileRef = useRef(null);
  const linkRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [test, setTest] = useState(null);
  const [showToken, setShowToken] = useState(false);

  const testConnection = async () => {
    setTest({ state: 'laeuft', text: 'Prüfe …' });
    try {
      const r = await pingWorker(settings);
      if (!r.hasKey) setTest({ state: 'fehler', text: 'Worker erreichbar, aber der ANTHROPIC_API_KEY fehlt dort.' });
      else setTest({ state: 'ok', text: `Verbunden. Modell: ${r.model}${r.limit ? ', Tageslimit aktiv' : ''}.` });
    } catch (e) {
      setTest({ state: 'fehler', text: e.message === 'Failed to fetch' ? 'Worker nicht erreichbar. Adresse prüfen, und ob diese App-Adresse in ALLOWED_ORIGINS steht.' : e.message });
    }
  };
  const code = buildBookmarklet(currentAppUrl());

  // href per DOM setzen: React lehnt javascript:-Links im JSX ab
  useEffect(() => { linkRef.current?.setAttribute('href', code); }, [code]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { prompt('Code kopieren (Strg+C):', code); }
  };
  const setGuitar = (id, v) => onProfile({ guitars: { ...profile.guitars, [id]: v } });

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="panel" role="dialog" aria-label="Profil und Einstellungen" onClick={(e) => e.stopPropagation()}>
        <header className="panel__head">
          <h2>Profil und Einstellungen</h2>
          <button className="btn btn--quiet" onClick={onClose}>Schließen</button>
        </header>

        <h3>Lieder von Ultimate Guitar übernehmen</h3>
        <p className="panel__hint">Einmal einrichten, danach ein Klick pro Lied. Funktioniert am Laptop in Brave.</p>
        <ol>
          <li>Lesezeichenleiste einblenden: Strg+Umschalt+B.</li>
          <li>Den gelben Knopf mit der Maus in die Lesezeichenleiste ziehen.</li>
          <li>Lied auf Ultimate Guitar öffnen und auf das Lesezeichen klicken. Wird nichts gefunden: Liedtext markieren und noch einmal klicken.</li>
        </ol>
        <div className="panel__row">
          <a ref={linkRef} className="bookmarklet" onClick={(e) => { e.preventDefault(); alert('Bitte nicht hier klicken, sondern in die Lesezeichenleiste ziehen.'); }}>
            → Gitarrenlehrer
          </a>
          <button className="btn btn--quiet" onClick={copy}>{copied ? 'Code kopiert' : 'Code kopieren'}</button>
        </div>
        <p className="panel__hint">
          Ziehen klappt nicht? „Code kopieren“, dann Rechtsklick auf die Lesezeichenleiste → „Lesezeichen hinzufügen“,
          Name „→ Gitarrenlehrer“, bei URL den Code einfügen. Das Lesezeichen gilt nur für diese Adresse der App
          ({currentAppUrl()}). Nach dem Veröffentlichen auf GitHub dort neu anlegen.
        </p>

        <h3>Lehrer-Verbindung</h3>
        <p className="panel__hint">Adresse deines Cloudflare Workers und der Zugangsschlüssel (APP_TOKEN), den du dort gesetzt hast.</p>
        <label>
          Worker-Adresse
          <input placeholder="https://gitarrenlehrer-api.DEIN-NAME.workers.dev" value={settings.apiUrl} onChange={(e) => onSettings({ apiUrl: e.target.value.trim() })} />
        </label>
        <label>
          Zugangsschlüssel
          <input type={showToken ? 'text' : 'password'} autoComplete="off" value={settings.apiToken} onChange={(e) => onSettings({ apiToken: e.target.value.trim() })} />
        </label>
        <div className="panel__row">
          <button className="btn" onClick={testConnection} disabled={!settings.apiUrl || !settings.apiToken}>Verbindung testen</button>
          <button className="btn btn--quiet" onClick={() => setShowToken((v) => !v)}>{showToken ? 'Schlüssel verbergen' : 'Schlüssel zeigen'}</button>
        </div>
        {test && <p className={'panel__test panel__test--' + test.state}>{test.text}</p>}

        <h3>Geräte abgleichen</h3>
        <p className="panel__hint">
          Lieder, Videos, Messungen, Lehrer-Gespräche und Profil werden über deinen Worker zwischen Laptop und Handy abgeglichen.
          Aufnahmen bleiben auf dem jeweiligen Gerät. Einmalig im Worker einrichten: <code>npm run abgleich-einrichten</code>.
        </p>
        <label className="panel__check">
          <input type="checkbox" checked={Boolean(settings.syncOn)} onChange={(e) => onSettings({ syncOn: e.target.checked })} disabled={!settings.apiUrl || !settings.apiToken} />
          Abgleich einschalten
        </label>
        {settings.syncOn && (
          <div className="panel__row">
            <button className="btn" onClick={onSyncNow} disabled={syncStatus?.busy}>{syncStatus?.busy ? 'Gleiche ab …' : 'Jetzt abgleichen'}</button>
            <span className="panel__hint">
              {syncStatus?.error ? <span className="panel__test--fehler">{syncStatus.error}</span>
                : syncStatus?.at ? `Zuletzt: ${new Date(syncStatus.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </div>
        )}

        <h3>Über mich</h3>
        <p className="panel__hint">Diese Angaben nutzt später der Lehrer, um passend zu antworten.</p>
        <label>Mein Stand<textarea rows={3} value={profile.level} onChange={(e) => onProfile({ level: e.target.value })} /></label>
        <label>Mein Ziel<textarea rows={2} value={profile.goal} onChange={(e) => onProfile({ goal: e.target.value })} /></label>
        <label>Musik, die ich mag<textarea rows={2} placeholder="Künstler, Genres, Lieder" value={profile.taste} onChange={(e) => onProfile({ taste: e.target.value })} /></label>
        {CATEGORIES.map((c) => (
          <label key={c.id}>{c.numeral}. {c.name}<input value={profile.guitars[c.id] || ''} onChange={(e) => setGuitar(c.id, e.target.value)} /></label>
        ))}

        <h3>Darstellung</h3>
        <label>
          Notenname für h
          <select value={settings.notation} onChange={(e) => onSettings({ notation: e.target.value })}>
            <option value="international">International: B, Bb</option>
            <option value="deutsch">Deutsch: H, B</option>
          </select>
        </label>

        <h3>Sicherung</h3>
        <p className="panel__hint">
          Alles liegt nur in diesem Browser. Sichere regelmäßig und spiele die Datei auf dem anderen Gerät ein, um
          Laptop und Smartphone abzugleichen. Der Zugangsschlüssel wird nicht mitgesichert.
        </p>
        <div className="panel__row">
          <button className="btn" onClick={onExport}>Sicherung herunterladen</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Sicherung einspielen</button>
          <input
            ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
          />
        </div>
      </aside>
    </div>
  );
}
