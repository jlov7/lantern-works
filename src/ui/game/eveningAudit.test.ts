import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy } from '../../engine/policies';
import { CAST_BY_ID, PRESETS } from '../../engine/rules';
import { reactionTo, takeableInTurn, tonight, windowRequests } from '../../engine/selectors';
import { applyCommand, createRun, isRegular, replay } from '../../engine/sim';
import { CURRENT_RULES_VERSION, LEGACY_RULES_VERSION, STUDIO_RULES_VERSION } from '../../engine/versions';
import { eveningFacts, prepFor, regularLoss } from './eveningFacts';
import { shareSchema } from '../schema';
import ordinary from './fixtures/ordinary-order-intake.json';
import observed from '../../../test-fixtures/replays/courier-session.json' with { type: 'json' };
import type { Command } from '../../engine/types';

describe('the evening audit', () => {
  it('reports the actual served total when the observed final evening crosses a milestone', () => {
    const commands = observed.commands as Command[];
    const before = replay(observed.config, commands.slice(0, -2), LEGACY_RULES_VERSION);
    const after = replay(observed.config, commands, LEGACY_RULES_VERSION);
    expect(before.errors).toEqual([]);
    expect(after.errors).toEqual([]);
    expect(eveningFacts({ before: before.state, after: after.state }).first).toBe('51 neighbours served this season.');
  });
  it('distinguishes a regular\'s unanswered order from their accepted anniversary', () => {
    const tape = shareSchema.parse(ordinary);
    const { state, errors } = replay(tape.config, tape.commands.slice(0, 32), LEGACY_RULES_VERSION);
    expect(errors).toEqual([]);
    const news = state.requests.find(r => r.id === 'd5-n')!;
    expect(news.status).toBe('accepted');
    expect(state.requests.find(r => r.id === 'd5-r5')?.status).toBe('walked');
    expect(state.lostCast).toContain('clem');
    const text = regularLoss(state, 5);
    expect(text).toContain('You took Ten years of Clem for Clem, but left another order waiting when you opened. Clem will not return.');
    expect(text).toContain('Sam came back today and was left waiting');
    expect(text).not.toContain('Clem and Sam came back');
  });

  it.each([STUDIO_RULES_VERSION, CURRENT_RULES_VERSION])('%s audits an explicit refusal alongside a valid prep suggestion', version => {
    let s = applyCommand(createRun({ scenarioId: 'main-street', seed: 'panel-1' }, version), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
    while (!s.finished) {
      for (const n of s.news) if (n.day === s.day && n.choice === null) s = applyCommand(s, { type: 'choose', newsId: n.id, option: 0 }).state;
      const regular = windowRequests(s).find((r) => r.status === 'waiting' && isRegular(s, r.castId) && reactionTo(s, r).kind === 'buy');
      if (regular) {
        const before = applyCommand(s, { type: 'decline', requestId: regular.id }).state;
        const after = applyCommand(before, { type: 'runDay' }).state;
        const preps = prepFor(before, after, before.day);
        if (preps.length) {
          if (version === STUDIO_RULES_VERSION) {
            expect(regularLoss(after, before.day)).toContain(`${CAST_BY_ID[regular.castId]!.name} came back today and was turned away`);
            expect(regularLoss(after, before.day)).toContain('Regulars who are not served do not come back.');
          } else {
            expect(after.lostCast).not.toContain(regular.castId);
            expect(after.relationshipMemory).toContainEqual(expect.objectContaining({ castId: regular.castId, kind: 'declined-before-promise', requestId: regular.id }));
            expect(regularLoss(after, before.day) ?? '').not.toContain(`${CAST_BY_ID[regular.castId]!.name} came back today and was turned away`);
          }
          for (const p of preps) expect(applyCommand(after, p.command).error).toBeUndefined();
          expect(regularLoss(after, before.day + 1)).toBeNull();
          return;
        }
      }
      for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
      s = applyCommand(s, { type: 'runDay' }).state;
    }
    throw new Error('no lost regular with a prep suggestion');
  });

  it('compares deliveries with the no-redo morning plan only when they differ', () => {
    const season = runPolicy({ scenarioId: 'main-street', seed: 'maker-repin-miss-6' }, GHOSTS.hand);
    let differences = 0;
    let matches = 0;
    for (const [i, c] of season.commands.entries()) {
      if (c.type !== 'runDay') continue;
      const before = replay(season.config, season.commands.slice(0, i)).state;
      const after = applyCommand(before, c).state;
      const f = eveningFacts({ before, after });
      const planned = tonight(before).delivered;
      if (planned !== f.delivered) {
        differences++;
        expect(f.sentence).toContain(`The morning plan was ${planned} out if no redos or changes.`);
      } else {
        matches++;
        expect(f.sentence).not.toContain('The morning plan');
      }
    }
    expect(differences).toBeGreaterThan(0);
    expect(matches).toBeGreaterThan(0);
  });
  it('names the unfinished closing refund instead of saying nothing was missed', () => {
    let morning = createRun({ scenarioId: 'main-street', seed: 'e2e-1' });
    runPolicy(morning.config, GHOSTS.hand, { onMorning: (s) => { if (s.day === 11) morning = structuredClone(s); } }, LEGACY_RULES_VERSION);
    for (const n of morning.news) if (n.day === morning.day && n.choice === null) morning = applyCommand(morning, { type: 'choose', newsId: n.id, option: 0 }).state;
    const menu = applyCommand(morning, { type: 'setMenu', offers: [PRESETS.bespoke] });
    expect(menu.error).toBeUndefined();
    const taken = applyCommand(menu.state, { type: 'accept', requestId: 'd11-r1' });
    expect(taken.error).toBeUndefined();
    const before = taken.state;
    const after = applyCommand(before, { type: 'runDay' }).state;
    expect(after.events.filter((e) => e.day === 11 && e.type === 'refunded_horizon')).toHaveLength(1);
    expect(after.events.filter((e) => e.day === 11 && e.type === 'missed')).toHaveLength(0);
    const f = eveningFacts({ before, after });
    expect(f.sentence).toContain('You delivered 2 launches and earned 1,800 cr.');
    expect(f.sentence).toContain("When the season ended, 1 unfinished launch was refunded: Clem's was still being made at closing.");
    expect(f.sentence).not.toContain('Nothing was missed');
    expect(f.sentence).not.toContain('with a fee');
  });
});
