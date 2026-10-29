import { describe, expect, it } from 'vitest';
import observed from '../../../test-fixtures/replays/early-workboard.json';
import { PRESETS, RULES } from '../../engine/rules';
import { LEGACY_RULES_VERSION } from '../../engine/versions';
import { applyCommand, createRun, replay, simulateDay } from '../../engine/sim';
import type { Command, CompanyState } from '../../engine/types';
import { bookingLine } from './booking';
import { plannedWork } from './plannedWork';

const run = observed[0]!;
const commands = run.commands as Command[];

describe('work quoted on the observed consecutive mornings', () => {
  it.each([[1, 248], [3, 194], [4, 172], [7, 214], [8, 190]])('prefix %i uses the public schedule human minutes', (prefix, minutes) => {
    const before = replay(run.config, commands.slice(0, prefix), LEGACY_RULES_VERSION);
    expect(before.errors).toEqual([]);
    const command = commands[prefix]!;
    expect(command.type).toBe('accept');
    if (command.type !== 'accept') throw new Error('Expected the retained acceptance');
    const original = structuredClone(before.state);
    expect(plannedWork(before.state, command.requestId, command.counter, command.maker)?.first).toBe(minutes);
    expect(before.state).toEqual(original);
  });
});

function booking(spacingDays = 0): CompanyState {
  const s = createRun({ scenarioId: 'main-street', seed: 'planned-order' });
  s.kit.status = 'ready';
  s.requests = [{ ...s.requests[0]!, id: 'planned', need: 'simple', source: 'booking', offer: { ...PRESETS.launchlet, launches: 3, spacingDays, startsInDays: 1, turnaroundDays: 3, price: 1200 } }];
  return s;
}

// Independent native witness: in this fixture the order is the only work and the kit is ready.
function nativeDays(s: CompanyState) {
  const taken = applyCommand(s, { type: 'accept', requestId: 'planned' });
  expect(taken.error).toBeUndefined();
  const t = taken.state;
  for (const j of t.jobs) j.reworkFlag = false;
  const days = [];
  for (let n = t.day; n < RULES.days && !t.finished; n++) {
    const day = t.day;
    const busy = () => t.resources.filter(r => r.kind === 'human').reduce((sum, r) => sum + r.busyMinutes, 0);
    const before = busy();
    simulateDay(t, { forecast: true });
    days.push({ day, minutes: busy() - before });
    if (t.jobs.every(j => j.status !== 'active' && j.status !== 'scheduled')) break;
  }
  return { days, state: t };
}

describe('the whole conditional order', () => {
  it.each(['human', 'ai', 'junior'] as const)('counts native human clock time across release days with %s staffing', staffing => {
    let s = booking(2);
    if (staffing === 'ai') s = applyCommand(s, { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } }).state;
    if (staffing === 'junior') s.resources.push({ ...s.resources[0]!, id: 'junior', name: 'Noor', role: 'junior', speedPercent: 150 });
    s = applyCommand(s, { type: 'overtime' }).state;
    const original = structuredClone(s);
    const plan = plannedWork(s, 'planned')!;
    const native = nativeDays(s);
    expect(native.state.jobs.every(j => j.status === 'delivered')).toBe(true);
    expect(plan.days.map(({ day, minutes }) => ({ day, minutes }))).toEqual(native.days);
    expect(plan.total).toBe(native.days.reduce((sum, d) => sum + d.minutes, 0));
    expect(plan.days[0]!.minutes).toBe(0);
    expect(plan.total).not.toBe(plan.first! * plan.launches);
    expect(s).toEqual(original);
  });

  it('separates tomorrow from a multi-day booking total', () => {
    const s = booking();
    s.requests[0]!.offer!.style = 'custom';
    const plan = plannedWork(s, 'planned')!;
    expect(plan.total).toBeGreaterThan(plan.days[1]!.minutes);
    expect(plan.days.map(({ day, minutes }) => ({ day, minutes }))).toEqual(nativeDays(s).days);
    expect(bookingLine(s, s.requests[0]!)).toContain('in total. Tomorrow:');
  });

  it('keeps kit setup separate from the first launch', () => {
    const s = replay(run.config, commands.slice(0, 1), LEGACY_RULES_VERSION).state;
    const plan = plannedWork(s, 'd0-r0')!;
    expect(plan.first).toBe(248);
    expect(plan.days[0]!.kit).toBe(RULES.effort.kitSetup);
    expect(plan.total).toBe(plan.first);
  });

  it('projects the actual named maker, and rejects an invalid take without substituting a default', () => {
    const s = booking();
    Object.assign(s.requests[0]!, { need: 'nuanced', offer: { ...PRESETS.bespoke, price: 900 } });
    const ada = plannedWork(s, 'planned', false, 'h1')!;
    const tomas = plannedWork(s, 'planned', false, 'h2')!;
    expect(ada.first).toBeGreaterThan(tomas.first!);
    expect(plannedWork(s, 'missing')).toBeNull();
    expect(plannedWork(s, 'planned', false, 'missing')).toBeNull();
  });

  it('does not present partial work or a closing refund as a complete quote', () => {
    const s = booking();
    s.requests[0]!.offer!.startsInDays = RULES.days;
    const plan = plannedWork(s, 'planned')!;
    expect(plan.first).toBeNull();
    expect(plan.total).toBeNull();
    expect(bookingLine(s, s.requests[0]!)).toContain('Some work remains unfinished');
  });

  it('ignores hidden redo flags, including work already accepted', () => {
    const s = replay(run.config, commands.slice(0, 7), LEGACY_RULES_VERSION).state;
    const plan = plannedWork(s, 'd1-r2');
    for (const j of s.jobs) j.reworkFlag = !j.reworkFlag;
    expect(plannedWork(s, 'd1-r2')).toEqual(plan);
  });

  it('uses the counter-offer command and leaves an unauthorised ordinary take invalid', () => {
    const s = replay(run.config, commands.slice(0, 10), LEGACY_RULES_VERSION).state;
    expect(plannedWork(s, 'd1-r3')).toBeNull();
    expect(plannedWork(s, 'd1-r3', true)).not.toBeNull();
  });

  it('does not quote a full workload for a launch that misses tonight', () => {
    const s = booking();
    Object.assign(s.requests[0]!, { need: 'nuanced', offer: { ...PRESETS.bespoke, turnaroundDays: 1 } });
    const plan = plannedWork(s, 'planned', false, 'h1')!;
    expect(plan.first).toBeNull();
    expect(plan.total).toBeNull();
    expect(plan.days[0]!.minutes).toBeGreaterThan(0);
  });
});
