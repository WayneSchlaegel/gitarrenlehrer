import { useEffect, useRef, useState } from 'react';
import { liveWindow } from '../lib/audio/mic.js';
import { yin, pitchTrack, percentile, suggestShift, noteLabel, rms } from '../lib/audio/dsp.js';
import { parseSong } from '../lib/parser.js';
import { transposeChord, capoSuggestions, displayChord } from '../lib/chords.js';

/** Klingende Tonart (erster Akkord) eines Lieds bei gegebener Transponierung */
function keyAt(song, transpose) {
  const first = parseSong(song.raw).chords[0];
  return first ? transposeChord(first, transpose + (song.sheetCapo || 0)) : null;
}

export default function VoiceCoach({ audio, profile, onProfile, song, onSongChange, onPractice, notation: n, onAskTeacher }) {
  const [busy, setBusy] = useState('');
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(0);
  const stopRef = useRef(null);

  // Live-Anzeige des gesungenen Tons
  useEffect(() => {
    if (!busy) { setLive(null); return; }
    const iv = setInterval(() => {
      const w = liveWindow(audio, 0.05);
      if (!w || rms(w) < 0.002) { setLive(null); return; }
      const r = yin(w, 0, w.length, audio.sampleRate, { fmin: 70, fmax: 1000 });
      setLive(r.clarity > 0.85 ? 69 + 12 * Math.log2(r.freq / 440) : null);
    }, 120);
    return () => clearInterval(iv);
  }, [busy, audio]);

  const record = (seconds, label) => new Promise((resolve) => {
    setBusy(label); setErr(''); setLeft(seconds);
    audio.start();
    const t0 = performance.now();
    const iv = setInterval(() => {
      const rest = Math.max(0, seconds - (performance.now() - t0) / 1000);
      setLeft(Math.ceil(rest));
      if (rest <= 0 || stopRef.current) { clearInterval(iv); stopRef.current = false; const r = audio.stop(); setBusy(''); resolve(r.data); }
    }, 100);
  });

  const measureEdge = async (which) => {
    const data = await record(4, which);
    const tr = pitchTrack(data, audio.sampleRate).map((x) => x.midi);
    if (tr.length < 10) { setErr('Kein klarer Ton erkannt. Den Ton auf „a“ oder „o“ ruhig halten, etwas lauter.'); return; }
    const m = percentile(tr, 0.5);
    onProfile(which === 'tief' ? { voiceLow: m } : { voiceHigh: m });
  };

  const sample = async () => {
    const data = await record(60, 'probe');
    const tr = pitchTrack(data, audio.sampleRate).map((x) => x.midi);
    if (tr.length < 30) { setErr('Zu wenig Gesang erkannt. Mindestens 15 Sekunden deutlich singen.'); return; }
    const low = percentile(tr, 0.1), high = percentile(tr, 0.9);
    onSongChange({ melodyLow: low, melodyHigh: high, melodyTranspose: song.transpose || 0 });
    onPractice({ type: 'stimme', melody: `${noteLabel(low, n)}–${noteLabel(high, n)}` });
  };

  const vLow = profile.voiceLow, vHigh = profile.voiceHigh;
  const hasVoice = vLow != null && vHigh != null && vHigh > vLow;
  const hasMelody = song && song.melodyLow != null;
  // Melodie bei aktueller Transponierung
  const delta = hasMelody ? (song.transpose || 0) - (song.melodyTranspose || 0) : 0;
  const mLow = hasMelody ? song.melodyLow + delta : null;
  const mHigh = hasMelody ? song.melodyHigh + delta : null;
  const sugg = hasVoice && hasMelody ? suggestShift(mLow, mHigh, vLow, vHigh) : null;

  let plan = null;
  if (sugg && song) {
    const newT = (song.transpose || 0) + sugg.shift;
    const chords = parseSong(song.raw).chords.map((c) => transposeChord(c, newT + (song.sheetCapo || 0)));
    const capo = capoSuggestions(chords)[0];
    plan = { newT, capo, keyNow: keyAt(song, song.transpose || 0), keyNew: keyAt(song, newT) };
  }

  const range = (lo, hi) => `${noteLabel(lo, n)} – ${noteLabel(hi, n)}`;

  return (
    <div className="listen__body voice">
      <div className="theory__card">
        <h2>Mein Stimmumfang</h2>
        <p className="listen__hint">
          Singe auf „a“ deinen tiefsten Ton, der noch angenehm klingt, und halte ihn 3–4 Sekunden. Dann genauso den höchsten
          bequemen Ton, ohne zu pressen. Kein Falsett.
        </p>
        <div className="voice__row">
          <button className="btn" onClick={() => measureEdge('tief')} disabled={!!busy}>{busy === 'tief' ? `Halten … ${left}` : 'Tiefsten Ton messen'}</button>
          <span className="voice__val">{vLow != null ? noteLabel(vLow, n) : '–'}</span>
          <button className="btn" onClick={() => measureEdge('hoch')} disabled={!!busy}>{busy === 'hoch' ? `Halten … ${left}` : 'Höchsten Ton messen'}</button>
          <span className="voice__val">{vHigh != null ? noteLabel(vHigh, n) : '–'}</span>
        </div>
        {hasVoice && <p>Bequemer Umfang: <strong>{range(vLow, vHigh)}</strong> ({Math.round(vHigh - vLow)} Halbtöne)</p>}
      </div>

      <div className="theory__card">
        <h2>Singprobe {song ? `„${song.title}“` : ''}</h2>
        {!song ? (
          <p className="listen__hint">Oben ein Lied wählen.</p>
        ) : (
          <>
            <p className="listen__hint">
              Singe das Lied in der aktuellen Tonart (gern ohne Gitarre), vor allem die höchste und die tiefste Stelle, etwa
              20–40 Sekunden. Die App misst, welchen Tonbereich die Melodie bei dir braucht.
            </p>
            <div className="voice__row">
              {busy === 'probe'
                ? <button className="btn btn--primary is-active" onClick={() => { stopRef.current = true; }}>Fertig ({left} s)</button>
                : <button className="btn btn--primary" onClick={sample} disabled={!!busy}>Singprobe starten</button>}
              {hasMelody && <span>Melodie: <strong>{range(mLow, mHigh)}</strong></span>}
            </div>
          </>
        )}
        {plan && (
          <div className={'voice__plan' + (sugg.fits ? '' : ' is-tight')}>
            {sugg.shift === 0 ? (
              <p>Die Tonart passt zu deiner Stimme{sugg.fits ? '.' : ', ist aber an den Rändern knapp.'}</p>
            ) : (
              <p>
                Empfehlung: <strong>{sugg.shift > 0 ? `${sugg.shift} Halbtöne höher` : `${-sugg.shift} Halbtöne tiefer`}</strong>, also
                {' '}{displayChord(plan.keyNew, n)} statt {displayChord(plan.keyNow, n)}.
                {plan.capo && <> Dann {plan.capo.capo ? `Capo ${plan.capo.capo}` : 'ohne Capo'} mit den Griffen {plan.capo.shapes.map((c) => displayChord(c, n)).join(' ')}.</>}
                {!sugg.fits && ' Auch so wird es an einer Stelle knapp; ggf. diese Stelle eine Oktave versetzt singen.'}
              </p>
            )}
            {sugg.shift !== 0 && (
              <button className="btn btn--primary" onClick={() => onSongChange({ transpose: plan.newT, capo: plan.capo?.capo || 0 })}>Übernehmen</button>
            )}
            <button className="btn btn--quiet" onClick={() => onAskTeacher(`Singprobe zu „${song.title}“: Melodie ${range(mLow, mHigh)}, mein bequemer Umfang ${range(vLow, vHigh)}. Vorschlag der App: ${sugg.shift} Halbtöne. Was meinst du, und wie übe ich die schwierigen Stellen?`)}>
              Lehrer dazu fragen
            </button>
          </div>
        )}
        {hasMelody && !hasVoice && <p className="listen__hint">Für einen Vorschlag erst oben den Stimmumfang messen.</p>}
      </div>

      <div className="voice__live" aria-live="polite">
        {busy ? (live != null ? <>Du singst <strong>{noteLabel(live, n)}</strong></> : 'Höre zu …') : null}
      </div>
      {err && <p className="listen__error">{err}</p>}
    </div>
  );
}
