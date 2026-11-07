import { detectOnsets, noiseFloor, onsetMinLevel, rms } from './dsp.js';

// Mikrofon und Metronom im Browser (Web Audio API)
// Aufnahme über ein AudioWorklet: Jeder Block trägt die Zeit der AudioContext-Uhr,
// dieselbe Uhr, nach der auch die Metronom-Klicks geplant werden.

const WORKLET = `
class GlRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage({ t: currentTime, d: ch.slice(0) });
    return true;
  }
}
registerProcessor('gl-recorder', GlRecorder);
`;

export function micSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.AudioContext && window.isSecureContext);
}

export async function openAudio({ agc = false } = {}) {
  if (!window.isSecureContext) {
    throw new Error('Das Mikrofon geht nur über https oder auf localhost. Über die WLAN-Adresse (http://192.168…) erlaubt der Browser keinen Zugriff.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: agc, channelCount: 1 }
  });
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'gl-recorder');
  const sink = ctx.createGain();
  sink.gain.value = 0;
  src.connect(node);
  node.connect(sink).connect(ctx.destination);

  let rec = null;
  const levelFns = new Set();
  node.port.onmessage = (e) => {
    const { t, d } = e.data;
    if (rec) {
      if (rec.t0 === null) rec.t0 = t;
      rec.chunks.push(d);
      rec.length += d.length;
    }
    if (levelFns.size) {
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const level = Math.sqrt(s / d.length);
      levelFns.forEach((fn) => fn(level));
    }
  };

  const track = stream.getAudioTracks()[0];
  const trackSettings = track?.getSettings?.() || {};
  const trackLatency = trackSettings.latency || 0;

  return {
    ctx,
    stream,
    sampleRate: ctx.sampleRate,
    info: { label: track?.label || 'unbekannt', agc: Boolean(trackSettings.autoGainControl), channels: trackSettings.channelCount, rate: ctx.sampleRate },
    /** Geschätzte Gesamtlatenz (Ausgabe + Eingabe) in Sekunden, falls nicht kalibriert */
    estimatedLatency: (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + trackLatency,
    start() { rec = { chunks: [], length: 0, t0: null }; },
    /** Aktuelle Aufnahme als ein Float32Array (ohne zu stoppen) */
    peek() {
      if (!rec) return null;
      const out = new Float32Array(rec.length);
      let o = 0;
      for (const c of rec.chunks) { out.set(c, o); o += c.length; }
      return { data: out, t0: rec.t0 };
    },
    stop() {
      const r = this.peek();
      rec = null;
      return r;
    },
    onLevel(fn) { levelFns.add(fn); return () => levelFns.delete(fn); },
    /** Plant einen Metronom-Klick zur AudioContext-Zeit `time` */
    click(time, accent = false, countIn = false) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = countIn ? 1500 : accent ? 1200 : 900;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(accent || countIn ? 0.7 : 0.45, time + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      osc.connect(g).connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.06);
    },
    async close() {
      node.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      try { await ctx.close(); } catch { /* bereits zu */ }
    }
  };
}

/**
 * Wartet auf einen Anschlag und nimmt danach `afterSec` Sekunden auf.
 * Gibt {data, onsetIndex} zurück oder wirft nach `timeoutSec` einen Fehler.
 */
export function captureStrike(audio, { afterSec = 1.6, timeoutSec = 12, signal, sensitivity = 3, floor: knownFloor = null } = {}) {
  return new Promise((resolve, reject) => {
    const sr = audio.sampleRate;
    audio.start();
    const started = performance.now();
    let hitAt = null;
    let maxLevel = 0;
    let wasQuiet = false; // war der Pegel seit Beginn einmal unter der Schwelle?
    let scanned = 0;
    const iv = setInterval(() => {
      if (signal?.aborted) { clearInterval(iv); audio.stop(); reject(new DOMException('Abgebrochen', 'AbortError')); return; }
      const r = audio.peek();
      if (!r) return;
      const d = r.data;
      if (hitAt === null && d.length > sr * 0.2) {
        // Mindestpegel aus dem Grundrauschen der ersten 0,2 s (oder vorher gemessen)
        const floor = knownFloor ?? noiseFloor(d, sr, 0, Math.round(sr * 0.2));
        const minLevel = onsetMinLevel(floor, sensitivity);
        const hop = Math.round(sr * 0.01);
        // Weg 1: Pegel steigt von unter der Schwelle über die Schwelle (auch bei weichem Anschlag)
        for (let i = Math.max(scanned, Math.round(sr * 0.05)); i + hop <= d.length; i += hop) {
          const l = rms(d, i, i + hop);
          maxLevel = Math.max(maxLevel, l);
          if (l < minLevel * 0.7) wasQuiet = true;
          else if (wasQuiet && l > minLevel && hitAt === null && i > sr * 0.12) hitAt = i;
          scanned = i + hop;
        }
        // Weg 2: deutlicher Energiesprung, auch während eine vorige Saite noch klingt
        if (hitAt === null) {
          const ons = detectOnsets(d, sr, { absMin: minLevel, relMin: 0, ratio: 1.4 }).filter((o) => o > sr * 0.12);
          if (ons.length) hitAt = ons[0];
        }
        audio.lastNeeded = minLevel;
      }
      if (hitAt !== null && d.length - hitAt > sr * afterSec) {
        clearInterval(iv);
        const final = audio.stop();
        resolve({ data: final.data, hitIndex: hitAt });
        return;
      }
      if (performance.now() - started > timeoutSec * 1000) {
        clearInterval(iv);
        audio.stop();
        const need = audio.lastNeeded || 0;
        reject(new Error(
          `Nichts gehört. Lautester Pegel ${(maxLevel * 1000).toFixed(2)}, benötigt etwa ${(need * 1000).toFixed(2)}. ` +
          'Empfindlichkeit erhöhen oder „Automatische Verstärkung“ einschalten.'
        ));
      }
    }, 100);
  });
}

/** Mikrofon-Test: 5 Sekunden aufnehmen und Kennwerte liefern */
export async function micDiagnose(audio, seconds = 5) {
  audio.start();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const { data } = audio.stop();
  const sr = audio.sampleRate;
  const hop = Math.round(sr * 0.01);
  let max = 0, peakSample = 0;
  for (let i = 0; i + hop <= data.length; i += hop) max = Math.max(max, rms(data, i, i + hop));
  for (let i = 0; i < data.length; i++) peakSample = Math.max(peakSample, Math.abs(data[i]));
  const floor = noiseFloor(data, sr);
  return { floor, max, peakSample, onsets: detectOnsets(data, sr, { absMin: Math.max(0.0003, floor * 2.5), relMin: 0, ratio: 1.4 }).length, ...audio.info };
}

/** Aktuelle Tonhöhe aus den letzten ~50 ms (für die Live-Anzeige beim Singen) */
export function liveWindow(audio, seconds = 0.06) {
  const r = audio.peek();
  if (!r) return null;
  const n = Math.round(audio.sampleRate * seconds);
  return r.data.length >= n ? r.data.subarray(r.data.length - n) : null;
}
