import { expect, it } from 'vitest';
import { briefForProject } from '../../engine/design';
import { describePrint } from './describePrint';

it('describes the approved headline and motifs and leaves out unused copy', () => {
  const brief = briefForProject({ projectId: 'clem-ten', approach: 'new-band', scenarioId: 'festival-week', eventDay: 11, contributors: [] });
  const line = brief.pieces[0]!.copy[0]!;
  const design = { ...brief.defaultDesign.pieces[0]!, copy: [line.id], headline: 'The Thursday session' };
  const copy = [line, { id: 'unused', text: 'A different night', role: 'detail' as const }];
  const description = describePrint(design, copy, 'Band poster');
  expect(description).toContain(line.text);
  expect(description).toContain('The Thursday session');
  expect(description).toContain('Trumpet');
  expect(description).not.toContain('A different night');
});
