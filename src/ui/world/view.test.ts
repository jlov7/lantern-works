import { describe, expect, it } from 'vitest';
import { AI_DESKS, BRIEF_TABLE, FINISH_BENCH, MAKE_DESKS, P, RACK, SPOTS, TRAY, VIEW_H, VIEW_W } from './iso';
import { phoneView } from './view';

describe('phone miniature framing', () => {
  it('keeps the original morning sign crop at narrow and large phone widths', () => {
    for (const [width, expectedWidth, bottom] of [[288, 340, 352], [358, 383.06, 352], [608, 520, 414.8]] as const) {
      const view = phoneView(width, false, 0);
      expect(view.x).toBe(20);
      expect(view.w).toBeCloseTo(expectedWidth);
      expect(view.y + view.h).toBeCloseTo(bottom);
    }
  });

  it('frames every working human slot, every work surface and the entire parcel rack', () => {
    const view = phoneView(358, true, 0);
    const inside = (x: number, y: number) => {
      expect(x).toBeGreaterThanOrEqual(view.x);
      expect(x).toBeLessThanOrEqual(view.x + view.w);
      expect(y).toBeGreaterThanOrEqual(view.y);
      expect(y).toBeLessThanOrEqual(view.y + view.h);
    };
    for (const spots of [SPOTS.brief, SPOTS.make, SPOTS.finish, SPOTS.kit]) for (const [x, y] of spots) {
      const [sx, sy] = P(x, y);
      inside(sx - 12, sy - 55);
      inside(sx + 12, sy + 4);
    }
    for (const table of [BRIEF_TABLE, TRAY, ...MAKE_DESKS, ...AI_DESKS, FINISH_BENCH]) {
      for (const x of [table.x, table.x + table.w]) for (const y of [table.y, table.y + table.d]) for (const z of [0, table.h]) inside(...P(x, y, z));
    }
    for (const x of [RACK.x, RACK.x + RACK.w]) for (const y of [RACK.y, RACK.y + RACK.d]) for (const z of [0, RACK.top]) inside(...P(x, y, z));
  });

  it('keeps the same miniature height and at least a 22px figure on the smallest phone', () => {
    for (const width of [288, 358, 608]) {
      const morning = phoneView(width, false, 0);
      const working = phoneView(width, true, 0);
      expect((working.h * width) / working.w).toBeCloseTo((morning.h * width) / morning.w);
      expect((53 * width) / working.w).toBeGreaterThanOrEqual(22);
    }
  });

  it('bounds manual panning within the scene in both modes', () => {
    for (const played of [false, true]) for (const pan of [-10000, -100, 0, 100, 10000]) {
      const view = phoneView(358, played, pan);
      expect(view.x).toBeGreaterThanOrEqual(0);
      expect(view.y).toBeGreaterThanOrEqual(0);
      expect(view.x + view.w).toBeLessThanOrEqual(VIEW_W);
      expect(view.y + view.h).toBeLessThanOrEqual(VIEW_H);
    }
  });
});
