import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../engine/design';
import { RULES } from '../../engine/rules';
import { clemBrief, clemQuote, printClem } from './commission';

describe('Clem’s focused anniversary commission', () => {
  it.each([
    ['new-band', 150, 60],
    ['first-night', 0, 120],
  ] as const)('carries the approved %s proof to an earned delivery', (approach, materials, minutes) => {
    const brief = clemBrief(approach);
    const design = structuredClone(brief.defaultDesign);
    const proof = design.pieces[0]!;
    proof.headline = 'The last set is ours';
    proof.palette = 'poppy';
    const quote = clemQuote(approach, design)!;
    expect(quote.offer.price).toBe(1200);
    expect(quote.project.materials).toBe(materials);
    expect(quote.profiles[0]?.finish ?? RULES.effort.finish).toBe(minutes);

    const result = printClem(approach, design)!;
    expect(result.state.commands.filter(command => command.type === 'acceptProject')).toHaveLength(1);
    expect(result.piece).toMatchObject({ castId: 'clem', complete: true, day: 3, route: expect.any(String) });
    expect(result.piece.brief.proof?.design).toEqual(design);
    expect(PALETTES[result.piece.brief.proof!.design.pieces[0]!.palette].name).toBe('Poppy & cream');
  });
});
