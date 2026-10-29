// The fixed parts of the miniature: sky, street, shop shell and shopfront. Only light, time and the menu vary,
// so each layer is memoised and re-renders only when its few inputs change.
import { memo, useState } from 'react';
import type { OfferSpec } from '../../engine/types';
import type { WorldFrame } from '../timeline';
import { box, D, dot, faces, flat, H, KIT_BOARD, onFloor, onWallY, P, pts, RACK, RACK_SHOWN, rackSlot, SHOPFRONT, STREET, STUB, T, VIEW_H, VIEW_W, W, wallX, wallY } from './iso';
import type { Light } from './light';
import { Box, Parcel } from './parts';

export const Defs = memo(function Defs({ id, light }: { id: string; light: Light }) {
  return (
    <defs>
      <linearGradient id={`${id}-sky`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={230}>
        <stop offset={0} stopColor={light.skyTop} />
        <stop offset={0.6} stopColor={light.skyMid} />
        <stop offset={1} stopColor={light.skyLow} />
      </linearGradient>
      <radialGradient id={`${id}-glow`}>
        <stop offset={0} stopColor="var(--lamp)" stopOpacity={0.55} />
        <stop offset={0.55} stopColor="var(--lamp)" stopOpacity={0.18} />
        <stop offset={1} stopColor="var(--lamp)" stopOpacity={0} />
      </radialGradient>
      <radialGradient id={`${id}-pane`} cx="50%" cy="45%" r="70%">
        <stop offset={0} stopColor="var(--lamp-soft)" />
        <stop offset={1} stopColor="var(--lamp)" />
      </radialGradient>
      <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={7} />
      </filter>
    </defs>
  );
});

const STARS = [
  [612, 26], [700, 54], [774, 18], [846, 70], [918, 34], [560, 64], [880, 120], [940, 96], [660, 104], [36, 18], [120, 40], [742, 132],
];
const STAR_PATH = STARS.map(([x, y], i) => dot(x!, y!, i % 3 === 0 ? 1.4 : 0.9)).join('');

/** Flat facades standing behind the shop, in the plane y = -110. [x, width, height, gable] */
const HOUSES: [number, number, number, boolean][] = [
  [-470, 90, 80, true],
  [-372, 70, 100, false],
  [-296, 96, 76, true],
  [-194, 84, 104, true],
  [-104, 92, 84, false],
  [-6, 110, 112, true],
  [112, 80, 136, false],
  [200, 120, 108, true],
  [328, 90, 146, true],
  [426, 110, 118, false],
  [544, 86, 150, true],
  [638, 118, 124, true],
  [764, 96, 142, false],
  [868, 90, 116, true],
];

const facade = ([x, w, h, gable]: (typeof HOUSES)[number]) => (gable ? `M${x},0 V${-h} L${x + w / 2},${-h - 34} L${x + w},${-h} V0 Z` : `M${x},0 V${-h} H${x + w} V0 Z`);
const HOUSE_A = HOUSES.filter((_, i) => i % 2 === 0).map(facade).join('');
const HOUSE_B = HOUSES.filter((_, i) => i % 2 === 1).map(facade).join('');
/** Each window with a fixed 0..1 rank: windows light up in rank order as the evening comes. */
const WINDOWS = HOUSES.flatMap(([x, w, h], i) => [0, 1, 2].flatMap((r) => [0, 1].map((c) => ({ d: `M${x + w * 0.2 + c * w * 0.38},${-h + 16 + r * 28}h${w * 0.2}v14h${-w * 0.2}Z`, rank: ((i * 7 + r * 3 + c * 5) % 10) / 10 }))));

export const Backdrop = memo(function Backdrop({ id, light }: { id: string; light: Light }) {
  const lit = WINDOWS.filter((w) => w.rank < light.windows * 0.8);
  const dark = WINDOWS.filter((w) => w.rank >= light.windows * 0.8);
  return (
    <g aria-hidden="true">
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={`url(#${id}-sky)`} stroke="none" />
      {light.stars > 0 && <path d={STAR_PATH} fill="var(--paper)" stroke="none" opacity={light.stars} />}
      <g transform={onWallY(0, -110, 0)} stroke="var(--dusk-950)" strokeWidth={1}>
        <path d={HOUSE_A} fill={light.house} />
        <path d={HOUSE_B} fill={light.houseAlt} />
        <path d={dark.map((w) => w.d).join('')} fill="var(--dusk-900)" opacity={0.35 + 0.35 * light.lamps} stroke="none" />
        {lit.length > 0 && <path d={lit.map((w) => w.d).join('')} fill="var(--lamp-soft)" opacity={0.85} stroke="none" />}
      </g>
    </g>
  );
});

export const Ground = memo(function Ground({ id, light }: { id: string; light: Light }) {
  const sf = SHOPFRONT.window;
  return (
    <g aria-hidden="true" stroke="none">
      <polygon points={pts([[-1200, -110, 0], [W + 600, -110, 0], [W + 600, 1600, 0], [-1200, 1600, 0]])} fill={light.street} />
      <polygon points={flat(-1200, STREET.kerb, 0, W + 1800, STREET.farKerb - STREET.kerb)} fill={light.road} />
      <path d={`M${pts([[-1200, STREET.kerb, 0], [W + 600, STREET.kerb, 0]])}M${pts([[-1200, STREET.farKerb, 0], [W + 600, STREET.farKerb, 0]])}`} fill="none" stroke="var(--dusk-200)" strokeWidth={1.5} opacity={0.5} />
      <polyline points={pts([[-1200, (STREET.kerb + STREET.farKerb) / 2, 0], [W + 600, (STREET.kerb + STREET.farKerb) / 2, 0]])} fill="none" stroke="var(--paper)" strokeWidth={1.5} strokeDasharray="14 18" opacity={0.22} />
      {/* Pools of light on the pavement: the window and, after 3:30pm, the street lamps. */}
      <g transform={onFloor(sf.x0 - 40, D + T, 0)}>
        <ellipse cx={(sf.x1 - sf.x0) / 2 + 40} cy={46} rx={170} ry={84} fill={`url(#${id}-glow)`} opacity={light.spill} />
      </g>
      {light.lamps > 0 &&
        STREET.lamps.map(([x, y]) => (
          <g key={`${x}-${y}`} transform={onFloor(x, y, 0)}>
            <ellipse cx={0} cy={0} rx={70} ry={50} fill={`url(#${id}-glow)`} opacity={0.75 * light.lamps} />
          </g>
        ))}
    </g>
  );
});

/** Lamps behind (near: false) or in front of (near: true) the shop-side pavement. Lit after 3:30pm. */
export const StreetLamps = memo(function StreetLamps({ id, near, lamps, festival }: { id: string; near: boolean; lamps: number; festival: boolean }) {
  return (
    <g aria-hidden="true">
      {STREET.lamps
        .filter(([, y]) => y > D + 100 === near)
        .map(([x, y]) => {
          const [bx, by] = P(x, y, 0);
          const [tx, ty] = P(x, y, 112);
          return (
            <g key={`${x}-${y}`}>
              {lamps > 0 && <circle cx={tx} cy={ty - 6} r={30} fill={`url(#${id}-glow)`} stroke="none" opacity={lamps} />}
              <line x1={bx} y1={by} x2={tx} y2={ty} stroke="var(--ink)" strokeWidth={3.2} />
              <rect x={bx - 4} y={by - 8} width={8} height={8} fill="var(--dusk-900)" />
              <path d={`M${tx - 7},${ty} L${tx + 7},${ty} L${tx + 5},${ty - 12} L${tx - 5},${ty - 12} Z`} fill={lamps > 0.5 ? 'var(--lamp-soft)' : 'var(--dusk-200)'} />
              <path d={`M${tx - 8},${ty - 12} L${tx + 8},${ty - 12} L${tx},${ty - 19} Z`} fill="var(--ink)" />
              {festival && (
                <g>
                  <path d={`M${tx},${ty - 30} h14 v6`} fill="none" strokeWidth={1.6} />
                  <ellipse cx={tx + 14} cy={ty - 16} rx={6} ry={8} fill={x < 0 ? 'var(--brick)' : x > 600 ? 'var(--moss-soft)' : 'var(--lamp)'} strokeWidth={1.2} />
                </g>
              )}
            </g>
          );
        })}
    </g>
  );
});

/** Floor, back wall and left wall: the inside of the model. */
export const ShopShell = memo(function ShopShell() {
  const planks = [];
  for (let y = 26; y < D; y += 26) planks.push(`M${pts([[0, y, 0], [W, y, 0]])}`);
  for (let row = 0; row < Math.ceil(D / 26); row++) {
    for (let x = row % 2 ? 82 : 164; x < W; x += 164) planks.push(`M${pts([[x, row * 26, 0], [x, Math.min(D, (row + 1) * 26), 0]])}`);
  }
  return (
    <g aria-hidden="true">
      {/* Model base slab under the floor. */}
      <polygon points={wallY(-T, D + T, -7, W + 2 * T, 7)} fill="var(--dusk-900)" />
      <polygon points={wallX(W + T, -T, -7, D + 2 * T, 7)} fill="var(--dusk-950)" />
      <polygon points={flat(0, 0, 0, W, D)} fill="var(--paper-shade)" />
      <path d={planks.join('')} fill="none" stroke="var(--timber)" strokeWidth={0.8} opacity={0.45} />
      {/* Back wall (inside face, cut top, end). */}
      <polygon points={wallY(-T, 0, 0, W + 2 * T, H)} fill="var(--paper)" />
      <polygon points={wallY(0, 0.1, 0, W, 30)} fill="var(--paper-shade)" />
      <polyline points={pts([[0, 0.2, 30], [W, 0.2, 30]])} fill="none" stroke="var(--timber-dark)" strokeWidth={2} />
      <path d={faces(flat(-T, -T, H, W + 2 * T, T), wallX(W + T, -T, 0, T, H), flat(-T, 0, H, T, D))} fill="var(--dusk-900)" />
      {/* Left wall (inside face, cut top). */}
      <polygon points={wallX(0, 0, 0, D, H)} fill="var(--paper-shade)" />
      <polygon points={wallY(0, 0.2, 0, W, 5)} fill="var(--timber-dark)" stroke="none" opacity={0.45} />
      <polygon points={wallX(0.2, 0, 0, D, 5)} fill="var(--timber-dark)" stroke="none" opacity={0.45} />
    </g>
  );
});

const SCONCES = [470, 700];

/** Sconces, and at closing a warm dusk falling over the inside of the shop. Drawn over the furniture. */
export const InteriorLight = memo(function InteriorLight({ id, closing }: { id: string; closing: number }) {
  return (
    <g aria-hidden="true" stroke="none">
      {closing > 0 && <path d={faces(flat(0, 0, 0, W, D), wallY(0, 0, 0, W, H), wallX(0, 0, 0, D, H))} fill="#4a2a12" opacity={0.36 * closing} />}
      {SCONCES.map((x) => {
        const [cx, cy] = P(x, 0.5, 108);
        return (
          <g key={x}>
            <circle cx={cx} cy={cy + 4} r={18} fill="var(--lamp-glow)" />
            {closing > 0 && <circle cx={cx} cy={cy + 14} r={90} fill={`url(#${id}-glow)`} opacity={closing} />}
            <path d={`M${cx - 7},${cy} A7,7 0 0 0 ${cx + 7},${cy} Z`} fill="var(--lamp-soft)" stroke="var(--ink)" strokeWidth={1.25} />
          </g>
        );
      })}
    </g>
  );
});

/** Festival bunting along the top of the back wall: one string, three colours of flags. */
const BUNTING = (() => {
  const colours: string[][] = [[], [], []];
  const n = 26;
  const sag = (k: number) => 5 * Math.sin(((k % 1) * Math.PI));
  let line = '';
  for (let i = 0; i <= n * 4; i++) {
    const u = (i / (n * 4)) * W;
    const k = (u / W) * 4;
    const [x, y] = P(u, 0.5, H - 4 - sag(k));
    line += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  for (let f = 0; f < n; f++) {
    const u0 = ((f + 0.15) / n) * W;
    const u1 = ((f + 0.85) / n) * W;
    const um = (u0 + u1) / 2;
    const z0 = H - 4 - sag((u0 / W) * 4);
    const z1 = H - 4 - sag((u1 / W) * 4);
    const [ax, ay] = P(u0, 0.5, z0);
    const [bx, by] = P(u1, 0.5, z1);
    const [cx, cy] = P(um, 0.5, (z0 + z1) / 2 - 13);
    colours[f % 3]!.push(`M${ax.toFixed(1)},${ay.toFixed(1)}L${bx.toFixed(1)},${by.toFixed(1)}L${cx.toFixed(1)},${cy.toFixed(1)}Z`);
  }
  return { line, flags: colours.map((c) => c.join('')) };
})();

/** Per-scenario dressing: festival bunting, careful-season ribbons, a Main Street banner. */
export const Dressing = memo(function Dressing({ scenarioId, part }: { scenarioId?: string; part: 'inside' | 'outside' }) {
  if (part === 'inside') {
    if (scenarioId !== 'festival-week') return null;
    return (
      <g aria-hidden="true" strokeWidth={1}>
        <path d={BUNTING.line} fill="none" stroke="var(--ink-soft)" strokeWidth={1.2} />
        <path d={BUNTING.flags[0]} fill="var(--brick)" />
        <path d={BUNTING.flags[1]} fill="var(--lamp)" />
        <path d={BUNTING.flags[2]} fill="var(--moss)" />
      </g>
    );
  }
  if (scenarioId === 'bespoke-rush') {
    const { door, window: win } = SHOPFRONT;
    return (
      <g aria-hidden="true" strokeWidth={1}>
        <g transform={onWallY(door.x0, D + T + 0.5, door.h)}>
          <path d="M15,6 C8,-2 3,4 9,9 Z M15,6 C22,-2 27,4 21,9 Z" fill="var(--brick)" />
          <path d="M14,7 L10,22 L13,20 L15,8 Z M16,7 L20,22 L17,20 L15,8 Z" fill="var(--brick-soft)" />
        </g>
        {/* A ribbon swag under the window sill, clear of the sign. */}
        <g transform={onWallY(win.x0, D + T + 0.5, win.z0)}>
          <path d={`M-4,6 Q${(win.x1 - win.x0) / 4},17 ${(win.x1 - win.x0) / 2},6 Q${(3 * (win.x1 - win.x0)) / 4},17 ${win.x1 - win.x0 + 4},6`} fill="none" stroke="var(--brick)" strokeWidth={3} strokeLinecap="round" />
          <path d={`${dot(-4, 6, 3)}${dot((win.x1 - win.x0) / 2, 6, 3)}${dot(win.x1 - win.x0 + 4, 6, 3)}`} fill="var(--brick-soft)" />
        </g>
      </g>
    );
  }
  if (scenarioId === 'main-street') {
    const [x, y] = P(-44, 196, 96);
    return (
      <g aria-hidden="true" strokeWidth={1.2}>
        <path d={`M${x},${y - 6} h11`} fill="none" strokeWidth={1.8} />
        <path d={`M${x + 2},${y - 6} h18 v30 l-9,-6 l-9,6 Z`} fill="var(--brick)" />
        <path d={`M${x + 11},${y} l2,4.5 l5,0.4 l-3.8,3.2 l1.2,4.9 l-4.4,-2.7 l-4.4,2.7 l1.2,-4.9 l-3.8,-3.2 l5,-0.4 Z`} fill="var(--lamp-soft)" strokeWidth={0.8} />
      </g>
    );
  }
  return null;
});

export const KitBoard = memo(function KitBoard({ id, kit, fresh }: { id: string; kit: WorldFrame['kit']; fresh: number | null }) {
  const { w, h } = KIT_BOARD;
  const cw = 18;
  const ch = 21;
  const slots = [0, 1, 2, 3, 4, 5].map((k) => ({ k, u: 5 + (k % 3) * 22, v: 6 + Math.floor(k / 3) * 26 }));
  const shown = kit === 'ready' ? [0, 1, 2, 3, 4, 5] : kit === 'building' ? [0, 1, 3] : [];
  const pop = kit === 'ready' && fresh !== null;
  return (
    <g aria-hidden="true" transform={onWallY(KIT_BOARD.x, 0.5, KIT_BOARD.z + h)}>
      <rect x={-3} y={-3} width={w + 6} height={h + 6} rx={2} fill="var(--timber-dark)" />
      <rect x={0} y={0} width={w} height={h} fill="var(--timber)" opacity={0.55} stroke="none" />
      {slots.map(({ k, u, v }) =>
        shown.includes(k) ? (
          <g key={pop ? `${k}@${fresh}` : k} className={pop ? 'lw-pop' : undefined} style={pop ? { animationDelay: `${k * 70}ms` } : undefined}>
            <rect x={u} y={v} width={cw} height={ch} fill="var(--paper)" strokeWidth={0.9} />
            <rect x={u} y={v} width={cw} height={5} fill="var(--moss-soft)" strokeWidth={0.9} />
            <path d={`M${u + 3},${v + 10}H${u + cw - 3}M${u + 3},${v + 15}H${u + cw - 6}`} stroke="var(--ink-soft)" strokeWidth={0.8} />
            <circle cx={u + cw / 2} cy={v} r={1.6} fill="var(--brick)" stroke="none" />
          </g>
        ) : kit === 'building' && k === 2 ? (
          <g key={k}>
            <rect x={u} y={v} width={cw} height={ch} fill="none" stroke="var(--paper)" strokeDasharray="3 2" />
            <rect x={u} y={v + ch / 2} width={cw} height={ch / 2} fill="var(--paper)" strokeWidth={0.9} />
            <line x1={u + cw - 2} y1={v + ch + 6} x2={u + cw + 12} y2={v + 2} stroke="var(--lamp)" strokeWidth={3} strokeLinecap="round" />
          </g>
        ) : (
          <circle key={k} cx={u + cw / 2} cy={v + 2} r={1.4} fill="var(--dusk-600)" stroke="none" />
        ),
      )}
      {pop && (
        <g key={`shine@${fresh}`}>
          <clipPath id={`${id}-kit`}>
            <rect x={0} y={0} width={w} height={h} />
          </clipPath>
          <g clipPath={`url(#${id}-kit)`}>
            <path className="lw-shimmer" d={`M-30,${h + 4} L-12,-4 L0,-4 L-18,${h + 4} Z`} fill="var(--paper)" stroke="none" />
          </g>
        </g>
      )}
      {kit === 'ready' && (
        <g>
          <circle cx={w} cy={0} r={7} fill="var(--moss)" />
          <path d={`M${w - 3.5},0.5 L${w - 1},3 L${w + 3.5},-2.5`} fill="none" stroke="var(--paper)" strokeWidth={1.8} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
});

export const DeliveryRack = memo(function DeliveryRack({ total, today, landing }: { total: number; today: number; landing: number }) {
  const { x, y, w, d, levels, top } = RACK;
  const drawn = Math.min(total, RACK_SHOWN);
  const wood = { top: 'var(--timber)', front: 'var(--timber)', side: 'var(--timber-dark)' };
  const posts = [
    [x, y],
    [x + w - 3, y],
    [x, y + d - 3],
    [x + w - 3, y + d - 3],
  ].map(([px, py]) => {
    const b = box(px!, py!, 0, 3, 3, top);
    return faces(b.side, b.front);
  });
  const [tx, ty] = P(x + w / 2, y + d, top + 18);
  return (
    <g aria-hidden="true">
      <polygon points={flat(x + 3, y + 3, 0, w, d)} fill="var(--ink)" opacity={0.12} stroke="none" />
      <path d={posts[0]} fill="var(--timber-dark)" />
      {levels.map((z, li) => (
        <g key={z}>
          <Box x={x} y={y} z={z} w={w} d={d} h={3} fills={wood} />
          {Array.from({ length: RACK.perLevel }, (_, j) => li * RACK.perLevel + j)
            .filter((k) => k < drawn)
            .map((k) => {
              const [px, py, pz] = rackSlot(k);
              return <Parcel key={k} x={px} y={py} z={pz} today={k >= drawn - today} land={k >= drawn - landing} />;
            })}
        </g>
      ))}
      <Box x={x} y={y} z={top} w={w} d={d} h={3} fills={wood} />
      <path d={posts.slice(1).join('')} fill="var(--timber-dark)" />
      {total > RACK_SHOWN && (
        <g>
          <line x1={tx} y1={ty + 6} x2={tx} y2={ty + 16} strokeWidth={1} />
          <rect x={tx - 17} y={ty - 9} width={34} height={17} rx={3} fill="var(--paper)" />
          <text x={tx} y={ty + 4} textAnchor="middle" className="lw-tag" fill="var(--ink)" stroke="none">
            +{total - RACK_SHOWN}
          </text>
        </g>
      )}
    </g>
  );
});

export const Plant = memo(function Plant({ x, y }: { x: number; y: number }) {
  const [px, py] = P(x + 8, y + 8, 16);
  return (
    <g aria-hidden="true">
      <Box x={x} y={y} z={0} w={16} d={16} h={16} fills={{ top: 'var(--timber-dark)', front: 'var(--brick)', side: 'var(--timber-dark)' }} />
      <path
        d={`M${px},${py} Q${px - 18},${py - 10} ${px - 14},${py - 30} Q${px - 4},${py - 18} ${px},${py} Z M${px},${py} Q${px + 18},${py - 12} ${px + 12},${py - 34} Q${px + 2},${py - 20} ${px},${py} Z`}
        fill="var(--moss)"
      />
      <path d={`M${px},${py} Q${px - 6},${py - 26} ${px + 1},${py - 42} Q${px + 7},${py - 24} ${px},${py} Z`} fill="var(--moss-soft)" />
    </g>
  );
});

/** Cut-down right and front walls. Drawn after the people so the low walls sit in front of their feet. */
export const FrontStubs = memo(function FrontStubs() {
  return (
    <g aria-hidden="true">
      <Box x={W} y={-T} z={0} w={T} d={D + T} h={STUB} fills={{ top: 'var(--dusk-900)', front: 'var(--moss)', side: 'var(--moss)' }} />
      <Box x={SHOPFRONT.x1} y={D} z={0} w={W + T - SHOPFRONT.x1} d={T} h={STUB} fills={{ top: 'var(--dusk-900)', front: 'var(--moss)', side: 'var(--moss)' }} />
    </g>
  );
});

function fit(name: string, size: number, room: number): { text: string; squeeze?: number } {
  const text = name.length > 22 ? `${name.slice(0, 21)}…` : name;
  const est = text.length * size * 0.56;
  return est > room ? { text, squeeze: room } : { text };
}

/** One hanging board: name over price. */
function Board({ o, x, y, w, h, tilt }: { o: OfferSpec; x: number; y: number; w: number; h: number; tilt: number }) {
  const n = fit(o.name, 12, w - 8);
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt} ${w / 2} 0)`}>
      <rect x={0} y={0} width={w} height={h} rx={2.5} fill="var(--paper)" strokeWidth={1.4} />
      <text x={w / 2} y={h * 0.46} textAnchor="middle" className="lw-sign" fontSize={12} fill="var(--ink)" stroke="none" textLength={n.squeeze} lengthAdjust="spacingAndGlyphs">
        {n.text}
      </text>
      <text x={w / 2} y={h * 0.46 + 12.5} textAnchor="middle" className="lw-sign" fontSize={11} fill="var(--brick)" stroke="none">
        {o.price} cr
      </text>
    </g>
  );
}

/** The window sign: one board for one offer, two hanging boards for two, a Closed board at the end of the day. */
function WindowSign({ menu, closed, ww }: { menu: OfferSpec[]; closed: boolean; ww: number }) {
  const bw = ww - 16;
  if (closed) {
    return (
      <g>
        <path d={`M${ww / 2 - 22},13 L${ww / 2},4 L${ww / 2 + 22},13`} fill="none" strokeWidth={1} />
        <rect x={ww / 2 - 38} y={13} width={76} height={34} rx={3} fill="var(--paper)" strokeWidth={1.5} />
        <text x={ww / 2} y={35} textAnchor="middle" className="lw-sign" fontSize={16} fill="var(--brick)" stroke="none">
          Closed
        </text>
      </g>
    );
  }
  if (menu.length === 0) {
    return (
      <g>
        <rect x={8} y={17} width={bw} height={30} rx={2.5} fill="var(--paper)" strokeWidth={1.5} />
        <text x={ww / 2} y={37} textAnchor="middle" className="lw-sign" fontSize={12} fill="var(--ink-soft)" stroke="none">
          Back soon
        </text>
      </g>
    );
  }
  if (menu.length === 1) {
    const o = menu[0]!;
    const n = fit(o.name, 14, bw - 10);
    return (
      <g stroke="none">
        <rect x={8} y={17} width={bw} height={54} rx={2.5} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} />
        <text x={ww / 2} y={41} textAnchor="middle" className="lw-sign" fontSize={14} fill="var(--ink)" textLength={n.squeeze} lengthAdjust="spacingAndGlyphs">
          {n.text}
        </text>
        <text x={ww / 2} y={60} textAnchor="middle" className="lw-sign" fontSize={13} fill="var(--brick)">
          {o.price} cr
        </text>
      </g>
    );
  }
  const bh = 31;
  return (
    <g>
      {/* Strings: the top board hangs from the transom, the second from the first. */}
      <path d={`M24,13 V17 M${ww - 24},13 V17 M26,${17 + bh} V${21 + bh} M${ww - 26},${17 + bh} V${21 + bh}`} fill="none" strokeWidth={1} />
      <Board o={menu[0]!} x={8} y={17} w={bw} h={bh} tilt={-1.2} />
      <Board o={menu[1]!} x={8} y={21 + bh} w={bw} h={bh} tilt={1.2} />
      {menu.length > 2 && (
        <g transform={`translate(${ww - 34} ${22 + 2 * bh})`}>
          <rect x={0} y={0} width={30} height={14} rx={2} fill="var(--lamp-soft)" strokeWidth={1} />
          <text x={15} y={10.5} textAnchor="middle" className="lw-sign" fontSize={10} fill="var(--ink)" stroke="none">
            +{menu.length - 2}
          </text>
        </g>
      )}
    </g>
  );
}

export const Shopfront = memo(function Shopfront({ id, menu, closed }: { id: string; menu: OfferSpec[]; closed: boolean }) {
  const { x0, x1, window: win, door } = SHOPFRONT;
  const yf = D + T;
  const ww = win.x1 - win.x0;
  const wh = win.z1 - win.z0;
  // The sign flips when what it says changes (not on first draw): the key remounts it with the flip class.
  const sig = closed ? 'closed' : menu.map((o) => `${o.name}|${o.price}`).join('/');
  const [seen, setSeen] = useState({ sig, flips: 0 });
  if (seen.sig !== sig) setSeen({ sig, flips: seen.flips + 1 });
  return (
    <g aria-hidden="true">
      <polygon points={wallY(x0, yf, 0, x1 - x0, H)} fill="var(--moss)" />
      <polygon points={wallY(x0, yf, 0, x1 - x0, 9)} fill="var(--dusk-900)" />
      <path d={faces(wallX(x1, D, 0, T, H), flat(x0, D, H, x1 - x0, T))} fill="var(--dusk-900)" />
      {/* Door. */}
      <g transform={onWallY(door.x0, yf, door.h)}>
        <rect x={-3} y={-3} width={door.x1 - door.x0 + 6} height={door.h + 3} fill="var(--paper)" />
        <rect x={0} y={0} width={door.x1 - door.x0} height={door.h} fill="var(--timber-dark)" />
        <rect x={6} y={8} width={door.x1 - door.x0 - 12} height={30} fill={closed ? 'var(--lamp)' : 'var(--lamp-soft)'} />
        <rect x={6} y={50} width={door.x1 - door.x0 - 12} height={30} fill="none" stroke="var(--ink)" strokeOpacity={0.5} />
        <circle cx={door.x1 - door.x0 - 6} cy={48} r={2.2} fill="var(--lamp)" />
      </g>
      <polygon points={flat(door.x0 - 3, yf, 0, door.x1 - door.x0 + 6, 9)} fill="var(--paper-shade)" />
      {/* Window: soft glow, trim, glowing pane, the hanging sign. */}
      <g transform={onWallY(win.x0, yf, win.z1)}>
        <rect x={-12} y={-10} width={ww + 24} height={wh + 22} fill="var(--lamp)" opacity={0.9} stroke="none" filter={`url(#${id}-blur)`} />
        <rect x={-4} y={-4} width={ww + 8} height={wh + 8} fill="var(--paper)" />
        <rect x={0} y={0} width={ww} height={wh} fill={`url(#${id}-pane)`} />
        <path d={`M0,13H${ww}M${ww / 2},0V13`} stroke="var(--timber-dark)" strokeWidth={2} />
        <g key={sig} className={seen.flips > 0 ? 'lw-flip' : undefined}>
          <WindowSign menu={menu} closed={closed} ww={ww} />
        </g>
        <rect x={-7} y={wh + 3} width={ww + 14} height={5} fill="var(--timber)" />
      </g>
      {/* Fascia with the shop's name. */}
      <g transform={onWallY(x0 + 6, yf, H - 6)}>
        <rect x={0} y={0} width={x1 - x0 - 12} height={19} rx={1.5} fill="var(--ink)" />
        <text x={(x1 - x0 - 12) / 2} y={14} textAnchor="middle" className="lw-sign" fontSize={13} fill="var(--lamp-soft)" stroke="none" letterSpacing={0.6}>
          Lantern Works
        </text>
      </g>
      {/* A little hanging lantern over the door's far side, clear of the sign. */}
      <Lantern x={door.x1 + 3} id={id} />
    </g>
  );
});

function Lantern({ x, id }: { x: number; id: string }) {
  const [ax, ay] = P(x, D + T, 104);
  const [bx, by] = P(x, D + T + 9, 104);
  return (
    <g>
      <circle cx={bx} cy={by + 14} r={18} fill={`url(#${id}-glow)`} stroke="none" />
      <path d={`M${ax},${ay} L${bx},${by} M${bx},${by} V${by + 5}`} strokeWidth={1.6} fill="none" />
      <path d={`M${bx - 5},${by + 6} L${bx + 5},${by + 6} L${bx + 6},${by + 19} L${bx - 6},${by + 19} Z`} fill="var(--lamp-soft)" />
      <path d={`M${bx - 7},${by + 6} L${bx + 7},${by + 6} L${bx},${by + 1} Z`} fill="var(--ink)" />
    </g>
  );
}

export const MissedPuff = memo(function MissedPuff({ count }: { count: number }) {
  const [cx, cy] = P((SHOPFRONT.door.x0 + SHOPFRONT.door.x1) / 2 + 14, D + T + 14, SHOPFRONT.door.h + 18);
  return (
    <g aria-hidden="true">
      <g className="lw-puff">
        <path d={`M${cx - 14},${cy + 6} a7,7 0 0 1 3,-13 a9,9 0 0 1 16,-3 a7,7 0 0 1 9,10 a6,6 0 0 1 -4,10 Z`} fill="var(--brick-soft)" stroke="var(--brick)" strokeWidth={1.5} />
        <text x={cx + 1} y={cy + 4} textAnchor="middle" className="lw-sign" fontSize={13} fill="var(--brick)" stroke="none">
          {count > 1 ? `${count}!` : '!'}
        </text>
      </g>
    </g>
  );
});
