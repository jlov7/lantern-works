import { describe, expect, it } from 'vitest';
import { LAYOUT_IDS, LAYOUTS, fitMotif, motifFits, type DesignPiece, type MotifPlacement } from '../../engine/design';
import { addedMotif, dragMotif } from './proofInteraction';

const motif: MotifPlacement = { id: 'trumpet', x: 50, y: 50, scale: 1, rotation: 90 };

describe('proof dragging', () => {
  it('preserves the grab offset and rounds to the integer placement grid', () => {
    expect(dragMotif('gallery', motif, { x: 45, y: 47 }, { x: 51.6, y: 50.2 })).toEqual({ ...motif, x: 57, y: 53 });
    expect(motif).toEqual({ id: 'trumpet', x: 50, y: 50, scale: 1, rotation: 90 });
  });

  it('fits outside-pointer movement to every layout without changing rotation', () => {
    for (const layout of LAYOUT_IDS) for (const x of [-500, 500]) for (const y of [-500, 500]) {
      const result = dragMotif(layout, { ...motif, scale: 3 }, { x: 50, y: 50 }, { x, y });
      expect(motifFits(layout, result)).toBe(true);
      expect(Number.isInteger(result.x) && Number.isInteger(result.y)).toBe(true);
      expect(result.rotation).toBe(90);
      expect([1, 2, 3]).toContain(result.scale);
    }
  });
});

describe('adding an illustration', () => {
  const photograph: DesignPiece = { kind: 'poster', layout: 'gallery', palette: 'midnight', typeface: 'serif', treatment: 'standard', copy: ['title'], motifs: [{ id: 'first-photo', x: 50, y: 50, scale: 3, rotation: 0 }] };
  it('starts extra decorative marks small in a corner without changing the photograph', () => {
    const before = structuredClone(photograph);
    for (const layout of LAYOUT_IDS) {
      const piece = { ...photograph, layout };
      const mark = addedMotif(piece, 'star');
      expect(mark.scale).toBe(1);
      expect(mark.x).toBeLessThan(LAYOUTS[layout].art.x + LAYOUTS[layout].art.width / 2);
      expect(mark.y).toBeGreaterThan(LAYOUTS[layout].art.y + LAYOUTS[layout].art.height / 2);
      expect(motifFits(layout, mark)).toBe(true);
    }
    expect(photograph).toEqual(before);
  });
  it('retains the existing centred default on other pieces and when adding the photograph itself', () => {
    const art = LAYOUTS[photograph.layout].art;
    for (const id of ['star', 'first-photo'] as const) expect(addedMotif({ ...photograph, motifs: [] }, id)).toEqual(fitMotif(photograph.layout, { id, x: art.x + art.width / 2, y: art.y + art.height / 2, scale: 3, rotation: 0 }));
  });
});
