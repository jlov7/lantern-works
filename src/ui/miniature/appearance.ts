export interface PersonLook {
  shirt: 'green' | 'terra' | 'blue' | 'cream' | 'brass' | 'greenLight';
  skin: 'skin' | 'skinLight' | 'skinDark';
  hair: 'hair' | 'edge' | 'silver';
  style: 'short' | 'bun' | 'long' | 'cap';
  apron?: boolean;
  glasses?: boolean;
  beard?: 'edge' | 'silver';
  scarf?: boolean;
  broad?: boolean;
}

const STAFF: Record<string, PersonLook> = {
  Ada: { shirt: 'green', skin: 'skin', hair: 'hair', style: 'bun', apron: true },
  Tomas: { shirt: 'terra', skin: 'skinLight', hair: 'edge', style: 'short', apron: true, glasses: true, broad: true },
  Noor: { shirt: 'blue', skin: 'skinDark', hair: 'hair', style: 'long', apron: true, scarf: true },
};
const TEMP: PersonLook = { shirt: 'brass', skin: 'skinLight', hair: 'hair', style: 'cap', apron: true };
const PRINCIPALS: Record<string, PersonLook> = {
  mara: { shirt: 'terra', skin: 'skin', hair: 'edge', style: 'bun', apron: true },
  hugo: { shirt: 'blue', skin: 'skinLight', hair: 'silver', style: 'short', glasses: true, beard: 'silver' },
  ivo: { shirt: 'cream', skin: 'skin', hair: 'edge', style: 'short', apron: true, beard: 'edge' },
  clem: { shirt: 'blue', skin: 'skin', hair: 'silver', style: 'cap', beard: 'silver', broad: true },
};

export function staffLook(name: string): PersonLook { return STAFF[name] ?? TEMP; }
export function customerLook(castId: string): PersonLook {
  if (PRINCIPALS[castId]) return PRINCIPALS[castId];
  let hash = 0;
  for (const letter of castId) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  return {
    shirt: (['terra', 'greenLight', 'cream', 'green'] as const)[hash % 4]!,
    skin: (['skinLight', 'skin', 'skinDark'] as const)[(hash >>> 2) % 3]!,
    hair: (['hair', 'edge', 'silver'] as const)[(hash >>> 4) % 3]!,
    style: (['short', 'long', 'bun', 'cap'] as const)[(hash >>> 6) % 4]!,
    glasses: (hash >>> 8) % 4 === 0,
  };
}
