import { describe, expect, it } from 'vitest';
import { approveProof, briefForProject, fitMotif, LAYOUT_IDS, MOTIF_IDS, PALETTE_IDS, quoteDesign, validateDesign, type DesignSpec } from './design';
import { PROJECT_APPROACHES, PROJECTS } from './projects';
import type { ProjectId } from './types';

const brief = (approach = 'first-night' as typeof PROJECT_APPROACHES[number], scenarioId = 'main-street') => briefForProject({ projectId: (Object.keys(PROJECTS) as ProjectId[]).find(id => PROJECTS[id].approaches.includes(approach))!, approach, scenarioId, eventDay: 11, contributors: ['Clem Jazz Bar', 'Moonrise Bakery'] });

describe('authored proof contract', () => {
  for (const scenario of ['main-street', 'festival-week', 'bespoke-rush']) it.each(PROJECT_APPROACHES)(`${scenario}: %s starts with a valid standard proof`, approach => {
    const b = brief(approach, scenario);
    expect(validateDesign(b, b.defaultDesign)).toEqual([]);
    expect(quoteDesign(b, b.defaultDesign).every(x => x.materials === 0 && x.finishMinutes === 0)).toBe(true);
  });

  it('rejects missing customer copy, wrong artifact and misplaced illustrations separately', () => {
    const b = brief();
    const changed = structuredClone(b.defaultDesign);
    changed.pieces[0]!.copy = [];
    changed.pieces[0]!.kind = 'banner';
    changed.pieces[0]!.motifs[0]!.y = 5;
    expect(validateDesign(b, changed)).toEqual(expect.arrayContaining([expect.stringContaining('CLEM JAZZ BAR'), expect.stringContaining('photograph'), expect.stringContaining('picture area')]));
  });

  it('rejects invalid values and client-supplied costs at the boundary', () => {
    const b = brief();
    for (const input of [{ ...b.defaultDesign, materials: -50 }, { version: 1, pieces: [{ ...b.defaultDesign.pieces[0], palette: 'invisible' }] }, { version: 1, pieces: [{ ...b.defaultDesign.pieces[0], motifs: [{ id: 'first-photo', x: NaN, y: 50, scale: 3, rotation: 0 }] }] }]) expect(approveProof(b, input).proof).toBeUndefined();
  });

  it('keeps aesthetic choices free and can fit every motif safely after a layout change', () => {
    const b = brief('new-band');
    for (const layout of LAYOUT_IDS) for (const palette of PALETTE_IDS) {
      const design = structuredClone(b.defaultDesign);
      const p = design.pieces[0]!;
      p.layout = layout; p.palette = palette; p.typeface = 'letterpress'; p.headline = '<My own words & a question?>';
      p.motifs = p.motifs.map(m => fitMotif(layout, m));
      expect(validateDesign(b, design)).toEqual([]);
      expect(quoteDesign(b, design)).toEqual([{ materials: 0, finishMinutes: 0 }]);
    }
    for (const id of MOTIF_IDS) for (const layout of LAYOUT_IDS) expect(fitMotif(layout, { id, x: 0, y: 100, scale: 3, rotation: 270 })).toMatchObject({ id, rotation: 270 });
  });

  it('checks a series palette and charges only treatments selected on individual pieces', () => {
    const b = brief('weekly-rhythm');
    const design = structuredClone(b.defaultDesign);
    design.pieces[1]!.palette = 'midnight';
    expect(validateDesign(b, design)).toContain('Mara’s three cards need the same palette so they read as a family.');
    design.pieces[1]!.palette = design.pieces[0]!.palette;
    design.pieces[0]!.treatment = 'third-ink'; design.pieces[2]!.treatment = 'hand-border';
    expect(quoteDesign(b, design)).toEqual([{ materials: 20, finishMinutes: 10 }, { materials: 0, finishMinutes: 0 }, { materials: 20, finishMinutes: 30 }]);
  });

  it('freezes the approved art and customer copy against later mutation', () => {
    const b = brief('trail');
    const design: DesignSpec = structuredClone(b.defaultDesign);
    const result = approveProof(b, design);
    expect(result.errors).toEqual([]);
    design.pieces[0]!.palette = 'midnight'; b.pieces[0]!.copy[0]!.text = 'A different gathering';
    expect(result.proof!.design.pieces[0]!.palette).toBe('poppy');
    expect(result.proof!.pieces[0]!.copy[0]!.text).toBe('LANTERN NIGHT');
    expect(result.proof!.pieces[0]!.copy.at(-1)!.text).toBe('Clem Jazz Bar · Moonrise Bakery');
  });

  it('refuses missing pieces, unsupported illustrations and duplicated copy', () => {
    const b = brief('weekly-rhythm');
    expect(validateDesign(b, { version: 1, pieces: [b.defaultDesign.pieces[0]] })).toEqual(['This commission needs exactly 3 pieces.']);
    const design = structuredClone(b.defaultDesign);
    design.pieces[0]!.motifs[0]!.id = 'first-photo';
    design.pieces[0]!.copy.push(design.pieces[0]!.copy[0]!);
    expect(validateDesign(b, design)).toHaveLength(2);
  });
});
