import { getShape } from '../lib/shapes.js';
import { displayChord } from '../lib/chords.js';

// Griffbild als SVG: senkrechte Saiten (links tiefe E), waagrechte Bünde
export default function ChordDiagram({ chord, notation, size = 1, showFingers = true, shape: given = null, label: givenLabel = null }) {
  const shape = given || getShape(chord);
  const label = givenLabel || displayChord(chord, notation);
  if (!shape) return <div className="diagram diagram--unknown">{label}</div>;

  const { frets, fingers, barre } = shape;
  const played = frets.filter((f) => f > 0);
  const maxF = played.length ? Math.max(...played) : 0;
  const minF = played.length ? Math.min(...played) : 0;
  const start = maxF <= 4 ? 1 : minF;
  const rows = 4;

  const W = 84, H = 104, left = 14, top = 26, gapX = 12, gapY = 17;
  const xs = (s) => left + s * gapX;
  const ys = (f) => top + (f - start + 0.5) * gapY;

  let barreEl = null;
  if (barre) {
    const strs = frets.map((f, s) => (f === barre ? s : -1)).filter((s) => s >= 0);
    if (strs.length > 1) {
      const a = Math.min(...strs), b = Math.max(...strs);
      barreEl = <rect x={xs(a) - 4.5} y={ys(barre) - 4.5} width={xs(b) - xs(a) + 9} height={9} rx={4.5} className="d-dot" />;
    }
  }

  return (
    <figure className="diagram" style={{ '--d-scale': size }} aria-label={`Griffbild ${label}`}>
      <figcaption>
        {label}
        {shape.shown && <span className="diagram__approx" title={`Vereinfacht gezeigt als ${shape.shown}`}>≈</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width={W * size} height={H * size} role="img">
        {start === 1 ? (
          <rect x={xs(0)} y={top - 3} width={xs(5) - xs(0)} height={3} className="d-nut" />
        ) : (
          <text x={2} y={ys(start) + 4} className="d-fretno">{start}</text>
        )}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={'f' + i} x1={xs(0)} x2={xs(5)} y1={top + i * gapY} y2={top + i * gapY} className="d-fret" />
        ))}
        {Array.from({ length: 6 }, (_, s) => (
          <line key={'s' + s} x1={xs(s)} x2={xs(s)} y1={top} y2={top + rows * gapY} className="d-string" />
        ))}
        {frets.map((f, s) =>
          f < 0 ? (
            <text key={'m' + s} x={xs(s)} y={top - 8} className="d-mark">×</text>
          ) : f === 0 ? (
            <circle key={'m' + s} cx={xs(s)} cy={top - 11} r={3.4} className="d-open" />
          ) : null
        )}
        {barreEl}
        {frets.map((f, s) =>
          f > 0 && !(barre && f === barre && barreEl) ? (
            <g key={'d' + s}>
              <circle cx={xs(s)} cy={ys(f)} r={5.2} className="d-dot" />
              {showFingers && fingers?.[s] ? (
                <text x={xs(s)} y={ys(f) + 3.4} className="d-finger">{fingers[s]}</text>
              ) : null}
            </g>
          ) : null
        )}
      </svg>
    </figure>
  );
}
