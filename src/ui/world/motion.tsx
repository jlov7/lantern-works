// Real-time movement for people in the miniature. A walk runs on its own requestAnimationFrame loop and writes the
// transform straight to the element, so the React tree does not re-render while someone crosses the room.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { P } from './iso';
import type { Pt2 } from './place';

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface WalkerProps {
  /** World (x, y) on the floor plane. */
  x: number;
  y: number;
  /** 'walk' glides there in real time; 'step' jumps (the caller already moves it frame by frame). */
  move: 'walk' | 'step';
  /** Legs swing while true (step mode); walk mode swings them for the length of the walk. */
  walking?: boolean;
  /** Hide once there. */
  gone?: boolean;
  reduced: boolean;
  /** Units per second. */
  speed?: number;
  maxMs?: number;
  route?: (from: Pt2, to: Pt2) => Pt2[];
  children: ReactNode;
}

function length(pts: Pt2[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return out;
}

function along(pts: Pt2[], acc: number[], d: number): Pt2 {
  let i = 1;
  while (i < pts.length - 1 && acc[i]! < d) i++;
  const seg = acc[i]! - acc[i - 1]!;
  const t = seg > 0 ? (d - acc[i - 1]!) / seg : 1;
  const a = pts[i - 1]!;
  const b = pts[i]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function Walker({ x, y, move, walking = false, gone = false, reduced, speed = 380, maxMs = 1100, route, children }: WalkerProps) {
  const ref = useRef<SVGGElement>(null);
  const at = useRef<Pt2 | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = (p: Pt2) => {
      const [sx, sy] = P(p[0], p[1], 0);
      el.setAttribute('transform', `translate(${r1(sx)} ${r1(sy)})`);
      at.current = p;
    };
    const from = at.current;
    const to: Pt2 = [x, y];
    // The media query is checked too, so a caller that forgets the prop still gets no glide.
    const calm = reduced || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const still = !from || calm || move === 'step' || (Math.abs(from[0] - x) < 0.5 && Math.abs(from[1] - y) < 0.5);
    if (still) {
      place(to);
      el.classList.toggle('lw-walking', walking && !calm);
      el.classList.toggle('lw-gone', gone);
      return;
    }
    const pts = route ? route(from, to) : [from, to];
    const acc = length(pts);
    const total = acc[acc.length - 1]!;
    const dur = Math.max(250, Math.min(maxMs, (total / speed) * 1000));
    el.classList.add('lw-walking');
    el.classList.remove('lw-gone');
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      place(along(pts, acc, ease(k) * total));
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        el.classList.remove('lw-walking');
        el.classList.toggle('lw-gone', gone);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      el.classList.remove('lw-walking');
    };
  }, [x, y, move, walking, gone, reduced, speed, maxMs, route]);

  return <g ref={ref}>{children}</g>;
}
