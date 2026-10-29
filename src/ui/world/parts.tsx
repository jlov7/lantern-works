// Small drawing pieces for the miniature: furniture, folders, parcels, people.
import type { CSSProperties } from 'react';
import type { FolderFrame, NeighbourFrame, WorkerFrame } from '../timeline';
import { box, dot, faces, FOLDER, flat, P, pts, wallY, onWallY, type Surface } from './iso';
import type { Look } from './looks';
import type { Glyph, Pose } from './place';


interface Fills {
  top: string;
  front: string;
  side: string;
}

const TIMBER: Fills = { top: 'var(--timber)', front: 'var(--timber)', side: 'var(--timber-dark)' };

export function Box({ x, y, z, w, d, h, fills }: { x: number; y: number; z: number; w: number; d: number; h: number; fills: Fills }) {
  const f = box(x, y, z, w, d, h);
  if (fills.side === fills.front) {
    return (
      <>
        <path d={faces(f.side, f.front)} fill={fills.side} />
        <polygon points={f.top} fill={fills.top} />
      </>
    );
  }
  return (
    <>
      <polygon points={f.side} fill={fills.side} strokeWidth={0.9} />
      <polygon points={f.front} fill={fills.front} strokeWidth={0.9} />
      <polygon points={f.top} fill={fills.top} strokeWidth={0.9} />
    </>
  );
}

/** A timber table: four legs and a slab top. */
export function Table({ s, fills = TIMBER }: { s: Surface; fills?: Fills }) {
  const leg = 4;
  const slab = 5;
  const lh = s.h - slab;
  const corners: [number, number][] = [
    [s.x + 2, s.y + 2],
    [s.x + s.w - leg - 2, s.y + 2],
    [s.x + 2, s.y + s.d - leg - 2],
    [s.x + s.w - leg - 2, s.y + s.d - leg - 2],
  ];
  const legs = corners.flatMap(([x, y]) => {
    const f = box(x, y, 0, leg, leg, lh);
    return [f.side, f.front];
  });
  return (
    <g>
      <polygon points={flat(s.x + 3, s.y + 3, 0, s.w, s.d)} fill="var(--ink)" opacity={0.12} stroke="none" />
      <path d={faces(...legs)} fill="var(--timber-dark)" />
      <Box x={s.x} y={s.y} z={lh} w={s.w} d={s.d} h={slab} fills={fills} />
      <polyline points={pts([[s.x + 1, s.y + s.d, s.h], [s.x + s.w - 1, s.y + s.d, s.h], [s.x + s.w - 1, s.y + 1, s.h]])} fill="none" stroke="var(--lamp-soft)" strokeWidth={1} strokeOpacity={0.55} />
      <path d={`M${pts([[s.x + 8, s.y + 6, s.h + 0.1], [s.x + s.w - 9, s.y + 6, s.h + 0.1]])}M${pts([[s.x + 11, s.y + s.d - 7, s.h + 0.1], [s.x + s.w / 2, s.y + s.d - 7, s.h + 0.1]])}`} fill="none" stroke="var(--timber-dark)" strokeWidth={0.7} strokeOpacity={0.35} />
    </g>
  );
}

// ---- Folders ---------------------------------------------------------------------------------------------------

export function Folder({ f, x, y, z }: { f: FolderFrame; x: number; y: number; z: number }) {
  const { w, d, t } = FOLDER;
  const paper = f.templated ? 'var(--moss-soft)' : 'var(--paper)';
  const b = box(x, y, z, w, d, t);
  const accent = f.stage === 'rework' ? 'var(--brick)' : f.stage === 'brief' ? 'var(--lamp)' : f.stage === 'produce' ? 'var(--sky-equip)' : 'var(--moss)';
  return (
    <g strokeWidth={0.9}>
      <polygon points={flat(x + 2, y - 3, z + t, 8, 3.5)} fill={accent} />
      <path d={faces(b.side, b.front)} fill="var(--paper-shade)" />
      <polygon points={b.top} fill={paper} />
      <polygon points={flat(x + 3, y + 3, z + t + 0.1, 6, 6)} fill={accent} stroke="none" />
      <path d={`M${pts([[x + 11, y + 4, z + t + 0.2], [x + w - 3, y + 4, z + t + 0.2]])}M${pts([[x + 11, y + 7, z + t + 0.2], [x + w - 5, y + 7, z + t + 0.2]])}`} fill="none" stroke="var(--ink-soft)" strokeWidth={0.7} />
      {f.stage === 'rework' && <polyline points={pts([[x + 3, y + d - 3, z + t + 0.2], [x + 8, y + d - 6, z + t + 0.2], [x + 13, y + d - 3, z + t + 0.2], [x + w - 2, y + d - 6, z + t + 0.2]])} fill="none" stroke="var(--brick)" strokeWidth={1.6} />}
      {!f.waiting && <polyline points={pts([[x - 2, y + 1, z], [x - 2, y + d + 2, z], [x + w + 2, y + d + 2, z]])} fill="none" stroke={accent} strokeWidth={1.8} />}
      {f.dueToday && <polygon points={wallY(x + 12, y + d + 0.3, z - 1, 4, t + 3)} fill="var(--lamp)" />}
    </g>
  );
}

/** A folder that has just changed surface: where it flew from, in screen units relative to where it lands. */
export type Flights = Map<string, { fx: number; fy: number; at: number }>;

/** Folders spread over piles on a surface; piles drawn back to front, each bottom to top. */
export function FolderPiles({ folders, piles, z, flights }: { folders: FolderFrame[]; piles: readonly (readonly [number, number])[]; z: number; flights?: Flights }) {
  const per = Math.max(1, Math.ceil(folders.length / piles.length));
  const order = piles.map((p, i) => ({ p, i })).sort((a, b) => a.p[1] - b.p[1] || a.p[0] - b.p[0]);
  return (
    <g>
      {order.map(({ p, i }) =>
        folders.slice(i * per, i * per + per).map((f, level) => {
          const x = p[0] + (((level * 7) % 5) - 2);
          const y = p[1] + (((level * 3) % 3) - 1);
          const zz = z + level * FOLDER.t;
          const fl = flights?.get(f.jobId);
          if (!fl) return <Folder key={f.jobId} f={f} x={x} y={y} z={zz} />;
          // Keyed by the move so each move mounts once and plays its arc once, whatever the frame rate.
          const [sx, sy] = P(x, y, zz);
          return (
            <g key={`${f.jobId}@${fl.at}`} className="lw-fly" style={{ '--dx': `${Math.round(fl.fx - sx)}px`, '--dy': `${Math.round(fl.fy - sy)}px` } as CSSProperties}>
              <Folder f={f} x={x} y={y} z={zz} />
            </g>
          );
        }),
      )}
    </g>
  );
}

// ---- AI desk ---------------------------------------------------------------------------------------------------

export function AiDesk({ s, worker, outage, folders, flights }: { s: Surface; worker: WorkerFrame; outage: boolean; folders: FolderFrame[]; flights?: Flights }) {
  const bx = s.x + 6;
  const by = s.y + 8;
  const bw = 32;
  const bd = 24;
  const bh = 24;
  const on = !outage && !worker.retired;
  const screen = !on ? 'var(--dusk-950)' : worker.working ? 'var(--lamp-soft)' : 'var(--dusk-600)';
  const [lx, ly] = P(bx + bw - 5, by + 5, s.h + bh + 2);
  return (
    <g className={worker.retired ? 'lw-retired' : undefined}>
      <Table s={s} />
      <Box x={bx} y={by} z={s.h} w={bw} d={bd} h={bh} fills={{ top: 'var(--sky-equip)', front: 'var(--sky-equip)', side: 'var(--dusk-400)' }} />
      {on && worker.working && <polygon points={wallY(bx + 1, by + bd + 0.2, s.h + 2, bw - 2, bh - 3)} fill="var(--lamp-glow)" stroke="none" className="lw-screen-glow" />}
      <polygon points={wallY(bx + 5, by + bd + 0.3, s.h + 6, bw - 10, bh - 11)} fill={screen} />
      {on && worker.working && (
        <g stroke="var(--ink-soft)" strokeWidth={0.8}>
          <polyline points={pts([[bx + 8, by + bd + 0.4, s.h + 14], [bx + 20, by + bd + 0.4, s.h + 14]])} />
          <polyline points={pts([[bx + 8, by + bd + 0.4, s.h + 10], [bx + 16, by + bd + 0.4, s.h + 10]])} />
        </g>
      )}
      <polygon points={flat(bx + 2, by + bd + 4, s.h, 26, 8)} fill="var(--dusk-400)" />
      {outage && !worker.retired && <circle cx={lx} cy={ly} r={3.2} fill="var(--brick)" className="lw-warn" />}
      <FolderPiles folders={folders} piles={[[s.x + 42, s.y + 18]]} z={s.h} flights={flights} />
    </g>
  );
}

export function EmptyAiSpot({ s }: { s: Surface }) {
  return <polygon points={flat(s.x, s.y, 0.5, s.w, s.d)} fill="none" stroke="var(--ink-soft)" strokeDasharray="4 4" opacity={0.45} />;
}

// ---- Parcels ---------------------------------------------------------------------------------------------------

export function Parcel({ x, y, z, today, land }: { x: number; y: number; z: number; today: boolean; land?: boolean }) {
  const w = 24;
  const d = 18;
  const h = 13;
  return (
    <g className={land ? 'lw-land' : undefined}>
      {today && <polygon points={box(x - 4, y - 4, z, w + 8, d + 8, h + 6).top} fill="var(--lamp-glow)" stroke="none" />}
      <Box x={x} y={y} z={z} w={w} d={d} h={h} fills={today ? { top: 'var(--paper)', front: 'var(--lamp-soft)', side: 'var(--lamp)' } : { top: 'var(--lamp)', front: 'var(--lamp)', side: 'var(--timber)' }} />
      <polyline points={pts([[x + w / 2, y, z + h], [x + w / 2, y + d, z + h], [x + w / 2, y + d, z]])} fill="none" stroke="var(--timber-dark)" strokeWidth={0.9} />
      <polygon points={wallY(x + 3, y + d + 0.1, z + 3, 7, 5)} fill="var(--paper)" strokeWidth={0.6} />
    </g>
  );
}

// ---- People ----------------------------------------------------------------------------------------------------

/** Painted wooden figures. Feet remain at the placement origin for walking and selection. */
export function Figure({ look, pose, scale = 1, activity, mood }: { look: Look; pose: Pose; scale?: number; activity?: WorkerFrame['station']; mood?: NeighbourFrame['mood'] }) {
  const disappointed = mood === 'leaving' || mood === 'declined';
  const headY = disappointed ? -42 : -44;
  const r = 9;
  const shoulder = look.shape === 'broad' ? 11 : 9;
  const hem = look.shape === 'coat' ? 12 : shoulder;
  const working = activity !== undefined;
  const arms = working ? `M${-shoulder},-30 Q-17,-23 -14,-31 M${shoulder},-30 Q17,-23 14,-31` : mood === 'buying' ? `M${-shoulder},-30 L-12,-17 M${shoulder},-30 Q17,-24 13,-30` : `M${-shoulder},-30 Q-14,-24 -12,-17 M${shoulder},-30 Q14,-24 12,-17`;
  return (
    <g transform={scale === 1 ? undefined : `scale(${scale})`} strokeWidth={1.4}>
      <ellipse cx={1} cy={0} rx={13} ry={4} fill="var(--ink)" opacity={0.18} stroke="none" />
      <g stroke="var(--ink)" strokeWidth={4.5} strokeLinecap="round">
        {pose === 'side' ? (
          <>
            <line className="lw-leg" x1={-1} y1={-10} x2={-5} y2={-1} />
            <line className="lw-leg lw-leg-b" x1={1} y1={-10} x2={5} y2={-1} />
          </>
        ) : (
          <>
            <line className="lw-leg" x1={-3.5} y1={-10} x2={-3.5} y2={-1} />
            <line className="lw-leg lw-leg-b" x1={3.5} y1={-10} x2={3.5} y2={-1} />
          </>
        )}
      </g>
      <path d="M-8,-1 H-1 M2,-1 H9" stroke="var(--timber-dark)" strokeWidth={3} strokeLinecap="round" />
      <path d={arms} fill="none" stroke={look.bodyShade} strokeWidth={6} strokeLinecap="round" />
      <path d={arms} fill="none" stroke={look.body} strokeWidth={4} strokeLinecap="round" />
      <path d={`M${-hem},-11 L${-shoulder},-29 Q${-shoulder},-36 -3,-36 H3 Q${shoulder},-36 ${shoulder},-29 L${hem},-11 Q0,-8 ${-hem},-11 Z`} fill={look.body} />
      <path d={`M3,-35 Q${shoulder},-35 ${shoulder},-29 L${hem},-11 L5,-10 Z`} fill={look.bodyShade} opacity={0.45} stroke="none" />
      {look.apron && pose !== 'back' && <g><path d="M-5,-30 H5 L7,-11 Q0,-9 -7,-11 Z" fill="var(--paper)" stroke="var(--timber-dark)" strokeWidth={0.8} /><path d="M-4,-21 H4 V-16 H-4 Z" fill="var(--paper-shade)" stroke="none" /><path d="M-5,-30 L-6,-35 M5,-30 L6,-35" stroke="var(--paper)" strokeWidth={2} /></g>}
      {look.apron && pose === 'back' && (
        <g fill="var(--paper)" strokeWidth={0.9}>
          <path d="M-6,-35 L5,-21 M6,-35 L-5,-21 M-9,-21 H9" fill="none" stroke="var(--paper)" strokeWidth={2} />
          <path d="M0,-21 L-5,-24.5 L-5,-17.5 Z" />
          <path d="M0,-21 L5,-24.5 L5,-17.5 Z" />
        </g>
      )}
      {!look.apron && look.shape === 'coat' && <path d="M0,-34 V-11 M-5,-31 L0,-26 L5,-31" fill="none" stroke="var(--paper-shade)" strokeWidth={1.2} />}
      {look.accessory === 'bag' && <g><path d="M-5,-34 L9,-17" fill="none" stroke="var(--timber-dark)" strokeWidth={2} /><rect x={6} y={-22} width={9} height={11} rx={2} fill="var(--timber)" /><path d="M8,-19 H13" stroke="var(--paper-shade)" /></g>}
      <Head look={look} pose={pose} cy={headY} r={r} happy={mood === 'served' || mood === 'buying'} disappointed={disappointed} />
      {look.accessory === 'scarf' && <path d="M-7,-35 Q0,-31 7,-35 L6,-31 L1,-30 L3,-21 L-2,-23 L-3,-31 L-7,-32 Z" fill="var(--lamp-soft)" strokeWidth={0.8} />}
      <g fill={look.skin} strokeWidth={0.8}>
        <circle cx={working ? -14 : -12} cy={working ? -31 : -17} r={2.5} />
        <circle cx={working ? 14 : mood === 'buying' ? 13 : 12} cy={working ? -31 : mood === 'buying' ? -30 : -17} r={2.5} />
      </g>
      {working && <g strokeLinecap="round">{activity === 'make' ? <path d="M13,-29 L19,-39" stroke="var(--lamp)" strokeWidth={2.5} /> : activity === 'finish' ? <><path d="M-17,-33 L-10,-36 L-7,-29 L-14,-26 Z" fill="var(--paper)" strokeWidth={0.8} /><path d="M13,-29 L18,-36" stroke="var(--brick)" strokeWidth={2.5} /></> : <path d="M-17,-33 L-9,-36 L-7,-28 L-15,-25 Z" fill="var(--paper)" strokeWidth={0.8} />}</g>}
    </g>
  );
}

function Head({ look, pose, cy, r, happy, disappointed }: { look: Look; pose: Pose; cy: number; r: number; happy: boolean; disappointed: boolean }) {
  const back = pose === 'back';
  const hair = look.hair;
  return (
    <>
      {look.hairStyle === 'long' && <path d={`M${-r - 1},${cy} Q${-r - 1},${cy + r + 5} ${-r + 3},${cy + r + 5} L${r - 3},${cy + r + 5} Q${r + 1},${cy + r + 5} ${r + 1},${cy} Z`} fill={hair} />}
      <path d={`M${-r},${cy - 1} Q${-r - 1},${cy - r} 0,${cy - r} Q${r + 1},${cy - r} ${r},${cy + 1} Q${r - 1},${cy + r} 0,${cy + r} Q${-r},${cy + r - 1} ${-r},${cy - 1} Z`} fill={back ? hair : look.skin} />
      {back && <path d={`M-5,${cy - 5} Q-1,${cy - 8} 3,${cy - 6}`} fill="none" stroke="var(--paper)" strokeOpacity={0.22} strokeWidth={1.3} />}
      {!back && pose === 'front' && (
        <g>
          <path d={`M${-r},${cy - 1} Q${-r},${cy - r - 1} 0,${cy - r - 1} Q${r},${cy - r - 1} ${r},${cy - 1} Q${r * 0.4},${cy - r * 0.55} ${-r},${cy - 1} Z`} fill={hair} />
          <path d={`${dot(-3, cy + 1.5, 1.1)}${dot(3, cy + 1.5, 1.1)}`} fill="var(--ink)" stroke="none" />
          <path d={`${dot(-5, cy + 4, 1.6)}${dot(5, cy + 4, 1.6)}`} fill="var(--brick-soft)" stroke="none" opacity={0.8} />
          <path d={happy ? `M-2.5,${cy + 5} Q0,${cy + 8} 3,${cy + 5}` : disappointed ? `M-2,${cy + 6} Q0,${cy + 4} 3,${cy + 6}` : `M-1,${cy + 6} H2`} fill="none" stroke="var(--timber-dark)" strokeWidth={0.9} strokeLinecap="round" />
          {look.accessory === 'glasses' && <path d={`M-7,${cy} h5 v4 h-5 Z M2,${cy} h5 v4 h-5 Z M-2,${cy + 1} h4`} fill="none" strokeWidth={1} />}
        </g>
      )}
      {pose === 'side' && (
        <g>
          <path d={`M${r},${cy - 2} Q${r - 1},${cy - r - 1} 0,${cy - r - 1} Q${-r},${cy - r - 1} ${-r},${cy} Q${-r},${cy + r * 0.6} ${-r * 0.4},${cy + r * 0.8} Q${-1},${cy - 2} ${r},${cy - 2} Z`} fill={hair} />
          <circle cx={4} cy={cy + 1} r={1.1} fill="var(--ink)" stroke="none" />
          <path d={`M8,${cy} l3,4 l-3,1 M4,${cy + 6} h3`} fill={look.skin} strokeWidth={0.8} />
        </g>
      )}
      {look.hairStyle === 'bun' && <circle cx={-1} cy={cy - r - 2} r={4.5} fill={hair} />}
      {look.hairStyle === 'cap' && <path d={`M${-r - 1},${cy - 3} Q0,${cy - r - 6} ${r + 1},${cy - 3} Z`} fill={look.bodyShade} />}
    </>
  );
}

// ---- Speech bubbles --------------------------------------------------------------------------------------------

const BUBBLE = 'M-9,-24 h18 a3.5,3.5 0 0 1 3.5,3.5 v12 a3.5,3.5 0 0 1 -3.5,3.5 h-9 l-6,6 l0.5,-6 h-3.5 a3.5,3.5 0 0 1 -3.5,-3.5 v-12 a3.5,3.5 0 0 1 3.5,-3.5 Z';
const HEART = 'M0,-7.5 C-9,-12.5 -7,-19.5 -3,-19 C-1.3,-18.8 -0.3,-17.6 0,-16.4 C0.3,-17.6 1.3,-18.8 3,-19 C7,-19.5 9,-12.5 0,-7.5 Z';

/** One glyph per mood: coin = would buy, tag = price, clock = too slow, layers = not the right fit,
 * heart = wants it made by hand, cracked heart = let down before, question = nothing on the window, dots = leaving. */
function GlyphShape({ g }: { g: Glyph }) {
  switch (g) {
    case 'coin':
      return (
        <>
          <circle cx={0} cy={-14.5} r={6.4} fill="var(--lamp)" strokeWidth={1.2} />
          <circle cx={0} cy={-14.5} r={3.6} fill="none" stroke="var(--timber-dark)" strokeWidth={1.1} />
        </>
      );
    case 'price':
      return (
        <>
          <path d="M-7.5,-14.5 L-2.5,-20 L7,-20 L7,-9 L-2.5,-9 Z" fill="var(--brick-soft)" strokeWidth={1.2} />
          <path d={dot(-2, -14.5, 1.5)} fill="var(--ink)" stroke="none" />
        </>
      );
    case 'slow':
      return (
        <>
          <circle cx={0} cy={-14.5} r={6.4} fill="var(--paper)" strokeWidth={1.2} />
          <path d="M0,-14.5 V-18.8 M0,-14.5 L3.2,-12.6" fill="none" strokeWidth={1.5} strokeLinecap="round" />
        </>
      );
    case 'scope':
      return <path d="M-7,-20 h8.5 v8.5 h-8.5 Z M-2,-16.5 h8.5 v8.5 h-8.5 Z" fill="var(--dusk-200)" strokeWidth={1.1} />;
    case 'care':
      return <path d={HEART} fill="var(--brick)" strokeWidth={1.1} />;
    case 'lost':
      return (
        <>
          <path d={HEART} fill="var(--dusk-400)" strokeWidth={1.1} />
          <path d="M0.6,-17.6 L-1.4,-14.6 L1.2,-12.6 L-0.4,-9.6" fill="none" stroke="var(--paper)" strokeWidth={1.3} />
        </>
      );
    case 'empty':
      return (
        <text x={0} y={-9.6} textAnchor="middle" className="lw-sign" fontSize={13} fill="var(--ink)" stroke="none">
          ?
        </text>
      );
    case 'dots':
      return <path d={`${dot(-5.5, -14.5, 1.7)}${dot(0, -14.5, 1.7)}${dot(5.5, -14.5, 1.7)}`} fill="var(--ink)" stroke="none" />;
  }
}

/** A neighbour's mood: a round badge held at the shoulder (so it never covers the window sign), or a speech
 * bubble of dots above the head as they walk away. Origin: the badge centre, or the bubble's tail. */
export function Bubble({ g, x, y }: { g: Glyph; x: number; y: number }) {
  if (g === 'dots') {
    return (
      <g transform={`translate(${x} ${y})`} className="lw-bubble">
        <path d={BUBBLE} fill="var(--paper)" strokeWidth={1.2} />
        <GlyphShape g={g} />
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y + 14.5})`} className="lw-bubble">
      <circle cx={0} cy={-14.5} r={9.5} fill="var(--paper)" strokeWidth={1.3} />
      <GlyphShape g={g} />
    </g>
  );
}

// ---- Bin and courier -------------------------------------------------------------------------------------------

/** A woven waste basket. */
export function Bin({ x, y, w, d, h }: { x: number; y: number; w: number; d: number; h: number }) {
  const b = box(x, y, 0, w, d, h);
  const weave = [0.35, 0.7].map((k) => `M${pts([[x, y + d, h * k], [x + w, y + d, h * k], [x + w, y, h * k]])}`).join('');
  return (
    <g aria-hidden="true">
      <path d={faces(b.side, b.front)} fill="var(--timber)" />
      <path d={weave} fill="none" stroke="var(--timber-dark)" strokeWidth={0.9} />
      <polygon points={flat(x, y, h, w, d)} fill="var(--timber-dark)" />
    </g>
  );
}

/** A courier on a bicycle, drawn at the origin (wheel contact), riding to the right. */
export function Courier() {
  return (
    <>
      <path d={`${dot(-10, -6, 6)}${dot(10, -6, 6)}`} fill="none" strokeWidth={1.8} />
      <path d="M-10,-6 L-2,-6 L5,-15 L-5,-15 Z M10,-6 L5,-15 M-5,-15 L-6,-19 M5,-15 L6,-19 L9,-19" fill="none" strokeWidth={1.6} />
      <path d="M-14,-24 h10 v-8 h-10 Z" fill="var(--lamp)" strokeWidth={1.2} />
      <path d="M-4,-17 L1,-31 Q2,-34 5,-33 L7,-20 Z" fill="var(--moss)" strokeWidth={1.2} />
      <circle cx={4} cy={-37} r={4.2} fill="var(--timber)" strokeWidth={1.2} />
    </>
  );
}

/** Back-wall painted clock with the frame's clock text under it. */
export function WallClock({ x, z, r, clock, offset }: { x: number; z: number; r: number; clock: string; offset: number }) {
  const total = 9 * 60 + offset;
  const minA = ((total % 60) / 60) * Math.PI * 2;
  const hourA = (((total / 60) % 12) / 12) * Math.PI * 2;
  return (
    <g transform={onWallY(x, 0.5, z)}>
      <circle cx={0} cy={0} r={r + 3} fill="var(--timber-dark)" />
      <circle cx={0} cy={0} r={r} fill="var(--paper)" />
      {[0, 1, 2, 3].map((k) => {
        const a = (k * Math.PI) / 2;
        return <line key={k} x1={Math.sin(a) * (r - 4)} y1={-Math.cos(a) * (r - 4)} x2={Math.sin(a) * (r - 1.5)} y2={-Math.cos(a) * (r - 1.5)} strokeWidth={1.2} />;
      })}
      <line x1={0} y1={0} x2={Math.sin(hourA) * (r - 7)} y2={-Math.cos(hourA) * (r - 7)} strokeWidth={2} strokeLinecap="round" />
      <line x1={0} y1={0} x2={Math.sin(minA) * (r - 3)} y2={-Math.cos(minA) * (r - 3)} strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={0} cy={0} r={1.6} fill="var(--brick)" stroke="none" />
      <rect x={-27} y={r + 7} width={54} height={17} rx={2} fill="var(--ink)" stroke="none" />
      <text x={0} y={r + 19.5} textAnchor="middle" className="lw-clock" fill="var(--lamp-soft)" stroke="none">
        {clock}
      </text>
    </g>
  );
}
