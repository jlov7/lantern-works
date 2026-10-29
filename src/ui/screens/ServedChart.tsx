// Neighbours served by day for you and the ghost studios. Each series has its own colour token, dash pattern and
// marker, so it reads without colour. The SVG is drawn at its real pixel width, so text stays readable on phones.
import { useEffect, useRef, useState, type JSX } from 'react';
import { RULES } from '../../engine/rules';
import { dayLabel } from '../format';
import type { Marker, Series } from './series';

export function MarkerShape({ marker, x, y, color, r = 4 }: { marker: Marker; x: number; y: number; color: string; r?: number }): JSX.Element {
  const common = { fill: color, stroke: 'var(--dusk-900)', strokeWidth: 1.5 };
  if (marker === 'circle') return <circle cx={x} cy={y} r={r} {...common} />;
  if (marker === 'square') return <rect x={x - r * 0.85} y={y - r * 0.85} width={r * 1.7} height={r * 1.7} {...common} />;
  if (marker === 'triangle') return <polygon points={`${x},${y - r * 1.1} ${x + r},${y + r * 0.8} ${x - r},${y + r * 0.8}`} {...common} />;
  if (marker === 'plus') {
    const a = r * 0.45;
    const b = r * 1.15;
    return <polygon points={`${x - a},${y - b} ${x + a},${y - b} ${x + a},${y - a} ${x + b},${y - a} ${x + b},${y + a} ${x + a},${y + a} ${x + a},${y + b} ${x - a},${y + b} ${x - a},${y + a} ${x - b},${y + a} ${x - b},${y - a} ${x - a},${y - a}`} {...common} />;
  }
  return <polygon points={`${x},${y - r * 1.15} ${x + r * 1.05},${y} ${x},${y + r * 1.15} ${x - r * 1.05},${y}`} {...common} />;
}

/** A short sample of a series' line and marker, for the legend. */
export function SeriesKey({ s }: { s: Omit<Series, 'values'> }): JSX.Element {
  return (
    <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true" focusable="false">
      <line x1="1" x2="33" y1="7" y2="7" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash || undefined} />
      <MarkerShape marker={s.marker} x={17} y={7} color={s.color} r={4} />
    </svg>
  );
}

export function ServedChart({ series }: { series: Series[] }): JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => setWidth(Math.max(260, Math.round(es[0]!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = width < 520;
  const W = width;
  const H = narrow ? 220 : 260;
  const pad = { l: 34, r: narrow ? 14 : 150, t: 14, b: 30 };
  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const nice = Math.ceil(max / 10) * 10;
  const span = W - pad.l - pad.r;
  const x = (d: number) => pad.l + (d / (RULES.days - 1)) * span;
  const y = (v: number) => H - pad.b - (v / nice) * (H - pad.t - pad.b);
  const ticks = [0, nice / 2, nice];
  const dayTicks = narrow ? [0, 5, 11] : [0, 3, 7, 11];
  // Keep end labels from colliding.
  const ends = series.map((s) => ({ ...s, ly: y(s.values[RULES.days - 1]!) })).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < ends.length; i++) if (ends[i]!.ly - ends[i - 1]!.ly < 15) ends[i]!.ly = ends[i - 1]!.ly + 15;
  const last = RULES.days - 1;
  return (
    <figure className="chart" aria-labelledby="chart-cap">
      <figcaption id="chart-cap">Neighbours served, day by day, on the same street</figcaption>
      <ul className="legend" aria-label="Key">
        {series.map((s) => (
          <li key={s.id}>
            <SeriesKey s={s} />
            <span>
              {s.label} <strong>{s.values[last]}</strong>
              <span className="sr-only">
                {' '}
                served, {s.dash ? 'dashed line' : 'solid line'} with {s.marker} markers
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div ref={box} className="chart-box">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart of neighbours served by day. The key above names each line; the table below has the same numbers." onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {dayTicks.map((d) => (
            <text key={d} x={x(d)} y={H - 8} className="axis" textAnchor={d === 0 ? 'start' : d === last && narrow ? 'end' : 'middle'}>
              {dayLabel(d)}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="crosshair" />}
          <g className="chart-lines">
            {[...series].reverse().map((s) => (
              <g key={s.id}>
                <polyline fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dash || undefined} strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, d) => `${x(d)},${y(v)}`).join(' ')} />
                {s.values.map((v, d) => (d % 2 === 1 || d === last ? <MarkerShape key={d} marker={s.marker} x={x(d)} y={y(v)} color={s.color} r={hover === d ? 5.5 : 4} /> : null))}
              </g>
            ))}
          </g>
          {!narrow &&
            ends.map((s) => (
              <text key={s.id} x={W - pad.r + 10} y={s.ly + 4} className="end-label">
                {s.label} {s.values[last]}
              </text>
            ))}
          {Array.from({ length: RULES.days }, (_, d) => (
            <rect key={d} x={x(d) - span / (RULES.days - 1) / 2} y={pad.t} width={span / (RULES.days - 1)} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(d)} />
          ))}
        </svg>
      </div>
      <p className="chart-tip" aria-hidden="true">
        {hover !== null ? `${dayLabel(hover)}: ${series.map((s) => `${s.label} ${s.values[hover]}`).join(', ')}` : ' '}
      </p>
      <details>
        <summary>Show as a table</summary>
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              {series.map((s) => (
                <th key={s.id} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: RULES.days }, (_, d) => (
              <tr key={d}>
                <th scope="row">{d + 1}</th>
                {series.map((s) => (
                  <td key={s.id}>{s.values[d]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
