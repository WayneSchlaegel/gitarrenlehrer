// Metronom mit Vorausplanung (präzise auch bei ausgelastetem Browser)

export class Metronome {
  constructor() { this.ctx = null; this.timer = null; }

  click(time, kind) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = kind === 'count' ? 1500 : kind === 'accent' ? 1200 : 900;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(kind === 'normal' ? 0.35 : 0.6, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(g).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  /**
   * bpm: Schläge pro Minute; beatsPerBar: 4, 3 oder 6; countIn: Anzahl Takte Einzählen;
   * accents: Schläge mit Betonung (z. B. [0] oder [0, 3] bei 6/8); sound: Klicks hörbar?
   * onBeat(beatIndexImTakt, isCountIn), onStart() nach dem Einzählen
   */
  start({ bpm, beatsPerBar = 4, countIn = 1, accents = [0], sound = true, onBeat, onStart }) {
    this.stop();
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const beat = 60 / bpm;
    const t0 = this.ctx.currentTime + 0.15;
    const countBeats = countIn * beatsPerBar;
    let i = 0;
    let started = false;
    const schedule = () => {
      const ahead = this.ctx.currentTime + 0.12;
      while (t0 + i * beat < ahead) {
        const time = t0 + i * beat;
        const inBar = i % beatsPerBar;
        const isCount = i < countBeats;
        if (sound || isCount) this.click(time, isCount ? 'count' : accents.includes(inBar) ? 'accent' : 'normal');
        const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
        const idx = i;
        setTimeout(() => {
          if (!this.timer) return;
          onBeat?.(inBar, isCount);
          if (!isCount && !started) { started = true; onStart?.(); }
          if (countBeats === 0 && idx === 0 && !started) { started = true; onStart?.(); }
        }, delay);
        i++;
      }
    };
    this.timer = setInterval(schedule, 25);
    schedule();
    if (countBeats === 0) { started = true; setTimeout(() => onStart?.(), 150); }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  close() { this.stop(); this.ctx?.close(); this.ctx = null; }
}

/** Taktart → Schläge pro Takt und Betonungen */
export function meterInfo(meter = '4/4') {
  if (meter === '3/4') return { beatsPerBar: 3, accents: [0] };
  if (meter === '6/8') return { beatsPerBar: 6, accents: [0, 3] };
  return { beatsPerBar: 4, accents: [0] };
}
