// Künstliche Gitarrenklänge für Tests
export function pluck(buf, sr, t0, midi, { amp = 0.2, decay = 1.6, harmonics = 8 } = {}) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const s0 = Math.round(t0 * sr);
  for (let i = s0; i < buf.length; i++) {
    const t = (i - s0) / sr;
    const env = Math.exp(-t * decay) * Math.min(1, t * 400);
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * f * h * t) / (h * 1.3) * Math.exp(-t * h * 0.6);
    buf[i] += amp * env * v;
  }
}
export function strum(buf, sr, t0, midis, opt) { midis.forEach((m, i) => pluck(buf, sr, t0 + i * 0.008, m, opt)); }
export function noise(buf, a = 0.002, seed = 1) { let x = seed; for (let i = 0; i < buf.length; i++) { x = (x * 16807) % 2147483647; buf[i] += a * ((x / 2147483647) * 2 - 1); } }
