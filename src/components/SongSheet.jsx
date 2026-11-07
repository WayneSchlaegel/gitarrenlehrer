import { useEffect, useMemo, useRef, useState } from 'react';
import { parseSong } from '../lib/parser.js';
import {
  transposeChord, displayChord, keyUsesFlats, capoSuggestions, semitoneLabel, isChord, canonicalChord
} from '../lib/chords.js';
import ChordDiagram from './ChordDiagram.jsx';
import { STATUS } from '../lib/storage.js';
import { Metronome, meterInfo } from '../lib/audio/metronome.js';
import { Guitar } from '../lib/audio/guitar.js';
import { Accompanist, allPatterns, buildTimeline } from '../lib/accompany.js';

export default function SongSheet({ song, settings, onChange, onSettings, onEdit, onAsk, onBack, videos = [], onOpenVideo, customPatterns = [] }) {
  const parsed = useMemo(() => parseSong(song.raw), [song.raw]);
  const transpose = song.transpose || 0;
  const capo = song.capo || 0;
  // Die Akkorde im Liedblatt sind Griffe für den dort angegebenen Capo (wie bei Ultimate Guitar und ChordPro)
  const sheetCapo = song.sheetCapo || 0;
  const shift = transpose + sheetCapo; // Liedblatt-Griff → klingender Akkord
  const [scrolling, setScrolling] = useState(false);
  // Mitspielen: Metronom im Liedtempo, Einzählen, Scrollen passend zum Tempo
  const [playing, setPlaying] = useState(false);
  const [counting, setCounting] = useState(false);
  const [beatShown, setBeatShown] = useState(-1);
  const [clickOn, setClickOn] = useState(true);
  const metroRef = useRef(null);
  const bpm = song.tempo || 80;
  const { beatsPerBar, accents } = meterInfo(song.meter);
  const scrollFactor = song.scrollFactor || 1;
  const [openChord, setOpenChord] = useState(null);
  const [showCapo, setShowCapo] = useState(false);
  const sheetRef = useRef(null);

  // Klingende Tonart = Original + Transponierung; gegriffen wird klingend − Capo
  const firstChord = parsed.chords[0];
  const soundingKeyChord = firstChord ? transposeChord(firstChord, shift) : null;
  const useFlats = soundingKeyChord ? keyUsesFlats(soundingKeyChord) : false;

  const sounding = (c) => transposeChord(c, shift, useFlats);
  const gripped = (c) => {
    if (!isChord(c)) return c;
    if (shift - capo === 0) return c; // Griffe wie im Liedblatt
    return capo ? canonicalChord(transposeChord(c, shift - capo, false)) : sounding(c);
  };

  const shownChords = useMemo(() => {
    const seen = [];
    for (const c of parsed.chords) {
      const g = gripped(c);
      if (!seen.includes(g)) seen.push(g);
    }
    return seen;
  }, [parsed, transpose, capo, sheetCapo]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = useMemo(
    () => capoSuggestions(parsed.chords.map(sounding)),
    [parsed, transpose, sheetCapo] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Autoscroll
  useEffect(() => {
    if (!scrolling) return;
    let raf, last = performance.now(), acc = 0;
    const el = sheetRef.current;
    const step = (now) => {
      acc += ((now - last) / 1000) * speedRef.current;
      last = now;
      if (acc >= 1) {
        const px = Math.floor(acc);
        acc -= px;
        el.scrollTop += px;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setScrolling(false);
          return;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [scrolling]);

  // Geschwindigkeit: manuell oder aus Tempo, Zeilenzahl und Takten pro Zeile berechnet
  const speedRef = useRef(settings.scrollSpeed);
  const tempoSpeed = () => {
    const el = sheetRef.current;
    if (!el) return settings.scrollSpeed;
    const rows = parsed.lines.filter((l) => l.type === 'lyrics' || l.type === 'chords' || l.type === 'tab').length || 1;
    const seconds = rows * (song.barsPerLine || 2) * beatsPerBar * (60 / bpm);
    const distance = Math.max(0, el.scrollHeight - el.clientHeight);
    return Math.max(2, (distance / seconds) * scrollFactor);
  };
  speedRef.current = playing ? tempoSpeed() : settings.scrollSpeed;

  const stopPlay = () => {
    metroRef.current?.stop();
    setPlaying(false); setCounting(false); setScrolling(false); setBeatShown(-1);
  };
  const startPlay = () => {
    if (!metroRef.current) metroRef.current = new Metronome();
    setPlaying(true); setCounting(true); setScrolling(false);
    metroRef.current.start({
      bpm, beatsPerBar, accents, countIn: 1, sound: clickOn,
      onBeat: (b, isCount) => { setBeatShown(b); setCounting(isCount); },
      onStart: () => setScrolling(true)
    });
  };
  useEffect(() => () => metroRef.current?.close(), []);

  // ---------- Begleitung vorspielen ----------
  const meter = song.meter || '4/4';
  const patterns = allPatterns(customPatterns).filter((p) => p.meter === meter);
  const pattern = patterns.find((p) => p.id === song.pattern) || patterns.find((p) => p.kind === 'schlag') || patterns[0];
  const [accOn, setAccOn] = useState(false);
  const [curEv, setCurEv] = useState(null);
  const accRef = useRef(null);
  const timeline = useMemo(() => buildTimeline(parsed, { barsPerLine: song.barsPerLine || 2, meter }), [parsed, song.barsPerLine, meter]);
  const stopAcc = () => { accRef.current?.acc.stop(); setAccOn(false); setCurEv(null); };
  const startAcc = () => {
    if (!pattern || !timeline.length) return;
    if (playing) stopPlay();
    setScrolling(false);
    if (!accRef.current) { const guitar = new Guitar(); accRef.current = { guitar, acc: new Accompanist(guitar) }; }
    setAccOn(true);
    accRef.current.acc.start({
      events: timeline.map((e) => ({ ...e, chord: gripped(e.chord), capo })),
      pattern, bpm, meter, countIn: true, loop: false,
      onEvent: (i) => setCurEv(timeline[i]),
      onEnd: () => { setAccOn(false); setCurEv(null); }
    });
  };
  useEffect(() => () => { accRef.current?.acc.stop(); accRef.current?.guitar.close(); }, []);
  // Aktuelle Zeile in der Mitte halten
  useEffect(() => {
    if (!curEv || !sheetRef.current) return;
    const el = sheetRef.current.querySelector(`[data-line="${curEv.line}"]`);
    if (el) {
      const box = sheetRef.current;
      const target = el.offsetTop - box.offsetTop - box.clientHeight * 0.35;
      box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }, [curEv]);
  // Ende des Liedblatts erreicht: Scrollen hört auf, das Metronom läuft weiter bis „Stopp“

  const playingRef = useRef(false);
  playingRef.current = playing;
  const stopPlayRef = useRef(null);
  stopPlayRef.current = stopPlay;
  const accRefOn = useRef(false);
  accRefOn.current = accOn;
  const stopAccRef = useRef(null);
  stopAccRef.current = stopAcc;
  // Tastatur: Leertaste = Scrollen bzw. Mitspielen stoppen, + / − = Schriftgröße
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.code === 'Space') { e.preventDefault(); if (accRefOn.current) stopAccRef.current(); else if (playingRef.current) stopPlayRef.current(); else setScrolling((s) => !s); }
      if (e.key === '+') onSettings({ fontSize: Math.min(40, settings.fontSize + 2) });
      if (e.key === '-') onSettings({ fontSize: Math.max(12, settings.fontSize - 2) });
      if (e.key === 'Escape') setOpenChord(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.fontSize, onSettings]);

  const markPracticed = () =>
    onChange({
      lastPracticed: new Date().toISOString(),
      practiceCount: (song.practiceCount || 0) + 1,
      status: song.status === 'neu' ? 'uebe' : song.status
    });

  const n = settings.notation;
  const soundingKey = soundingKeyChord ? displayChord(soundingKeyChord, n) : '–';

  return (
    <section className="sheet-view">
      <header className="sheet-head">
        <button className="btn btn--quiet sheet-back" onClick={onBack}>Alle Lieder</button>
        <div className="sheet-title">
          <h1>{song.title || 'Ohne Titel'}</h1>
          <p>
            {song.artist}
            {song.artist && ' – '}
            Tonart {soundingKey}
            {capo ? `, Capo ${capo}` : ''}
            {song.tempo ? `, ${song.tempo} bpm` : ''}
          </p>
        </div>
        <div className="sheet-head__actions">
          <select
            value={song.status}
            onChange={(e) => onChange({ status: e.target.value })}
            aria-label="Lernstand"
          >
            {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="btn btn--quiet" onClick={onEdit}>Bearbeiten</button>
          <button className="btn btn--quiet" onClick={onAsk}>Lehrer fragen</button>
          <button className="btn" onClick={markPracticed} title={song.practiceCount ? `${song.practiceCount}× geübt` : undefined}>
            Heute geübt{song.practiceCount ? ` (${song.practiceCount})` : ''}
          </button>
        </div>
      </header>

      {shownChords.length > 0 && (
        <div className="chord-strip" aria-label="Griffe in diesem Lied">
          {shownChords.map((c) => (
            <ChordDiagram key={c} chord={c} notation={n} size={0.9} />
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <div className="sheet-videos">
          <span>Videos:</span>
          {videos.map((v) => <button key={v.id} className="chip" onClick={() => onOpenVideo(v.id)}>{v.topic || v.title}</button>)}
        </div>
      )}

      {(song.strum || song.notes || song.source) && (
        <div className="sheet-info">
          {song.strum && <p><strong>Schlagmuster</strong> <span className="strum">{song.strum}</span></p>}
          {song.notes && <p className="sheet-info__notes">{song.notes}</p>}
          {song.source && /^https?:\/\//.test(song.source) && (
            <p><a href={song.source} target="_blank" rel="noreferrer">Original öffnen</a></p>
          )}
        </div>
      )}

      <div className="sheet" ref={sheetRef} style={{ fontSize: settings.fontSize + 'px' }} tabIndex={0}>
        {parsed.lines.length === 0 && (
          <p className="empty">Dieses Lied hat noch keinen Text. Über „Bearbeiten“ fügst du Akkorde und Text ein.</p>
        )}
        {parsed.lines.map((line, i) => {
          if (line.type === 'empty') return <div key={i} className="l-gap" />;
          if (line.type === 'section') return <h2 key={i} className="l-section">{line.text}</h2>;
          if (line.type === 'comment') return <p key={i} className="l-comment">{line.text}</p>;
          if (line.type === 'tab')
            return (
              <div key={i} className="l-tab-wrap">
                <pre className="l-tab">{line.lines.join('\n')}</pre>
                {(transpose !== 0 || capo !== sheetCapo) && (
                  <p className="l-tab-note">
                    Tabulatur in Originallage{sheetCapo ? ` (Capo ${sheetCapo})` : ''}, Tonart und Capo gelten hier nicht.
                  </p>
                )}
              </div>
            );
          return (
            <div key={i} data-line={i} className={'l-line' + (line.type === 'chords' ? ' l-line--chords' : '') + (curEv?.line === i ? ' is-playing' : '')}>
              {line.segments.map((s, j) => {
                const g = s.chord ? gripped(s.chord) : null;
                return (
                  <span key={j} className="seg">
                    <span className="seg__c">
                      {g && (
                        <button
                          className={'chordbtn' + (curEv?.line === i && curEv?.seg === j ? ' is-now' : '')}
                          onClick={() => setOpenChord(openChord === g ? null : g)}
                          aria-label={`Griff ${displayChord(g, n)} zeigen`}
                        >
                          {displayChord(g, n)}
                        </button>
                      )}
                    </span>
                    <span className="seg__t">{s.text || '\u00a0'}</span>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {openChord && (
        <div className="chord-pop" role="dialog" aria-label="Griffbild" onClick={() => setOpenChord(null)}>
          <ChordDiagram chord={openChord} notation={n} size={2} />
          <span className="chord-pop__hint">Tippen zum Schließen</span>
        </div>
      )}

      {showCapo && (
        <div className="capo-panel">
          <h3>Capo-Vorschläge für Tonart {soundingKey}</h3>
          <p>Gleiche Tonart, leichtere Griffe:</p>
          <ul>
            {suggestions.map((s) => (
              <li key={s.capo}>
                <button
                  className={'capo-opt' + (s.capo === capo ? ' is-active' : '')}
                  onClick={() => { onChange({ capo: s.capo }); setShowCapo(false); }}
                >
                  <strong>{s.capo ? `Capo ${s.capo}` : 'Ohne Capo'}</strong>
                  <span>{s.shapes.map((c) => displayChord(c, n)).join('  ')}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="capo-panel__hint">
            Zum Singen: Mit „Tonart“ verschiebst du das Lied in deine Stimmlage, mit Capo wählst du danach die
            bequemsten Griffe.
          </p>
        </div>
      )}

      <div className="toolbar" role="toolbar" aria-label="Liedsteuerung">
        <div className="tool">
          <span className="tool__label">Tonart</span>
          <button className="btn btn--icon" onClick={() => onChange({ transpose: transpose - 1 })} aria-label="Halbton tiefer">−</button>
          <span className="tool__val">{semitoneLabel(transpose)}</span>
          <button className="btn btn--icon" onClick={() => onChange({ transpose: transpose + 1 })} aria-label="Halbton höher">+</button>
        </div>
        <div className="tool">
          <span className="tool__label">Capo</span>
          <button className="btn btn--icon" onClick={() => onChange({ capo: Math.max(0, capo - 1) })} aria-label="Capo tiefer">−</button>
          <span className="tool__val">{capo}</span>
          <button className="btn btn--icon" onClick={() => onChange({ capo: Math.min(9, capo + 1) })} aria-label="Capo höher">+</button>
          <button className={'btn btn--quiet' + (showCapo ? ' is-active' : '')} onClick={() => setShowCapo((v) => !v)}>
            Vorschlag
          </button>
        </div>
        <div className="tool">
          <span className="tool__label">Schrift</span>
          <button className="btn btn--icon" onClick={() => onSettings({ fontSize: Math.max(12, settings.fontSize - 2) })} aria-label="Kleiner">A−</button>
          <button className="btn btn--icon" onClick={() => onSettings({ fontSize: Math.min(40, settings.fontSize + 2) })} aria-label="Größer">A+</button>
        </div>
        <div className="tool tool--acc">
          <button className={'btn' + (accOn ? ' btn--primary is-active' : '')} onClick={() => (accOn ? stopAcc() : startAcc())} disabled={!timeline.length}>
            {accOn ? 'Begleitung stoppen' : 'Begleitung ▶'}
          </button>
          <select value={pattern?.id || ''} onChange={(e) => { onChange({ pattern: e.target.value }); if (accOn) stopAcc(); }} aria-label="Muster für die Begleitung">
            {patterns.map((p) => <option key={p.id} value={p.id}>{p.custom ? 'Eigenes: ' : p.kind === 'zupf' ? 'Zupfen: ' : 'Schlag: '}{p.name}</option>)}
          </select>
        </div>
        <div className="tool tool--play">
          <button className={'btn btn--primary' + (playing ? ' is-active' : '')} onClick={() => { if (accOn) stopAcc(); playing ? stopPlay() : startPlay(); }}>
            {playing ? (counting ? 'Einzählen …' : 'Stopp') : `Mitspielen ${bpm} bpm`}
          </button>
          <span className="beatdots" aria-hidden="true">
            {Array.from({ length: beatsPerBar }, (_, i) => (
              <i key={i} className={(beatShown === i ? 'is-now' : '') + (counting ? ' is-count' : '') + (accents.includes(i) ? ' is-accent' : '')} />
            ))}
          </span>
          <label className="tool__check"><input type="checkbox" checked={clickOn} onChange={(e) => setClickOn(e.target.checked)} disabled={playing} /> Klick</label>
        </div>
        <div className="tool tool--scroll">
          {!playing && (
            <button className={'btn' + (scrolling ? ' btn--primary is-active' : '')} onClick={() => setScrolling((s) => !s)}>
              {scrolling ? 'Scrollen anhalten' : 'Nur scrollen'}
            </button>
          )}
          {playing ? (
            <input
              type="range" min="25" max="150" value={Math.round(scrollFactor * 100)}
              onChange={(e) => onChange({ scrollFactor: Number(e.target.value) / 100 })}
              aria-label="Scrolltempo beim Mitspielen anpassen" title="Scrollt es zu schnell oder zu langsam? Hier anpassen; wird beim Lied gespeichert."
            />
          ) : (
            <input
              type="range" min="1" max="40" step="0.5" value={Math.min(40, settings.scrollSpeed)}
              onChange={(e) => onSettings({ scrollSpeed: Number(e.target.value) })}
              title={`${settings.scrollSpeed} Pixel pro Sekunde`}
              aria-label="Scrollgeschwindigkeit"
            />
          )}
        </div>
      </div>
    </section>
  );
}
