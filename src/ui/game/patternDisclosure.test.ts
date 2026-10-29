import { describe, expect, it } from 'vitest';
import { patternBriefingLine } from './patternDisclosure';

describe('actual pattern briefing savings', () => {
  it('discloses the native single-piece saving, including a reduction below fifteen', () => {
    expect(patternBriefingLine([15], ['Poster'])).toBe('Saves 15 briefing minutes.');
    expect(patternBriefingLine([8], ['Poster'])).toBe('Saves 8 briefing minutes.');
    expect(patternBriefingLine([1], ['Poster'])).toBe('Saves 1 briefing minute.');
  });

  it('does not promise a saving when the matching briefing is already at its minimum', () => {
    expect(patternBriefingLine([0], ['Poster'])).toBe('No briefing time saved. Matching pieces are already at the briefing minimum.');
    expect(patternBriefingLine([0, 0], ['Invitation', 'Sheet'])).toBe('No briefing time saved. Matching pieces are already at the briefing minimum.');
  });

  it('keeps mixed savings attached to their exact pieces instead of reporting the maximum for all', () => {
    expect(patternBriefingLine([0, 8, 15], ['Invitation', 'Map', 'Programme'])).toBe('Invitation: no saving; Map: 8 min saved; Programme: 15 min saved.');
  });
});
