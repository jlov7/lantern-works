// Colours and small style helpers for figures. Palette tokens only; neighbours take their hue from the cast.
import type { CSSProperties } from 'react';

export interface Look {
  body: string;
  bodyShade: string;
  skin: string;
  hair: string;
  hairStyle: 'bun' | 'short' | 'long' | 'cap';
  apron?: boolean;
  shape?: 'broad' | 'coat';
  accessory?: 'glasses' | 'scarf' | 'bag';
}

/** Ada (moss shirt, bun) and Tomas (brick shirt, short hair), then up to two more on the day's roster, all in paper aprons. */
export const STAFF_LOOKS: Look[] = [
  { body: 'var(--moss)', bodyShade: 'var(--ink-soft)', skin: 'var(--timber)', hair: 'var(--ink)', hairStyle: 'bun', apron: true },
  { body: 'var(--brick)', bodyShade: 'var(--ink-soft)', skin: 'var(--paper-shade)', hair: 'var(--timber-dark)', hairStyle: 'short', apron: true, shape: 'broad', accessory: 'glasses' },
  { body: 'var(--sky-equip)', bodyShade: 'var(--dusk-600)', skin: 'var(--timber-dark)', hair: 'var(--ink)', hairStyle: 'long', apron: true, accessory: 'scarf' },
  { body: 'var(--lamp)', bodyShade: 'var(--timber)', skin: 'var(--paper-shade)', hair: 'var(--dusk-600)', hairStyle: 'cap', apron: true },
];

const SKINS = ['var(--paper-shade)', 'var(--timber)', 'var(--lamp-soft)', 'var(--timber-dark)'];
const HAIRS = ['var(--ink)', 'var(--timber-dark)', 'var(--dusk-600)', 'var(--paper)'];
const STYLES: Look['hairStyle'][] = ['short', 'long', 'bun', 'cap'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function neighbourLook(castId: string, hue: number): Look {
  const h = hash(castId);
  return {
    body: `hsl(${hue} 42% 58%)`,
    bodyShade: `hsl(${hue} 38% 42%)`,
    skin: SKINS[h % SKINS.length]!,
    hair: HAIRS[(h >> 3) % HAIRS.length]!,
    hairStyle: STYLES[(h >> 5) % STYLES.length]!,
    shape: h % 3 === 0 ? 'broad' : h % 3 === 1 ? 'coat' : undefined,
    accessory: (['glasses', 'scarf', 'bag'] as const)[(h >> 7) % 3],
  };
}

/** CSS custom properties for a one-shot move from (dx, dy) back to where the element is drawn, in screen units. */
export function shift(dx: number, dy: number): CSSProperties {
  return { '--dx': `${Math.round(dx)}px`, '--dy': `${Math.round(dy)}px` } as CSSProperties;
}
