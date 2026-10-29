// Daylight for the miniature: a pale morning at 9, amber around 3, the blue hour at 5 when the shop closes.
// Pure numbers and hex colours so the static layers can be memoised on a quantised clock.

type RGB = readonly [number, number, number];

interface Key {
  at: number;
  skyTop: RGB;
  skyMid: RGB;
  skyLow: RGB;
  house: RGB;
  street: RGB;
  road: RGB;
}

const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

/** Offsets are minutes after 9am. */
const KEYS: Key[] = [
  { at: 0, skyTop: hex('#9fb7d3'), skyMid: hex('#c9d6e3'), skyLow: hex('#f1e6d2'), house: hex('#7d8bb0'), street: hex('#77809f'), road: hex('#646c8c') },
  { at: 180, skyTop: hex('#86a6cf'), skyMid: hex('#b4c9e2'), skyLow: hex('#e9e3d6'), house: hex('#7584ab'), street: hex('#727b9b'), road: hex('#5f6787') },
  { at: 360, skyTop: hex('#7d86b4'), skyMid: hex('#d9a878'), skyLow: hex('#f3c27a'), house: hex('#5d6690'), street: hex('#5c6488'), road: hex('#4d5478') },
  { at: 420, skyTop: hex('#4b5689'), skyMid: hex('#b9816f'), skyLow: hex('#eaa565'), house: hex('#434d7a'), street: hex('#454e77'), road: hex('#3a426a') },
  { at: 480, skyTop: hex('#1c2550'), skyMid: hex('#2f3f78'), skyLow: hex('#b97d6f'), house: hex('#2c3560'), street: hex('#313c63'), road: hex('#283152') },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export interface Light {
  /** Quantised offset this light was computed for. */
  at: number;
  skyTop: string;
  skyMid: string;
  skyLow: string;
  house: string;
  houseAlt: string;
  street: string;
  road: string;
  /** 0..1: share of the houses' windows lit. */
  windows: number;
  /** 0..1: street lamps and the pavement pools. Zero before 3:30pm. */
  lamps: number;
  /** 0..1: stars, only in the blue hour. */
  stars: number;
  /** 0..1: the shop window's spill on the pavement. */
  spill: number;
  /** 0..1: interior dropping to warm sconce light at closing. */
  closing: number;
}

/** Light at a day offset (0 = 9am, 480 = 5pm), quantised to 5 minutes so layers re-render about 100 times a day. */
export function lightAt(offset: number): Light {
  const at = Math.max(0, Math.min(480, Math.round(offset / 5) * 5));
  let i = 0;
  while (i < KEYS.length - 2 && at > KEYS[i + 1]!.at) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const t = clamp01((at - a.at) / (b.at - a.at));
  const house = mixRGB(a.house, b.house, t);
  return {
    at,
    skyTop: toHex(mixRGB(a.skyTop, b.skyTop, t)),
    skyMid: toHex(mixRGB(a.skyMid, b.skyMid, t)),
    skyLow: toHex(mixRGB(a.skyLow, b.skyLow, t)),
    house: toHex(house),
    houseAlt: toHex(mixRGB(house, [20, 24, 48], 0.12)),
    street: toHex(mixRGB(a.street, b.street, t)),
    road: toHex(mixRGB(a.road, b.road, t)),
    windows: clamp01((at - 300) / 180),
    lamps: clamp01((at - 390) / 30),
    stars: clamp01((at - 440) / 40),
    spill: 0.25 + 0.75 * clamp01((at - 330) / 120),
    closing: clamp01((at - 450) / 30),
  };
}

/** Relative luminance of a #rrggbb colour (WCAG formula), for tests and checks. */
export function luminance(c: string): number {
  const ch = hex(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
