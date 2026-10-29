// Projection and layout for the Lantern Works miniature. World units: x runs along the street (the work flow),
// y runs from the back wall toward the street, z is up. The axes below are a near-orthographic trimetric view,
// tilted so the long shop reads left to right and painted text on the front wall stays legible.

export const VIEW_W = 960;
export const VIEW_H = 560;

/** Shop interior: length, depth, wall height, wall thickness. */
export const W = 800;
export const D = 210;
export const H = 130;
export const T = 8;
/** Height of the cut-down front and right walls. */
export const STUB = 16;

const OX = 215;
const OY = 192;
const EX = [0.92, 0.27] as const;
const EY = [-0.62, 0.41] as const;

export type Pt = readonly [number, number];
export type V3 = readonly [number, number, number];

export function P(x: number, y: number, z = 0): Pt {
  return [OX + EX[0] * x + EY[0] * y, OY + EX[1] * x + EY[1] * y - z];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function pts(list: readonly V3[]): string {
  return list.map(([x, y, z]) => P(x, y, z).map(r1).join(',')).join(' ');
}

/** Flat rectangle lying in a z plane. */
export function flat(x: number, y: number, z: number, w: number, d: number): string {
  return pts([
    [x, y, z],
    [x + w, y, z],
    [x + w, y + d, z],
    [x, y + d, z],
  ]);
}

/** Rectangle standing in a y plane (faces the street). */
export function wallY(x: number, y: number, z: number, w: number, h: number): string {
  return pts([
    [x, y, z],
    [x + w, y, z],
    [x + w, y, z + h],
    [x, y, z + h],
  ]);
}

/** Rectangle standing in an x plane (faces the right end of the street). */
export function wallX(x: number, y: number, z: number, d: number, h: number): string {
  return pts([
    [x, y, z],
    [x, y + d, z],
    [x, y + d, z + h],
    [x, y, z + h],
  ]);
}

export interface BoxFaces {
  top: string;
  front: string;
  side: string;
}

/** The three visible faces of an axis-aligned box: top, street-facing front (+y), and right side (+x). */
export function box(x: number, y: number, z: number, w: number, d: number, h: number): BoxFaces {
  return {
    top: flat(x, y, z + h, w, d),
    front: wallY(x, y + d, z, w, h),
    side: wallX(x + w, y, z, d, h),
  };
}

/** SVG transform that maps local 2D drawing (u right, v down) onto a y plane at world (x, y, z). */
export function onWallY(x: number, y: number, z: number): string {
  const [sx, sy] = P(x, y, z);
  return `matrix(${EX[0]} ${EX[1]} 0 1 ${r1(sx)} ${r1(sy)})`;
}

/** SVG transform that maps local 2D drawing (u along x, v along y) onto the ground plane at height z. */
export function onFloor(x: number, y: number, z: number): string {
  const [sx, sy] = P(x, y, z);
  return `matrix(${EX[0]} ${EX[1]} ${EY[0]} ${EY[1]} ${r1(sx)} ${r1(sy)})`;
}

// ---- Layout (world units) -------------------------------------------------------------------------------------

export const SHOPFRONT = { x0: -T, x1: 175, window: { x0: 8, x1: 128, z0: 16, z1: 106 }, door: { x0: 138, x1: 168, h: 92 } };

export interface Surface {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
}

export const BRIEF_TABLE: Surface = { x: 190, y: 48, w: 82, d: 70, h: 30 };
export const TRAY: Surface = { x: 292, y: 140, w: 46, d: 40, h: 24 };
export const KIT_BOARD = { x: 286, w: 72, z: 50, h: 58 };
export const MAKE_DESKS: Surface[] = [
  { x: 368, y: 46, w: 78, d: 62, h: 32 },
  { x: 462, y: 46, w: 78, d: 62, h: 32 },
];
export const AI_DESKS: Surface[] = [
  { x: 572, y: 14, w: 64, d: 52, h: 28 },
  { x: 572, y: 96, w: 64, d: 52, h: 28 },
];
export const FINISH_BENCH: Surface = { x: 646, y: 40, w: 68, d: 64, h: 32 };
export const RACK = { x: 744, y: 20, w: 40, d: 120, levels: [4, 27, 50, 73], top: 96, perLevel: 5 };
export const CLOCK = { x: 150, z: 98, r: 15 };

export const FOLDER = { w: 20, d: 14, t: 3.2 };

/** Where folder piles go on each surface (world x, y of each pile's back-left corner). */
export const PILES = {
  brief: [
    [198, 56],
    [224, 58],
    [248, 54],
    [204, 88],
    [240, 92],
  ],
  tray: [
    [296, 144],
    [316, 144],
    [296, 162],
    [316, 162],
  ],
  finish: [
    [652, 48],
    [676, 48],
    [654, 78],
    [680, 80],
  ],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

/** Where a person stands (feet) for each station, by their place in the morning roster (up to four people). */
export const SPOTS = {
  idle: [
    [174, 150],
    [236, 160],
    [120, 150],
    [200, 176],
  ],
  brief: [
    [214, 134],
    [254, 140],
    [188, 140],
    [238, 156],
  ],
  kit: [
    [298, 30],
    [284, 26],
    [312, 34],
    [326, 30],
  ],
  make: [
    [406, 122],
    [500, 122],
    [430, 130],
    [524, 130],
  ],
  finish: [
    [662, 120],
    [700, 124],
    [680, 142],
    [720, 140],
  ],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

/** Neighbour spots outside. */
export const STREET = {
  queueRows: [254, 278, 302],
  queueX0: 16,
  queueStep: 27,
  queuePerRow: 6,
  servedX0: 186,
  servedY0: 236,
  servedStep: 26,
  servedRowStep: 26,
  awayY: 420,
  awayX0: 450,
  awayStep: 25,
  /** Street band (y range) and lamps. */
  kerb: D + 104,
  farKerb: D + 200,
  lamps: [
    [-44, 196],
    [410, 418],
    [800, 410],
  ],
} as const;

/** Staff walk along this front aisle (world y) so they never cut through a table. */
export const AISLE = 188;
/** Just through the door, hidden by the shopfront: where people go home and come in from. */
export const DOOR_OUT = [153, 220] as const;
/** The waste bin by the making desks, where a missed promise's folder ends up. */
export const BIN = { x: 547, y: 156, w: 14, d: 14, h: 17 };
/** Where the pile on each making desk and AI desk sits. */
export const MAKE_PILE = [40, 26] as const;
export const AI_PILE = [42, 18] as const;

export const RACK_SHOWN = RACK.levels.length * RACK.perLevel;

/** World (x, y, z) of parcel slot k on the rack. */
export function rackSlot(k: number): [number, number, number] {
  const li = Math.min(RACK.levels.length - 1, Math.floor(k / RACK.perLevel));
  return [RACK.x + 8, RACK.y + 4 + (k % RACK.perLevel) * 24, RACK.levels[li]! + 3];
}

/** Several closed point lists as one path, so a group of same-coloured faces costs one node. */
export function faces(...list: string[]): string {
  return list.map((p) => `M${p}Z`).join('');
}

/** A filled circle as a path fragment, so several dots share one node. */
export function dot(x: number, y: number, r: number): string {
  return `M${x - r},${y}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0Z`;
}
