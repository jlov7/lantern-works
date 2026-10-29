import { describe, expect, it } from 'vitest';
import route from './fixtures/main-courtyard-5.0.0.json';
import { commandSchema, configSchema, shareSchema } from '../ui/schema';
import { buildContinuation, deliveredPieces, validateContinuation } from './continuation';
import { projectBlocked, projectBrief, projectFor, projectQuote, projectRecords } from './projects';
import { applyCommand, arrivalsFor, createRun, isRegular, replay, shopCostOn, simulateDay } from './sim';
import { specializationOn } from './mentoring';
import { medalFor, medalParFor, summarize } from './selectors';
import { epilogues, projectOutcome } from './endings';
import { PRESETS, RULES } from './rules';
import type { Command, CompanyState } from './types';

function nativeSeason(): CompanyState {
  let s = createRun(route.config);
  for (const original of route.commands as Command[]) {
    const command = original.type === 'acceptProject' ? { ...original, design: projectBrief(s, original.projectId, original.approach).defaultDesign } : original;
    const result = applyCommand(s, command);
    expect(result.error, JSON.stringify(command)).toBeUndefined();
    s = result.state;
  }
  expect(s.finished).toBe(true);
  return s;
}

describe('a bounded continuing studio', () => {
  it('carries accumulated rent into billing and adds each later review once', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'rent-carry' });
    for (let season = 1; season <= 3; season++) {
      expect(shopCostOn(s, 0)).toBe(RULES.shopDailyCost + (season - 1) * RULES.rentRise);
      while (!s.finished) {
        const before = shopCostOn(s, s.day);
        simulateDay(s, { forecast: true });
        expect(s.journal.filter(e => e.kind === 'shop').at(-1)!.cash).toBe(-before);
      }
      expect(s.modifiers.reduce((n, m) => n + (m.kind === 'rent' ? m.extra : 0), 0)).toBe(season * RULES.rentRise);
      if (season < 3) s = createRun(buildContinuation(s, [], `rent-${season + 1}`));
    }
  });

  it('uses continuing identities in the ending and excludes fresh-start medal thresholds', () => {
    let s = createRun(buildContinuation(nativeSeason(), [], 'ivo-outcome'));
    const step = (command: Command) => {
      const result = applyCommand(s, command);
      expect(result.error, JSON.stringify(command)).toBeUndefined();
      s = result.state;
    };
    step({ type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 300 }] });
    while (!s.finished) {
      if (s.call) { step({ type: 'answer', option: 'ride' }); continue; }
      for (const n of s.news.filter(n => n.choice === null)) step({ type: 'choose', newsId: n.id, option: 0 });
      for (const r of s.requests.filter(r => r.day === s.day && r.status === 'waiting')) step({ type: r.castId === 'ivo' ? 'accept' : 'decline', requestId: r.id });
      if (!projectBlocked(s, 'hugo-handover', 'quiet-sendoff')) step({ type: 'acceptProject', projectId: 'hugo-handover', approach: 'quiet-sendoff', design: projectBrief(s, 'hugo-handover', 'quiet-sendoff').defaultDesign });
      step({ type: 'runDay' });
    }
    const record = projectRecords(s).find(p => p.contract.castId === 'ivo')!;
    expect(record.status).toBe('delivered');
    expect(projectOutcome(record, s)).toContain('Ivo’s own name');
    expect(epilogues(s).find(e => e.castId === 'ivo')!.line).not.toMatch(/Hugo|portrait/);
    expect(medalParFor(s)).toBeUndefined();
    expect(medalFor(s)).toMatchObject({ medal: null, reason: expect.stringContaining('fresh start') });
  });
  it('replays an independent serialized second season with closing capital and no parent tape', () => {
    let parent: CompanyState | null = nativeSeason();
    const piece = deliveredPieces(parent)[0]!;
    const cash = parent.cash;
    const config = JSON.parse(JSON.stringify(buildContinuation(parent, [piece.id], 'next-season')));
    expect(configSchema.safeParse(config).success).toBe(true);
    parent = null;
    const start = createRun(config);
    expect(start.cash).toBe(cash);
    expect(start.revenue).toBe(0);
    expect(start.unearned).toBe(0);
    expect(start.journal).toEqual([expect.objectContaining({ kind: 'capital', cash, revenue: 0, unearned: 0 })]);
    config.continuation.pieces[0].design.palette = 'poppy';
    expect(start.config.continuation!.pieces[0]!.design.palette).toBe(piece.design.palette);
    let s = applyCommand(start, { type: 'preparePattern', sourceId: start.config.continuation!.pieces[0]!.id }).state;
    s = applyCommand(s, { type: 'hire' }).state;
    s = applyCommand(s, { type: 'runDay' }).state;
    const patternId = s.patterns![0]!.id;
    const noorId = s.resources.find(r => r.role === 'junior')!.id;
    const taught = applyCommand(s, { type: 'teachPattern', patternId, resourceId: noorId });
    expect(taught.error).toBeUndefined();
    s = taught.state;
    while (!s.finished) s = applyCommand(s, { type: 'runDay' }).state;
    const share = JSON.parse(JSON.stringify({ v: 1, rules: s.rulesVersion, config: start.config, commands: s.commands }));
    expect(shareSchema.safeParse(share).success).toBe(true);
    expect(replay(share.config, share.commands, share.rules)).toEqual({ state: s, errors: [] });
    expect(s.cash).toBe(cash + s.journal.filter(e => e.kind !== 'capital').reduce((n, e) => n + e.cash, 0));
    expect(summarize(s).revenue).toBe(0);
    expect(JSON.stringify(share)).not.toContain('parentId');
  });

  it('preserves negative capital, every relationship, lost regulars and real amends', () => {
    const parent = nativeSeason();
    parent.cash = -250;
    parent.lostCast = ['clem'];
    parent.relationshipMemory!.push({ castId: 'clem', day: 11, minute: 5760, kind: 'promise-missed' });
    let s = createRun(buildContinuation(parent, []));
    expect(s.cash).toBe(-250);
    expect(isRegular(s, 'clem')).toBe(true);
    expect(s.lostCast).toContain('clem');
    expect(s.config.continuation!.relationships.find(r => r.castId === 'clem')).toMatchObject({ regular: true, lost: true, lastResolution: 'promise-missed', milestone: { approach: 'first-night', outcome: 'delivered' } });
    expect(projectRecords(s)).toEqual([]);
    expect(projectBlocked(s, 'lantern-night', 'courtyard')).toContain('Opens');
    s = applyCommand(s, { type: 'runDay' }).state;
    const amends = s.requests.find(r => r.castId === 'clem' && r.source === 'amends')!;
    expect(amends).toBeDefined();
    s = applyCommand(s, { type: 'accept', requestId: amends.id }).state;
    simulateDay(s, { forecast: true });
    simulateDay(s, { forecast: true });
    expect(s.lostCast).not.toContain('clem');
    expect(s.relationshipMemory!.some(r => r.castId === 'clem' && r.kind === 'amends-kept')).toBe(true);
  });

  it('carries only selected delivered pages even from a partially failed project', () => {
    const s = nativeSeason();
    const p = s.contracts.find(c => c.project?.id === 'clem-ten')!;
    const delivered = s.jobs.find(j => j.contractId === p.id)!;
    // A settled second launch failed; the delivered first page remains a truthful source.
    p.jobIds.push('failed-page');
    s.jobs.push({ ...delivered, id: 'failed-page', launchIndex: 1, status: 'missed', deliveredAt: null });
    const snapshot = buildContinuation(s, [delivered.id]).continuation!;
    expect(snapshot.pieces).toHaveLength(1);
    expect(snapshot.relationships.find(r => r.castId === 'clem')!.milestone!.outcome).toBe('partial');
    expect(() => buildContinuation(s, ['failed-page'])).toThrow('not delivered');
    expect(() => buildContinuation(s, [delivered.id, delivered.id])).toThrow('distinct');
  });

  it('refuses unfinished or unsettled state and malformed snapshots at replay/load boundaries', () => {
    expect(() => buildContinuation(createRun(route.config), [])).toThrow('Finish and settle');
    const parent = nativeSeason();
    parent.unearned = 1;
    expect(() => buildContinuation(parent, [])).toThrow('Finish and settle');
    parent.unearned = 0;
    const config = buildContinuation(parent, []);
    const snapshot = config.continuation!;
    expect(() => validateContinuation({ ...snapshot, cash: Number.NaN })).toThrow('malformed');
    expect(() => createRun({ ...config, continuation: { ...snapshot, relationships: [] } })).toThrow('every neighbour');
    expect(() => createRun(config, 'lantern-5.0.0')).toThrow('require authored');
    expect(commandSchema.safeParse({ type: 'preparePattern', sourceId: 'x', free: true }).success).toBe(false);
  });

  it('inherits employed Noor and completed specialization without fabricated training events', () => {
    const parent = nativeSeason();
    parent.resources.push({ id: 'j7', name: 'Noor', kind: 'human', role: 'junior', fromDay: 1, toDay: null, dailyCost: 160, speedPercent: 150, busyWith: null, retired: false, busyMinutes: 0, shiftMinutes: 0, mentorship: { kind: 'templates', mentorId: 'h2', day: 2, completedAt: 1080 } });
    let s = createRun(buildContinuation(parent, []));
    const noor = s.resources.find(r => r.id === 'j7')!;
    expect(specializationOn(noor, 0)).toBe('templates');
    expect(noor.mentorship).toBeUndefined();
    expect(s.events.some(e => e.type === 'mentoring_done')).toBe(false);
    s = applyCommand(s, { type: 'letGo', resourceId: noor.id }).state;
    s = applyCommand(s, { type: 'runDay' }).state;
    s = applyCommand(s, { type: 'runDay' }).state;
    s = applyCommand(s, { type: 'hire' }).state;
    expect(s.resources.at(-1)!.id).toBe('j8');
  });

  it('gives returning neighbours new binding copy, work, prices and Ivo his own identity', () => {
    const parent = nativeSeason();
    parent.lostCast = [];
    const config = buildContinuation(parent, []);
    const s = createRun(config);
    expect(projectFor(s, 'hugo-handover').castId).toBe('ivo');
    expect(projectBrief(s, 'clem-ten', 'new-band').pieces[0]!.copy.some(c => c.text.includes('Thursday'))).toBe(true);
    expect(projectBrief(s, 'mara-regular', 'weekly-rhythm').pieces[0]!.copy[0]!.text).toBe('Today’s bread');
    const ivo = projectBrief(s, 'hugo-handover', 'quiet-sendoff');
    expect(ivo.pieces[0]!.kind).toBe('sign');
    expect(ivo.pieces[0]!.copy[0]!.text).toBe('IVO WATCH WORKSHOP');
    s.requests = [];
    while (s.day < 2) simulateDay(s, { forecast: true });
    const quote = projectQuote(s, 'clem-ten', 'new-band');
    expect(quote?.offer.price).toBe(1400);
    expect(quote?.project.materials).toBe(180);
    expect(quote?.profiles[0]!.finish).toBe(90);
    expect(projectQuote(s, 'hugo-handover', 'quiet-sendoff')).toBeNull();
    expect(projectBlocked(s, 'hugo-handover', 'quiet-sendoff')).toContain('Ivo');
    expect(arrivalsFor(s, 2).some(r => r.castId === 'ivo')).toBe(true);
  });
});
