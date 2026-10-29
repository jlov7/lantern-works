import { describe, expect, it } from 'vitest';
import fixture from './fixtures/career-7.0.0.json';
import { careerStage, careerStories } from './career';
import { deliveredPieces } from './continuation';
import { nightResult, projectRecords } from './projects';
import { RULES } from './rules';
import { replay } from './sim';
import type { Command, CompanyState, RunConfig } from './types';
import { configSchema } from '../ui/schema';

// These are fixed native command tapes. No state, money or relationship is patched
// to make a route possible, and none depends on its parent's browser save.
describe('complete native careers', () => {
  it.each(fixture.routes)('$id finishes the finite arc and continues with real recurring work', route => {
    const states: CompanyState[] = [];
    for (const [i, tape] of route.seasons.entries()) {
      expect(configSchema.safeParse(tape.config).success).toBe(true);
      const result = replay(tape.config as RunConfig, tape.commands as Command[], fixture.rules);
      expect(result.errors).toEqual([]);
      const s = result.state;
      expect(s.finished).toBe(true);
      expect(careerStage(s)).toBe(['opening', 'practice', 'legacy', 'open'][i]);
      expect(s.cash).toBeGreaterThan(0);
      if (i) {
        const previous = states[i - 1]!;
        expect(s.config.continuation!.cash).toBe(previous.cash);
        const available = [...(previous.config.continuation?.pieces ?? []), ...deliveredPieces(previous)];
        for (const piece of s.config.continuation!.pieces) {
          const parent = available.find(p => p.sourceSeason === piece.sourceSeason && p.sourceJobId === piece.sourceJobId)!;
          expect(parent).toBeDefined();
          expect({ design: piece.design, title: piece.title, copy: piece.copy, source: piece.source }).toEqual({ design: parent.design, title: parent.title, copy: parent.copy, source: parent.source });
        }
      }
      states.push(s);
    }
    const legacy = states[2]!;
    const open = states[3]!;
    expect(careerStories(legacy)).toHaveLength(9);
    expect(careerStories(open)).toEqual(careerStories(legacy));
    expect(nightResult(legacy).project).toMatchObject({ status: 'delivered' });
    if (route.id === 'modest') {
      expect(states.every(s => !s.resources.some(r => r.name === RULES.staff.junior.name))).toBe(true);
      const principals = projectRecords(legacy).filter(p => p.id !== 'lantern-night');
      expect(principals).toHaveLength(3);
      expect(principals.every(p => p.status === 'delivered' && p.earned && p.contract.project!.materials === 0)).toBe(true);
      expect(principals.filter(p => p.host).map(p => p.id)).toEqual(['clem-ten']);
      expect(principals.find(p => p.id === 'clem-ten')!.contract.project!.lentPiece).toBeDefined();
      expect(nightResult(legacy).project!.approach).toBe('courtyard');
      expect(nightResult(legacy).project!.acceptedDay).toBeLessThanOrEqual(5);
      expect(nightResult(legacy).project!.contract.project!.materials).toBe(0);
    } else if (route.id === 'prosperous') {
      expect(nightResult(legacy).project!.approach).toBe('trail');
      expect(nightResult(legacy).contributors.filter(p => p.host && p.earned).length).toBeGreaterThanOrEqual(2);
      expect(states.some(s => s.events.some(e => e.type === 'pattern_teaching_done'))).toBe(true);
      expect(legacy.events.some(e => e.type === 'pattern_used' && legacy.jobs.some(j => j.id === e.jobId && j.status === 'delivered'))).toBe(true);
    } else {
      const old = projectRecords(legacy).find(p => p.id === 'mara-regular')!;
      expect(old).toMatchObject({ status: 'compromised', earned: false });
      expect(legacy.lostCast).toContain('mara');
      expect(open.lostCast).not.toContain('mara');
      expect(open.relationshipMemory!.some(r => r.castId === 'mara' && r.kind === 'amends-kept')).toBe(true);
      expect(legacy.lostCast.some(id => id !== 'mara' && open.lostCast.includes(id))).toBe(true);
      expect(careerStories(open).find(r => r.nodeId === 'mara-legacy')!.outcome).toBe('compromised');
    }
  });
});
