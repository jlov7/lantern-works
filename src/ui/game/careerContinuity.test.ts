import { describe, expect, it } from 'vitest';
import careers from '../../engine/fixtures/career-7.0.0.json';
import oldCreative from '../../engine/fixtures/legacy-6.1.0.json';
import { NEWS } from '../../engine/news';
import { contractProof, ordinaryRequestLine } from '../../engine/ordinary';
import { CAST, CAST_BY_ID, PRESETS } from '../../engine/rules';
import { applyCommand, createRun, newsOptions, replay } from '../../engine/sim';
import type { CareerStage, Command, CompanyState, NewsCardId, Request, RunConfig } from '../../engine/types';
import { CREATIVE_PROMISE_RULES_VERSION } from '../../engine/versions';
import { laterRequestCopy, newsPresentation } from './careerContinuity';
import { briefFor, portfolioAt, workFor } from './portfolio';
import { gazette, midweek } from '../screens/gazette';
import { dayEvents } from '../screens/season';
import { momentOf } from './eveningFacts';

const seasons = careers.routes.find(r => r.id === 'prosperous')!.seasons;
function context(stage: CareerStage): CompanyState {
  return createRun(seasons.find(s => s.stage === stage)!.config as RunConfig);
}
const newsStates = new Map<string, CompanyState>();
function pendingNews(stage: CareerStage, card: NewsCardId): CompanyState {
  const key = `${stage}/${card}`;
  const cached = newsStates.get(key);
  if (cached) return cached;
  const tape = seasons.find(s => s.stage === stage)!;
  let state = createRun(tape.config as RunConfig);
  for (const command of tape.commands as Command[]) {
    const news = state.news.find(n => n.card === card && n.day === state.day && n.choice === null);
    if (news) { newsStates.set(key, state); return state; }
    const result = applyCommand(state, command);
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  throw new Error(`The native ${stage} tape has no pending ${card}.`);
}
const request = (castId: string, lineIndex = 0): Request => ({ id: 'continuing-request', day: 0, index: 0, castId, segment: CAST_BY_ID[castId]!.segment, need: 'nuanced', wtpPercent: 100, lineIndex, status: 'waiting', source: 'walkin' });

describe('continuing career news presentation', () => {
  it('keeps the practice incident consistent through delivery, newspaper and ending', () => {
    let state = context('practice');
    const moments: string[] = [];
    const editions: string[] = [];
    for (let turn = 0; turn < 40 && !state.finished; turn++) {
      const news = state.news.find(item => item.day === state.day && item.choice === null);
      const request = state.requests.find(item => item.status === 'waiting' && item.source === 'news' && item.offer?.name === 'Tap takeover rescue');
      const command: Command = news ? { type: 'choose', newsId: news.id, option: news.card === 'oscarRescue' ? 1 : 0 }
        : request ? { type: 'accept', requestId: request.id } : { type: 'runDay' };
      const before = state;
      const next = applyCommand(state, command);
      expect(next.error).toBeUndefined();
      state = next.state;
      if (command.type === 'runDay') {
        const line = momentOf(before, state, before.day, state.events.filter(event => event.day === before.day && event.type === 'delivered').length);
        if (line) moments.push(line);
      }
      if (state.day === 6) editions.push(JSON.stringify(midweek(state, null)));
    }
    expect(state.finished).toBe(true);
    const oscar = state.contracts.find(contract => contract.offer.name === 'Tap takeover rescue')!;
    expect(oscar.jobIds.every(id => state.jobs.find(job => job.id === id)?.status === 'delivered')).toBe(true);
    const paper = JSON.stringify(gazette(state, null));
    expect(paper).toContain('updated tap takeover announcement');
    expect(editions.some(edition => edition.includes('updated tap takeover announcement'))).toBe(true);
    expect([...moments, ...editions, paper].join(' ')).not.toMatch(/wrong list|whose launch saved it|second opening sold out|printers broke down|better kettle/);
    for (const news of state.news.filter(item => item.choice !== null)) expect(dayEvents(state)[news.day]).toBe(`News: ${newsPresentation(state, news).title}`);
    expect(dayEvents(state).join(' ')).not.toContain('Bright Lantern dropped Oscar');
  });

  it.each(['practice', 'legacy', 'open'] as const)('retains the current %s incident titles in the finished career', stage => {
    const tape = seasons.find(season => season.stage === stage)!;
    const result = replay(tape.config as RunConfig, tape.commands as Command[], careers.rules);
    expect(result.errors).toEqual([]);
    for (const news of result.state.news.filter(item => item.choice !== null)) expect(dayEvents(result.state)[news.day]).toBe(`News: ${newsPresentation(result.state, news).title}`);
    expect(dayEvents(result.state).join(' ')).not.toContain('Bright Lantern dropped Oscar');
  });

  it.each(['oscarRescue', 'poach', 'blackout', 'lastOffer'] as const)('%s has separate later incidents without inventing a past choice', card => {
    const copies = (['practice', 'legacy', 'open'] as const).map(stage => {
      const state = pendingNews(stage, card);
      const news = state.news.find(n => n.card === card && n.day === state.day)!;
      const before = structuredClone(state);
      const native = newsOptions(state, news);
      const copy = newsPresentation(state, news);
      expect(copy.options).toHaveLength(native.length);
      expect(copy.options.map(o => o.detail)).toEqual(native.map(o => o.detail));
      expect(copy.text).not.toMatch(/wrong mailing list|broke down overnight|has offered Ada a job|last time|you helped|you let|again/i);
      if (card === 'oscarRescue') expect(copy.text).toContain('one launch within two days, 900 credits');
      if (card === 'poach') expect(copy.options[0]!.label).toBe('Let Ada take the guest work');
      if (card === 'lastOffer') {
        expect(copy.text).toContain('1,500 credits');
        expect(copy.text).toMatch(/today/);
        expect(copy.options[0]!.label).toBe('Keep this season’s list');
        expect(copy.options[1]!.label).toBe('Sell the list (+1,500)');
        expect(native[1]!.effects).toEqual([{ k: 'cost', amount: -1500, note: 'Customer list sold to Bright Lantern' }, { k: 'handover' }]);
      }
      expect(state).toEqual(before);
      expect(newsOptions(state, news)).toEqual(native);
      return copy;
    });
    expect(new Set(copies.map(c => c.title)).size).toBe(3);
    expect(new Set(copies.map(c => c.text)).size).toBe(3);
  });
  it('presents the rival’s price campaign without announcing another shop opening', () => {
    const state = context('practice');
    const news = { id: 'rival-copy', day: 3, card: 'rival' as const, choice: null };
    const copy = newsPresentation(state, news);
    expect(copy.title).toBe('The printer two doors down is cutting prices');
    expect(copy.text).not.toMatch(/opened|opening|first/i);
    expect(copy.text).toContain('next three days');
    expect(copy.options[0]!.detail).toBe('Small shops will pay 15% less for three days.');
  });
  it('keeps all opening and original-rule news text and option labels exact', () => {
    const oldConfig = oldCreative.tapes.find(t => t.id === 'generated/6.1-prepared-and-taught-pattern')!.config as RunConfig;
    for (const state of [context('opening'), createRun(oldConfig, CREATIVE_PROMISE_RULES_VERSION), createRun({ scenarioId: 'main-street', seed: 'old-copy' }, 'lantern-6.0.0')]) for (const card of Object.keys(NEWS) as NewsCardId[]) {
      const news = { id: 'copy-check', day: 5, card, choice: null, castId: 'eli' };
      const ctx = { s: state, day: news.day, castId: 'eli', castName: 'Eli' };
      expect(newsPresentation(state, news)).toEqual({ title: NEWS[card].title(ctx), text: NEWS[card].text(ctx), options: newsOptions(state, news).map(({ label, detail }) => ({ label, detail })) });
    }
  });
  it('uses the same later Oscar incident in the news, ticket copy, work and delivered portfolio', () => {
    for (const stage of ['practice', 'legacy', 'open'] as const) {
      let state = pendingNews(stage, 'oscarRescue');
      const news = state.news.find(n => n.card === 'oscarRescue' && n.day === state.day)!;
      const shown = newsPresentation(state, news);
      const result = applyCommand(state, { type: 'choose', newsId: news.id, option: 1 });
      expect(result.error).toBeUndefined();
      state = result.state;
      const order = state.requests.find(r => r.source === 'news' && r.day === news.day && r.castId === 'oscar')!;
      const original = structuredClone(order);
      const copy = laterRequestCopy(state, order, order.offer)!;
      expect(copy.request).toBe(shown.text);
      expect(briefFor(order, order.offer, state.config, undefined, state.rulesVersion)).toMatchObject({ headline: copy.headline, detail: copy.detail, request: shown.text });
      const taken = applyCommand(state, { type: 'accept', requestId: order.id });
      expect(taken.error).toBeUndefined();
      state = taken.state;
      const job = state.jobs.find(j => j.contractId === state.contracts.at(-1)!.id)!;
      expect(workFor(state, [job.id], state.minute)[0]!.brief).toMatchObject({ headline: copy.headline, detail: copy.detail, request: shown.text });
      for (let day = 0; day < 3 && !state.finished && state.jobs.find(j => j.id === job.id)!.status === 'active'; day++) state = applyCommand(state, { type: 'runDay' }).state;
      const piece = portfolioAt(state).find(p => p.jobId === job.id);
      if (piece) expect(piece.brief).toMatchObject({ headline: copy.headline, detail: copy.detail, request: shown.text });
      expect(original.offer).toMatchObject({ name: 'Tap takeover rescue', price: 900, turnaroundDays: 2 });
    }
  });
});

describe('ordinary requests after one-time milestones', () => {
  const cases = [['sam', 1], ['ravi', 0], ['ravi', 1], ['ravi', 2], ['oscar', 0], ['oscar', 1], ['oscar', 2], ['florence', 1], ['idris', 1], ['idris', 2], ['gus', 1], ['finn', 2], ['lorna', 0], ['agnes', 1], ['tobias', 2], ['malik', 2]] as const;
  it.each(cases)('%s line %i shares its recurring description with work and portfolio', (castId, index) => {
    const order = request(castId, index);
    for (const stage of ['practice', 'legacy', 'open'] as const) {
      const state = context(stage);
      const copy = laterRequestCopy(state, order)!;
      expect(copy).not.toBeNull();
      expect(copy.headline + copy.detail + copy.request).not.toMatch(/grand opening|two years|first festival|first competition|hundredth|fifty years|first violin|now restore|keys now|repair old books now|next chapter begins/i);
      const preview = briefFor(order, PRESETS.bespoke, state.config, undefined, state.rulesVersion);
      expect(preview).toMatchObject(copy);
      const withOrder = { ...state, lostCast: [], requests: [order], menu: [{ ...PRESETS.bespoke, price: 100, turnaroundDays: 1 }] };
      const accepted = applyCommand(withOrder, { type: 'accept', requestId: order.id });
      expect(accepted.error).toBeUndefined();
      const job = accepted.state.jobs.at(-1)!;
      expect(workFor(accepted.state, [job.id], accepted.state.minute)[0]!.brief).toMatchObject(copy);
    }
  });
  it('leaves original cast lines, unaffected current requests, fixed briefs and approved artwork exact', () => {
    for (const cast of CAST) for (const [lineIndex, line] of cast.lines.entries()) {
      const order = request(cast.id, lineIndex);
      expect(laterRequestCopy(context('opening'), order)).toBeNull();
      const old = createRun({ scenarioId: 'main-street', seed: 'old-ordinary' }, CREATIVE_PROMISE_RULES_VERSION);
      expect(laterRequestCopy(old, order)).toBeNull();
      expect(briefFor(order, PRESETS.bespoke, old.config, undefined, old.rulesVersion).request).toBe(line);
    }
    const tape = seasons.find(s => s.stage === 'practice')!;
    const state = replay(tape.config as RunConfig, tape.commands as Command[]).state;
    const before = structuredClone(state);
    for (const piece of portfolioAt(state)) {
      const contract = state.contracts.find(c => c.id === piece.contractId)!;
      const proof = contractProof(contract);
      if (proof) expect(piece.brief.proof).toBe(proof);
      const order = state.requests.find(r => r.id === piece.requestId)!;
      if (order.briefId) expect(piece.brief.request).toBe(ordinaryRequestLine(order));
    }
    expect(state).toEqual(before);
    expect(laterRequestCopy(context('practice'), request('ines'))).toBeNull();
  });
});
