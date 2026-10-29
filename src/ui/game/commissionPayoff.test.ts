import { describe, expect, it } from 'vitest';
import { applyCommand, createRun, replay } from '../../engine/sim';
import { buildContinuation } from '../../engine/continuation';
import { CURRENT_RULES_VERSION, LEGACY_RULES_VERSION } from '../../engine/versions';
import { RULES } from '../../engine/rules';
import type { Command, CompanyState } from '../../engine/types';
import { nightStudy } from '../portfolio/study';
import native from './fixtures/festival-courtyard-payoff.json';
import courtyard from './fixtures/heartfelt-courtyard.json';
import trail from './fixtures/heartfelt-trail.json';
import festival from './fixtures/heartfelt-festival.json';
import { eveningCommissionAftermath, eveningCommissionPayoffs, seasonCommissionPayoff } from './commissionPayoff';

const replayed = replay(native.config, native.commands as Command[], native.rules);
const state = replayed.state;
const finish = (initial: CompanyState) => {
  let result = initial;
  for (let day = result.day; day < RULES.days; day++) {
    const next = applyCommand(result, { type: 'runDay' });
    expect(next.error).toBeUndefined();
    result = next.state;
  }
  return result;
};

describe('commission payoff moments', () => {
  it('answers the actual archive and portrait beside the print delivered, without early credit', () => {
    const run = replay(courtyard.config, courtyard.commands as Command[], courtyard.rules);
    expect(run.errors).toEqual([]);
    expect(eveningCommissionPayoffs(run.state, 3, 1581)).toEqual([]);
    const clem = eveningCommissionPayoffs(run.state, 3, 1582)[0]!;
    expect(clem.response).toContain('photograph to the old bar lettering');
    expect(clem.featuredPiece?.jobId).toBe('c5-l1');
    expect(clem.consequence).toContain('60 fewer finishing minutes');
    const hugo = eveningCommissionPayoffs(run.state, 7).find(p => p.approach === 'quiet-sendoff')!;
    expect(hugo.response).toContain('For Ivo. There is time to get it right.');
    expect(hugo.featuredPiece?.jobId).toBe('c13-l1');
  });

  it('gives each native spaced bakery card its own print and restrained progression', () => {
    const run = replay(trail.config, trail.commands as Command[], trail.rules);
    expect(run.errors).toEqual([]);
    const cards = [4, 6, 8].map(day => eveningCommissionPayoffs(run.state, day).find(p => p.approach === 'weekly-rhythm')!);
    expect(cards.map(p => p.phase)).toEqual(['progress', 'progress', 'delivered']);
    expect(cards.map(p => p.featuredPiece?.launch)).toEqual([1, 2, 3]);
    expect(cards.map(p => p.response)).toEqual([
      '“The first loaf” is ready. Mara clears a place for the first card. “There. We’ve started.”',
      '“A little time together” is ready. Mara puts the new card beside the first. “Keep that one up too.”',
      '“Save a place” is ready. Mara looks across the three cards. “I can keep this going.”',
    ]);
    expect(cards[0]!.consequence).toContain('earned when the whole set is delivered');
    expect(cards[2]!.consequence).toContain('100 cr less');
    expect(eveningCommissionPayoffs(run.state, 5).some(p => p.approach === 'weekly-rhythm')).toBe(false);
    expect(eveningCommissionPayoffs(run.state, 3)[0]!.response).toContain('THE NIGHT WINDOW TRIO');
  });

  it('does not celebrate a declined change as an unqualified kept promise', () => {
    const s = replay(courtyard.config, courtyard.commands as Command[], courtyard.rules).state;
    const job = s.jobs.find(j => j.id === 'c5-l1')!;
    job.changeDeclined = true;
    s.events.push({ type: 'project_change_declined', jobId: job.id, minute: 1500, day: 3 });
    s.relationshipMemory!.push({ castId: job.castId, kind: 'change-refused', contractId: job.contractId, minute: 1500, day: 3 });
    s.lostCast.push(job.castId);
    const payoff = eveningCommissionPayoffs(s, 3)[0]!;
    expect(payoff.phase).toBe('compromised');
    expect(payoff.response).toContain('declined change');
    expect(payoff.response).not.toContain('Leave that');
    expect(payoff.response).toContain('stopped commissioning');
    expect(payoff.consequence).toContain('withheld the contribution');
  });

  it('waits for the whole returning bakery set before describing the cards together', () => {
    const s = replay(trail.config, trail.commands as Command[], trail.rules).state;
    s.config.continuation = buildContinuation(s, []).continuation;
    const first = eveningCommissionPayoffs(s, 4).find(p => p.approach === 'weekly-rhythm')!;
    const complete = eveningCommissionPayoffs(s, 8).find(p => p.approach === 'weekly-rhythm')!;
    expect(first.phase).toBe('progress');
    expect(first.response).toContain('sets the new card beside the till');
    expect(first.response).not.toContain('cards together');
    expect(complete.phase).toBe('delivered');
    expect(complete.response).toContain('cards together');
  });

  it('keeps an unfinished bakery set distinct from its first delivered card', () => {
    const s = replay(trail.config, trail.commands as Command[], trail.rules).state;
    const job = s.jobs.find(j => j.id === 'c13-l2')!;
    job.status = 'missed';
    job.deliveredAt = null;
    s.events.push({ type: 'missed', jobId: job.id, minute: job.dueAt, day: 7 });
    const payoff = eveningCommissionPayoffs(s, 7).find(p => p.approach === 'weekly-rhythm')!;
    expect(payoff.phase).toBe('partial');
    expect(payoff.featuredPiece?.launch).toBe(1);
    expect(payoff.response).toContain('unfinished part of the promise');
    expect(payoff.response).not.toContain('Keep that one');
    expect(payoff.consequence).toContain('has not earned');
  });

  it('gives the native Festival one quiet aftermath evening with its actual ordinary deliveries', () => {
    const s = replay(festival.config, festival.commands as Command[], festival.rules).state;
    const expected = s.jobs.filter(j => !s.contracts.find(c => c.id === j.contractId)?.project && j.deliveredAt !== null && j.deliveredAt > 3840 && j.deliveredAt <= 4320).length;
    expect(expected).toBeGreaterThan(0);
    expect(eveningCommissionAftermath(s, 8)).toContain(`${expected} more ordinary`);
    expect(eveningCommissionAftermath(s, 7)).toBeNull();
    expect(eveningCommissionAftermath(s, 9)).toBeNull();
    expect(eveningCommissionPayoffs(s, 8).some(p => p.kind === 'night')).toBe(false);
    expect(eveningCommissionAftermath({ ...s, rulesVersion: 'lantern-5.0.0' }, 8)).toBeNull();
  });

  it('credits the native Day 5 archive only from its actual completion minute', () => {
    expect(replayed.errors).toEqual([]);
    expect(state.rulesVersion).toBe(native.rules);
    expect(eveningCommissionPayoffs(state, 4, 2261)).toEqual([]);
    const payoff = eveningCommissionPayoffs(state, 4, 2262)[0]!;
    expect(payoff).toMatchObject({ kind: 'milestone', phase: 'delivered', approach: 'first-night' });
    expect(payoff.title).toBe('Clem’s anniversary photograph');
    expect(payoff.consequence).toContain('60 fewer finishing minutes');
    expect(payoff.pieces).toHaveLength(1);
    expect(eveningCommissionPayoffs(state, 5)).toEqual([]);
  });

  it('distinguishes the real early-ready minute from the Day 8 event evening', () => {
    expect(eveningCommissionPayoffs(state, 7, 3571)).toEqual([]);
    const ready = eveningCommissionPayoffs(state, 7, 3572)[0]!;
    expect(ready).toMatchObject({ kind: 'night', phase: 'ready', approach: 'courtyard' });
    expect(ready.title).toContain('ready for Day 8');
    const settled = eveningCommissionPayoffs(state, 7)[0]!;
    expect(settled.phase).toBe('delivered');
    expect(settled.title).toBe('The lantern walk, one courtyard');
    expect(settled.contributors.map(p => p.castId)).toEqual(['clem']);
    expect(settled.line).toContain('Day 8 deadline');
    expect(eveningCommissionPayoffs(state, 8)).toEqual([]);
  });

  it('keeps ordinary evenings compact and does not infer a commission from the calendar', () => {
    expect(eveningCommissionPayoffs(createRun(native.config), 0)).toEqual([]);
    expect(eveningCommissionPayoffs(state, 0)).toEqual([]);
    expect(eveningCommissionPayoffs(state, 6)).toEqual([]);
  });

  it('reconstructs the native ending with its chosen scene and exact delivered artifacts', () => {
    const end = finish(state);
    const payoff = seasonCommissionPayoff(end)!;
    expect(payoff).toMatchObject({ kind: 'night', phase: 'delivered', approach: 'courtyard', promised: 1 });
    expect(payoff.pieces).toHaveLength(1);
    expect(payoff.contributors.map(p => p.brief.project?.approach)).toEqual(['first-night']);
    expect(seasonCommissionPayoff(end, 3571)!.pieces).toHaveLength(0);
    expect(seasonCommissionPayoff(end, 3571)!.phase).toBe('preparing');
  });

  it('names the missing piece of a partial trail without claiming a completed event', () => {
    const partial = nightStudy('festival-week', 'partial');
    expect(partial.rulesVersion).toBe(CURRENT_RULES_VERSION);
    expect(partial.contracts.find(c => c.project?.id === 'lantern-night')!.project!.proof!.design.pieces).toHaveLength(3);
    const payoff = eveningCommissionPayoffs(partial, 7)[0]!;
    expect(payoff).toMatchObject({ kind: 'night', phase: 'partial', promised: 3 });
    expect(payoff.pieces).toHaveLength(2);
    expect(payoff.title).toContain('unfinished');
    expect(payoff.line).toContain('The lantern walk sign');
    expect(payoff.slots.map(s => !!s.piece)).toEqual([true, true, false]);
  });

  it('retains Careful Season’s two custom artifacts and Day 12 calendar', () => {
    const payoff = seasonCommissionPayoff(nightStudy('bespoke-rush', 'trail'))!;
    expect(payoff.calendar).toMatchObject({ careful: true, day: 11, name: 'Open studios' });
    expect(payoff.slots.map(s => s.label)).toEqual(['Open studios invitation', 'Open studios catalogue']);
    expect(payoff.promised).toBe(2);
    expect(payoff.title).toContain('invitations and a shared catalogue');
  });

  it('keeps the declined extra change explicit even while the original brief is ready before the event', () => {
    const changed = structuredClone(state);
    const night = changed.contracts.find(c => c.project?.id === 'lantern-night')!;
    const job = changed.jobs.find(j => j.contractId === night.id)!;
    job.changeDeclined = true;
    changed.events.push({ type: 'project_change_declined', jobId: job.id, minute: 3571, day: 7 });
    const payoff = seasonCommissionPayoff(changed, 3572)!;
    expect(payoff.phase).toBe('ready');
    expect(payoff.line).toContain('extra change was declined');
    expect(seasonCommissionPayoff(changed, 3840)!.phase).toBe('compromised');
  });

  it('shows actual studio-window work when the native player leaves the night unaccepted', () => {
    const at = native.commands.findIndex(c => c.type === 'acceptProject' && c.projectId === 'lantern-night');
    const before = replay(native.config, native.commands.slice(0, at) as Command[], native.rules);
    expect(before.errors).toEqual([]);
    const end = finish(before.state);
    expect(eveningCommissionPayoffs(end, 7)).toEqual([]);
    const payoff = seasonCommissionPayoff(end)!;
    expect(payoff).toMatchObject({ kind: 'window', phase: 'window', approach: null, contributors: [] });
    expect(payoff.pieces.length).toBeGreaterThan(0);
    expect(payoff.pieces.every(p => p.brief.project?.id !== 'lantern-night')).toBe(true);
  });

  it('preserves the original evening and miniature for legacy seasons', () => {
    const old = createRun(native.config, LEGACY_RULES_VERSION);
    expect(eveningCommissionPayoffs(old, 7)).toEqual([]);
    expect(seasonCommissionPayoff(old)).toBeNull();
  });
});
