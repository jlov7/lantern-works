// Rules v3: street news, reputation, staff levers, upgrades, flyers, honest "served", repeat visits and amends.
import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy } from './policies';
import { NEWS } from './news';
import { PRESETS, RULES, SCENARIOS } from './rules';
import { LEGACY_RULES_VERSION } from './versions';
import { fits, forecast, juniorPayoff, reactionTo, summarize, windowRequests } from './selectors';
import { counterOffer, react } from './demand';
import { AMENDS_OFFER, applyCommand, createRun, newsOptions, paceOn, reactionFor, replay, repLevel, workingOn, wtpShift } from './sim';
import type { Command, CompanyState, News, NewsCardId, Request } from './types';

const CFG = { scenarioId: 'main-street', seed: 'v3-1' };
const DAY = RULES.minutesPerDay;

function apply(s: CompanyState, cmd: Command): CompanyState {
  const r = applyCommand(s, cmd);
  if (r.error) throw new Error(r.error);
  return r.state;
}

function buyer(day: number, over: Partial<Request> = {}): Request {
  return { id: `b${day}-${over.castId ?? 'eli'}`, day, index: 0, castId: 'eli', segment: 'moment', need: 'simple', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin', ...over };
}

/** A clean run with no tape arrivals, so assertions don't depend on the draw. */
function blank(): CompanyState {
  const s = createRun(CFG);
  s.requests = [];
  s.news = [];
  return s;
}

function withNews(card: NewsCardId, castId?: string): CompanyState {
  const s = blank();
  const n: News = { id: 'n0', day: 0, card, choice: null, ...(castId ? { castId } : {}) };
  s.news.push(n);
  return s;
}

const cashIdentity = (s: CompanyState) => expect(s.cash).toBe(RULES.initialCash + s.journal.reduce((a, e) => a + e.cash, 0));

describe('street news', () => {
  it('every street draws news on several mornings, never the same card twice, and only from its own deck', () => {
    for (const sc of SCENARIOS) {
      for (const seed of ['1', '2', '3', '4']) {
        const s = runPolicy({ scenarioId: sc.id, seed }, GHOSTS.old);
        expect(s.news.length).toBeGreaterThanOrEqual(3);
        expect(new Set(s.news.map((n) => n.card)).size).toBe(s.news.length);
        for (const n of s.news) if (!NEWS[n.card].story) expect(sc.news[n.card]).toBeGreaterThan(0);
        for (const n of s.news) expect(n.choice).not.toBeNull();
      }
    }
  });

  it('opening without answering applies option 0, which never costs money', () => {
    for (const card of Object.keys(SCENARIOS[0]!.news) as NewsCardId[]) {
      const s = withNews(card, 'eli');
      const opts = newsOptions(s, s.news[0]!);
      expect(opts[0]!.effects.some((e) => e.k === 'cost' || e.k === 'loan' || e.k === 'temp')).toBe(false);
    }
  });

  it('a temp covers a sick day and is paid once, when booked', () => {
    let s = withNews('ill');
    s.menu = [PRESETS.bespoke];
    s = apply(s, { type: 'choose', newsId: 'n0', option: 1 });
    expect(workingOn(s, 0).map((r) => r.id).sort()).toEqual(['h1', 't0']);
    expect(s.journal.filter((e) => e.note.startsWith('Temp')).map((e) => e.cash)).toEqual([-RULES.staff.temp.cost]);
    s = apply(s, { type: 'runDay' });
    expect(s.journal.filter((e) => e.kind === 'wages' && e.day === 0).reduce((a, e) => a + e.cash, 0)).toBe(-(2 * RULES.humanDailyCost + RULES.staff.temp.cost));
    expect(workingOn(s, 1).map((r) => r.id).sort()).toEqual(['h1', 'h2']);
    cashIdentity(s);
  });

  it('a decided card cannot be decided again, and choices are only for today', () => {
    let s = withNews('rival');
    s = apply(s, { type: 'choose', newsId: 'n0', option: 1 });
    expect(applyCommand(s, { type: 'choose', newsId: 'n0', option: 0 }).error).toBeTruthy();
    s = apply(s, { type: 'runDay' });
    expect(applyCommand(s, { type: 'choose', newsId: 'n0', option: 0 }).error).toBeTruthy();
  });

  it('the rival lowers what small shops will pay for exactly three days, starting tomorrow', () => {
    let s = withNews('rival');
    s = apply(s, { type: 'choose', newsId: 'n0', option: 0 });
    const m = s.modifiers.find((x) => x.kind === 'wtp')!;
    expect(m).toMatchObject({ segment: 'small', percent: -15, fromDay: 1, toDay: 3 });
  });

  it("a regular's story beat appears once what you did for them makes it true", () => {
    const s = runPolicy({ scenarioId: 'main-street', seed: '2' }, { ...GHOSTS.bright, menu: [PRESETS.bespoke, PRESETS.launchlet] });
    const stories = s.news.filter((n) => NEWS[n.card].story);
    for (const n of stories) expect(['maraGrows', 'eliExtended', 'hugoRetires', 'clemTen', 'oscarRescue', 'streetParty', 'crossroads', 'poach', 'blackout', 'lastOffer']).toContain(n.card);
    const seeds = ['1', '2', '3', '4', '5', '6'].map((seed) => runPolicy({ scenarioId: 'main-street', seed }, { ...GHOSTS.bright, news: 'sensible' }));
    expect(seeds.some((x) => x.news.some((n) => NEWS[n.card].story))).toBe(true);
  });

  it('a bulk order arrives as a fixed-price ticket at the window', () => {
    let s = withNews('bulk');
    s = apply(s, { type: 'choose', newsId: 'n0', option: 1 });
    const req = s.requests.find((r) => r.source === 'news')!;
    expect(req.offer?.price).toBe(1600);
    s = apply(s, { type: 'accept', requestId: req.id });
    expect(s.contracts[0]!.offer.launches).toBe(4);
    expect(s.cash).toBe(RULES.initialCash + 1600);
  });

  it('a loan is cash, never revenue, and is repaid with interest on the last morning', () => {
    let s = withNews('loan');
    s.cash = 500;
    s = apply(s, { type: 'choose', newsId: 'n0', option: 1 });
    expect(s.cash).toBe(2500);
    expect(s.revenue).toBe(0);
    while (!s.finished) s = apply(s, { type: 'runDay' });
    expect(s.journal.filter((e) => e.kind === 'loan').map((e) => e.cash)).toEqual([2000, -2000]);
    expect(s.journal.filter((e) => e.kind === 'interest').map((e) => e.cash)).toEqual([-300]);
    expect(summarize(s).other).toBeGreaterThanOrEqual(300);
  });
});

describe('studio levers', () => {
  it('a junior starts tomorrow, briefs and finishes slower, never makes, and costs a junior wage', () => {
    let s = blank();
    s.menu = [PRESETS.bespoke];
    s = apply(s, { type: 'hire' });
    expect(workingOn(s, 0).length).toBe(2);
    expect(workingOn(s, 1).length).toBe(3);
    expect(applyCommand(s, { type: 'hire' }).error).toBeTruthy();
    s = apply(s, { type: 'runDay' });
    s.requests.push(buyer(1, { need: 'nuanced' }));
    s = apply(s, { type: 'accept', requestId: 'b1-eli' });
    s = apply(s, { type: 'runDay' });
    expect(s.journal.filter((e) => e.kind === 'wages' && e.day === 1).reduce((a, e) => a + e.cash, 0)).toBe(-(2 * RULES.humanDailyCost + RULES.staff.junior.dailyCost));
    const juniorTasks = s.events.filter((e) => e.resourceId === 'j1' && e.type === 'task_start');
    expect(juniorTasks.every((e) => e.stage !== 'produce' && e.stage !== 'kit')).toBe(true);
  });

  it('letting a junior go keeps them today and stops wages from tomorrow', () => {
    let s = blank();
    s = apply(s, { type: 'hire' });
    s = apply(s, { type: 'runDay' });
    s = apply(s, { type: 'letGo', resourceId: 'j1' });
    expect(workingOn(s, 1).some((r) => r.id === 'j1')).toBe(true);
    expect(workingOn(s, 2).some((r) => r.id === 'j1')).toBe(false);
  });

  it('overtime keeps people until 5pm, costs per person, and cannot run two days in a row', () => {
    let s = blank();
    s.menu = [PRESETS.bespoke];
    s.requests.push(buyer(0, { need: 'nuanced' }));
    s = apply(s, { type: 'accept', requestId: 'b0-eli' });
    s = apply(s, { type: 'overtime' });
    s = apply(s, { type: 'runDay' });
    expect(s.journal.filter((e) => e.note.startsWith('Overtime')).map((e) => e.cash)).toEqual([-2 * RULES.staff.overtimePerPerson]);
    const lateWork = s.events.some((e) => e.resourceId?.startsWith('h') && e.minute > RULES.humanShift && e.minute < DAY && e.type === 'task_done');
    expect(lateWork).toBe(true);
    expect(applyCommand(s, { type: 'overtime' }).error).toMatch(/two days/);
  });

  it('upgrades are bought once and change the effort or rework rules they describe', () => {
    let s = blank();
    s = apply(s, { type: 'buy', item: 'library' });
    expect(applyCommand(s, { type: 'buy', item: 'library' }).error).toBeTruthy();
    s.menu = [PRESETS.launchlet];
    s.requests.push(buyer(0, { segment: 'small', castId: 'mara' }));
    s = apply(s, { type: 'accept', requestId: 'b0-mara' });
    s = apply(s, { type: 'runDay' });
    const brief = s.events.find((e) => e.type === 'task_done' && e.stage === 'brief')!;
    const start = s.events.find((e) => e.type === 'task_start' && e.stage === 'brief')!;
    expect(brief.minute - start.minute).toBe(RULES.libraryBrief);
  });

  it('flyers bring extra neighbours of the chosen kind tomorrow, once a day', () => {
    let s = createRun(CFG);
    s = apply(s, { type: 'flyers', segment: 'careful' });
    expect(applyCommand(s, { type: 'flyers', segment: 'small' }).error).toBeTruthy();
    s = apply(s, { type: 'runDay' });
    expect(s.requests.filter((r) => r.day === 1 && r.source === 'flyer' && r.segment === 'careful').length).toBe(RULES.flyers.count);
  });

  it('someone off sick puts their work down and a colleague picks it up where they left it', () => {
    let s = blank();
    s.menu = [PRESETS.bespoke];
    s.requests.push(buyer(0, { need: 'nuanced' }));
    s = apply(s, { type: 'accept', requestId: 'b0-eli' });
    s = apply(s, { type: 'runDay' });
    const j = s.jobs[0]!;
    const holder = j.assignee!;
    const left = j.remaining;
    s.modifiers.push({ kind: 'absent', who: holder, day: 1, paid: true });
    s = apply(s, { type: 'runDay' });
    const resumed = s.events.find((e) => e.day === 1 && e.type === 'task_start' && e.jobId === j.id)!;
    expect(resumed.resourceId).not.toBe(holder);
    const done = s.events.find((e) => e.day === 1 && e.type === 'task_done' && e.jobId === j.id && e.stage === 'produce')!;
    expect(done.minute - resumed.minute).toBe(left);
  });

  it('work put down by a slower junior is finished at the pace of whoever picks it up', () => {
    let s = blank();
    s.menu = [PRESETS.bespoke];
    s = apply(s, { type: 'hire' });
    s = apply(s, { type: 'runDay' });
    s.requests.push(buyer(1));
    s = apply(s, { type: 'accept', requestId: 'b1-eli' });
    const j = s.jobs[0]!;
    // Hand the brief to the junior part-way, then send the junior home: a lead should finish the rest at normal speed.
    Object.assign(j, { assignee: 'j1', remaining: Math.ceil((30 * RULES.staff.junior.speedPercent) / 100) });
    s.resources.find((r) => r.id === 'j1')!.busyWith = j.id;
    s.modifiers.push({ kind: 'absent', who: 'j1', day: 1, paid: true });
    s = apply(s, { type: 'runDay' });
    const start = s.events.find((e) => e.day === 1 && e.type === 'task_start' && e.jobId === j.id && e.stage === 'brief')!;
    const end = s.events.find((e) => e.day === 1 && e.type === 'task_done' && e.jobId === j.id && e.stage === 'brief')!;
    expect(start.resourceId).toMatch(/^h/);
    expect(end.minute - start.minute).toBe(30);
  });
});

describe('reputation and the street', () => {
  it('delivering raises a type\'s reputation; a miss lowers it more', () => {
    let s = blank();
    s.menu = [PRESETS.bespoke];
    s.requests.push(buyer(0));
    s = apply(s, { type: 'accept', requestId: 'b0-eli' });
    while (s.jobs[0]!.status !== 'delivered') s = apply(s, { type: 'runDay' });
    expect(s.rep.moment).toBeGreaterThan(0);
    let t = blank();
    t.menu = [{ ...PRESETS.bespoke, turnaroundDays: 1, price: 500 }];
    t.requests.push(buyer(0, { need: 'nuanced' }));
    t = apply(t, { type: 'accept', requestId: 'b0-eli' });
    t = apply(t, { type: 'runDay' });
    expect(t.rep.moment).toBeLessThan(0);
  });

  it('reputation level shifts what new neighbours of that type will pay', () => {
    const a = createRun(CFG);
    const b = createRun(CFG);
    b.rep.small = RULES.rep.max;
    b.requests = [];
    const day1A = replayDay1(a);
    const day1B = replayDay1(b);
    const pair = day1A.find((r) => r.segment === 'small' && r.source === 'walkin' && day1B.some((x) => x.id === r.id && x.castId === r.castId));
    expect(pair).toBeDefined();
    const other = day1B.find((x) => x.id === pair!.id)!;
    expect(other.wtpPercent - pair!.wtpPercent).toBe(repLevel(RULES.rep.max - RULES.rep.decay) * RULES.rep.wtpPerLevel);
  });

  it('no neighbour visits more than the cap in a season', () => {
    for (const sc of SCENARIOS) {
      const s = runPolicy({ scenarioId: sc.id, seed: '7' }, { ...GHOSTS.faster, menu: [PRESETS.bespoke, PRESETS.launchlet], news: 'sensible' });
      const visits = new Map<string, number>();
      for (const r of s.requests) if (r.source !== 'news' && r.source !== 'amends') visits.set(r.castId, (visits.get(r.castId) ?? 0) + 1);
      expect(Math.max(...visits.values())).toBeLessThanOrEqual(RULES.maxVisits);
    }
  });

  // Review regressions (Codex, rules 3.2.0).
  it('a neighbour you let down always gets one chance to come back, two mornings later', () => {
    let s = blank();
    s.menu = [{ ...PRESETS.bespoke, turnaroundDays: 1, price: 500 }];
    s.requests.push(buyer(0, { need: 'nuanced' }));
    s = apply(s, { type: 'accept', requestId: 'b0-eli' });
    for (let i = 0; i < 3; i++) s = apply(s, { type: 'runDay' });
    const back = s.requests.filter((r) => r.castId === 'eli' && r.source === 'amends');
    expect(back.map((r) => r.day)).toEqual([2]);
    expect(s.requests.filter((r) => r.castId === 'eli' && r.source === 'walkin' && r.day > 0)).toEqual([]);
  });

  it('priority access keeps the AI desk up even on a scripted outage day', () => {
    const upTo = (priority: boolean) => {
      let s = createRun({ scenarioId: 'bespoke-rush', seed: 'x' });
      s = apply(s, { type: 'setStaff', staffing: { aiTier: 'solo', routing: 'all' } });
      while (s.day < 3) s = apply(s, { type: 'runDay' });
      s.news = s.news.filter((n) => n.day !== 3);
      s.news.push({ id: 'n3x', day: 3, card: 'maintenance', choice: null });
      s = apply(s, { type: 'choose', newsId: 'n3x', option: priority ? 1 : 0 });
      s = apply(s, { type: 'runDay' });
      return apply(s, { type: 'runDay' });
    };
    expect(upTo(false).events.some((e) => e.day === 4 && e.type === 'outage_start')).toBe(true);
    expect(upTo(true).events.some((e) => e.day === 4 && e.type === 'outage_start')).toBe(false);
  });

  it('the order of booking overtime and a temp does not change the price', () => {
    const a = replay(CFG, [{ type: 'overtime' }, { type: 'temp' }, { type: 'runDay' }]).state;
    const b = replay(CFG, [{ type: 'temp' }, { type: 'overtime' }, { type: 'runDay' }]).state;
    expect(a.cash).toBe(b.cash);
  });

  it("Hugo's send-off only earns reputation once it is delivered", () => {
    let s = blank();
    s.news.push({ id: 'n0', day: 0, card: 'hugoRetires', choice: null });
    s = apply(s, { type: 'choose', newsId: 'n0', option: 1 });
    expect(s.rep.careful).toBe(0);
    const declined = apply(s, { type: 'decline', requestId: 'd0-n' });
    expect(declined.rep.careful).toBeLessThanOrEqual(0);
    s = apply(s, { type: 'accept', requestId: 'd0-n' });
    // Same season without the favour: careful reputation differs by the 8 from delivering it.
    let plain = structuredClone(s);
    delete plain.contracts[0]!.repOnDelivery;
    while (s.jobs[0]!.status === 'active' || s.jobs[0]!.status === 'scheduled') {
      s = apply(s, { type: 'runDay' });
      plain = apply(plain, { type: 'runDay' });
    }
    expect(s.jobs[0]!.status).toBe('delivered');
    // Nightly decay pulls both toward zero from either side, so allow one night of it.
    expect(s.rep.careful - plain.rep.careful).toBeGreaterThanOrEqual(8 - 2 * RULES.rep.decay);
  });

  it('a neighbour you let down comes back once; delivering the free amends launch wins them back', () => {
    let s = blank();
    s.lostCast = ['eli'];
    s.requests.push(buyer(0, { source: 'amends', offer: AMENDS_OFFER }));
    s = apply(s, { type: 'accept', requestId: 'b0-eli' });
    expect(s.contracts[0]!.price).toBe(0);
    while (s.jobs[0]!.status !== 'delivered') s = apply(s, { type: 'runDay' });
    expect(s.lostCast).not.toContain('eli');
    cashIdentity(s);
  });

  it('served counts only neighbours whose whole order was delivered', () => {
    let s = blank();
    s.menu = [PRESETS.club];
    s.requests.push(buyer(0, { segment: 'small', castId: 'mara' }));
    s = apply(s, { type: 'accept', requestId: 'b0-mara' });
    for (let i = 0; i < 2; i++) s = apply(s, { type: 'runDay' });
    expect(s.jobs.filter((j) => j.status === 'delivered').length).toBeGreaterThanOrEqual(1);
    expect(summarize(s).served).toBe(0);
    expect(summarize(s).sold).toBe(1);
  });
});

describe('honesty under v3', () => {
  it('the forecast sees known absences and outages but never news or arrivals that have not happened', () => {
    const s = blank();
    s.menu = [{ ...PRESETS.bespoke, turnaroundDays: 1, price: 500 }];
    s.requests.push(buyer(0));
    const f1 = forecast(s, 'b0-eli');
    s.modifiers.push({ kind: 'absent', who: 'h1', day: 0, paid: true }, { kind: 'absent', who: 'h2', day: 0, paid: true });
    const f2 = forecast(s, 'b0-eli');
    expect(fits(f1)).toBe(true);
    expect(f2.newAtRisk).toEqual(['c1-l1']);
    const before = JSON.stringify(s);
    forecast(s, 'b0-eli');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('every v3 command replays exactly', () => {
    const cmds: Command[] = [{ type: 'hire' }, { type: 'buy', item: 'checklist' }, { type: 'flyers', segment: 'rush' }, { type: 'overtime' }, { type: 'runDay' }, { type: 'temp' }, { type: 'runDay' }];
    const a = replay(CFG, cmds);
    const b = replay(CFG, cmds);
    expect(a.errors).toEqual([]);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    cashIdentity(a.state);
  });
});

function replayDay1(s: CompanyState): Request[] {
  const r = applyCommand(s, { type: 'runDay' });
  return r.state.requests.filter((x) => x.day === 1);
}

describe('counter-offers (GD-11)', () => {
  const start = createRun({ scenarioId: 'main-street', seed: 'panel-1' }, LEGACY_RULES_VERSION);
  const s = applyCommand(start, { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
  const near = s.requests.find((r) => r.id === 'd0-r2')!;

  it('a neighbour put off only by price, and close to it, names a price rounded down to 10', () => {
    expect(counterOffer(reactionFor(s, near), s.menu)).toEqual({ offerIndex: 1, price: 300 });
  });

  it("taking it books their price, keeps the money identities, and lowers that kind of customer's price for a few days", () => {
    const r = applyCommand(s, { type: 'accept', requestId: near.id, counter: true });
    expect(r.error).toBeUndefined();
    const c = r.state.contracts.at(-1)!;
    expect(c.price).toBe(300);
    expect(c.offer.price).toBe(PRESETS.launchlet.price);
    expect(r.state.cash - s.cash).toBe(300);
    const { wtpDropPercent: drop, days } = RULES.counter;
    expect([1, 2, 3, 4, 5, 6].map((day) => wtpShift(r.state, near.segment, day))).toEqual([1, 2, 3, 4, 5, 6].map((day) => (day <= days ? -drop : 0)));
  });

  it('is refused for a neighbour who would pay the window price, or who has another objection', () => {
    const buyer = s.requests.find((r) => r.day === 0 && reactionFor(s, r).kind === 'buy')!;
    expect(applyCommand(s, { type: 'accept', requestId: buyer.id, counter: true }).error).toMatch(/named a price/);
    // With only Bespoke (ready in 3 days) on the window, day 1's neighbours object to the wait, not the price.
    const slow = start.requests.find((r) => r.day === 0)!;
    expect(reactionFor(start, slow)).toMatchObject({ kind: 'walk', reason: 'slow' });
    expect(applyCommand(start, { type: 'accept', requestId: slow.id, counter: true }).error).toMatch(/named a price/);
  });
});

describe('story beats added in rules 3.3.0', () => {
  it('Oscar comes to the window mid-season after Bright Lantern drops his launch, and the street party follows success', () => {
    const runs = ['1', '2', '3', '4', '5', '6'].map((seed) => runPolicy({ scenarioId: 'main-street', seed }, { ...GHOSTS.hand }, {}, LEGACY_RULES_VERSION));
    for (const s of runs) {
      const oscar = s.news.find((n) => n.card === 'oscarRescue');
      if (oscar) expect(oscar.day).toBeGreaterThanOrEqual(4);
    }
    expect(runs.filter((s) => s.news.some((n) => n.card === 'oscarRescue')).length).toBeGreaterThanOrEqual(4);
    expect(runs.some((s) => s.news.some((n) => n.card === 'streetParty'))).toBe(true);
  });
});

describe('the crossroads (rules 3.4.0)', () => {
  it('a direction brings one kind of neighbour for four days and costs you with another', () => {
    let s = withNews('crossroads');
    s = apply(s, { type: 'choose', newsId: 'n0', option: 2 });
    const arrivals = s.modifiers.filter((m) => m.kind === 'arrivals');
    expect(arrivals.map((m) => (m.kind === 'arrivals' ? [m.segment, m.count, m.day] : null))).toEqual([1, 2, 3, 4].map((d) => ['small', 2, d]));
    expect([1, 2, 3, 4, 5].map((d) => wtpShift(s, 'moment', d))).toEqual([-10, -10, -10, -10, 0]);
    expect(s.cash).toBe(RULES.initialCash - 200);
    cashIdentity(s);
  });

  it('comes on the morning of day 4 of every season on every street', () => {
    for (const sc of ['main-street', 'festival-week', 'bespoke-rush'])
      expect(runPolicy({ scenarioId: sc, seed: '1' }, GHOSTS.old).news.find((n) => n.card === 'crossroads')?.day).toBe(3);
  });
});

describe('a launch that takes off (rules 3.5.0)', () => {
  const runs = ['1', '2', '3', '4', '5', '6'].map((seed) => runPolicy({ scenarioId: 'main-street', seed }, GHOSTS.hand));

  it('happens now and then, never more than the cap, and only on a day something was delivered', () => {
    const counts = runs.map((s) => s.events.filter((e) => e.type === 'takeoff').length);
    expect(Math.max(...counts)).toBeLessThanOrEqual(RULES.takeoff.max);
    expect(counts.some((n) => n > 0)).toBe(true);
    for (const s of runs)
      for (const e of s.events.filter((x) => x.type === 'takeoff')) expect(s.events.some((x) => x.type === 'delivered' && x.jobId === e.jobId && x.day === e.day)).toBe(true);
  });

  it('brings neighbours of that kind the next morning', () => {
    const s = runs.find((x) => x.events.some((e) => e.type === 'takeoff'))!;
    const e = s.events.find((x) => x.type === 'takeoff')!;
    const seg = s.contracts.find((c) => c.jobIds.includes(e.jobId!))!.segment;
    expect(s.modifiers.some((m) => m.kind === 'arrivals' && m.segment === seg && m.day === e.day + 1 && m.source === 'word')).toBe(true);
  });

  it('is never part of a forecast', () => {
    const s = runs[0]!;
    const mid = replay(s.config, s.commands.slice(0, s.commands.findIndex((c) => c.type === 'runDay') + 1)).state;
    const f = structuredClone(mid);
    expect(forecast(f).atRisk).toEqual(forecast(mid).atRisk);
    expect(f.events.filter((e) => e.type === 'takeoff').length).toBe(mid.events.filter((e) => e.type === 'takeoff').length);
  });
});

describe('Bright Lantern wants Ada (rules 3.6.0)', () => {
  it('letting her try it takes Ada out for three days, unpaid; the bonus keeps her for 600', () => {
    let s = withNews('poach');
    const away = apply(s, { type: 'choose', newsId: 'n0', option: 0 });
    expect([0, 1, 2, 3, 4].map((d) => workingOn(away, d).some((r) => r.id === 'h1'))).toEqual([true, false, false, false, true]);
    s = apply(s, { type: 'choose', newsId: 'n0', option: 1 });
    expect(s.cash).toBe(RULES.initialCash - 600);
    expect([1, 2, 3].every((d) => workingOn(s, d).some((r) => r.id === 'h1'))).toBe(true);
  });

  it('comes once, in the middle of the season', () => {
    for (const seed of ['2', '3', '4']) {
      const n = runPolicy({ scenarioId: 'main-street', seed }, GHOSTS.hand).news.filter((x) => x.card === 'poach');
      expect(n.length).toBe(1);
      expect(n[0]!.day).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('Quickprint goes dark (rules 3.8.0)', () => {
  it('letting them come brings four neighbours tomorrow; the temp option books Sol too; the full sign changes nothing', () => {
    const s = withNews('blackout');
    const come = apply(s, { type: 'choose', newsId: 'n0', option: 0 });
    expect(come.modifiers.filter((m) => m.kind === 'arrivals' && m.day === 1).reduce((a, m) => a + (m.kind === 'arrivals' ? m.count : 0), 0)).toBe(4);
    const temp = apply(s, { type: 'choose', newsId: 'n0', option: 1 });
    expect(temp.tempDays).toContain(1);
    const full = apply(s, { type: 'choose', newsId: 'n0', option: 2 });
    expect(full.modifiers).toEqual(s.modifiers);
    expect(full.cash).toBe(s.cash);
  });

  it('comes once, late in the season', () => {
    for (const seed of ['1', '2', '3']) {
      const n = runPolicy({ scenarioId: 'main-street', seed }, GHOSTS.hand).news.filter((x) => x.card === 'blackout');
      expect(n.length).toBe(1);
      expect(n[0]!.day).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('Bright Lantern makes an offer on the last morning (rules 3.9.0)', () => {
  it('comes on the last morning of every season; selling adds 1,500 to cash and the operating result', () => {
    for (const seed of ['1', '2']) {
      const s = runPolicy({ scenarioId: 'main-street', seed }, GHOSTS.hand);
      expect(s.news.filter((n) => n.card === 'lastOffer').map((n) => n.day)).toEqual([RULES.days - 1]);
    }
    const s = withNews('lastOffer');
    const sold = apply(s, { type: 'choose', newsId: 'n0', option: 1 });
    expect(sold.cash).toBe(s.cash + 1500);
    expect(summarize(sold).operatingResult).toBe(summarize(s).operatingResult + 1500);
    cashIdentity(sold);
  });
});

describe("the junior's payoff", () => {
  it('counts her wages for the days played and a share of earned revenue below the whole', () => {
    const s = runPolicy({ scenarioId: 'main-street', seed: '2' }, GHOSTS.hand);
    const p = juniorPayoff(s)!;
    const noor = s.resources.find((r) => r.role === 'junior' && r.name === RULES.staff.junior.name)!;
    expect(p.wages).toBe((RULES.days - noor.fromDay) * RULES.staff.junior.dailyCost);
    expect(p.worth).toBeGreaterThan(0);
    expect(p.worth).toBeLessThan(s.revenue);
    expect(juniorPayoff(runPolicy({ scenarioId: 'main-street', seed: '2' }, GHOSTS.old))).toBeNull();
  });
});

describe("today's pace", () => {
  const morning = () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'e2e-1' });
    const r = windowRequests(s).find((x) => reactionTo(s, x).kind === 'buy')!;
    s = applyCommand(s, { type: 'accept', requestId: r.id }).state;
    return s;
  };
  const firstDone = (s: CompanyState) => s.events.find((e) => e.type === 'task_done')!.minute;

  it('is set for the morning, can be put back to steady, and is checked', () => {
    const s = applyCommand(morning(), { type: 'pace', pace: 'push' }).state;
    expect(paceOn(s, 0)).toBe('push');
    expect(paceOn(applyCommand(s, { type: 'pace', pace: 'steady' }).state, 0)).toBe('steady');
    expect(applyCommand(s, { type: 'pace', pace: 'sprint' as never }).error).toBe('Unknown pace.');
    const next = applyCommand(s, { type: 'runDay' }).state;
    expect(applyCommand(next, { type: 'pace', pace: 'push' }).error).toBe('They pushed yesterday. Not two days running.');
    expect(applyCommand(next, { type: 'pace', pace: 'careful' }).error).toBeUndefined();
  });

  it('makes work started that day quicker when pushed and slower when careful', () => {
    const run = (pace: 'steady' | 'push' | 'careful') => firstDone(applyCommand(applyCommand(morning(), { type: 'pace', pace }).state, { type: 'runDay' }).state);
    expect(run('push')).toBeLessThan(run('steady'));
    expect(run('careful')).toBeGreaterThan(run('steady'));
  });
});

describe('a neighbour who rings ahead', () => {
  it('books several launches at a premium whose work starts tomorrow, so taking one makes nothing today', () => {
    for (const seed of ['panel-1', 'panel-2', 'panel-3', 'panel-4']) {
      let s = applyCommand(createRun({ scenarioId: 'main-street', seed }), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
      for (let day = 0; day < RULES.days - 2; day++) {
        const b = windowRequests(s).find((r) => r.source === 'booking');
        if (b) {
          const base = react(b, s.menu, s.lostCast);
          expect(base.kind).toBe('buy');
          if (base.kind !== 'buy') return;
          expect(b.offer).toMatchObject({ startsInDays: 1, spacingDays: 0 });
          expect(b.offer!.launches).toBeGreaterThanOrEqual(1);
          expect(b.repOnDelivery).toBe(RULES.booking.rep);
          expect(b.offer!.price).toBeGreaterThan((base.price / base.offer.launches) * b.offer!.launches);
          const t = applyCommand(s, { type: 'accept', requestId: b.id }).state;
          const jobs = t.jobs.filter((j) => j.castId === b.castId && j.releaseDay === s.day + 1);
          expect(jobs.map((j) => j.status)).toEqual(Array(b.offer!.launches).fill('scheduled'));
          const ran = applyCommand(t, { type: 'runDay' }).state;
          expect(ran.events.some((e) => e.day === s.day && jobs.some((j) => j.id === e.jobId) && e.type === 'task_start')).toBe(false);
          return;
        }
        s = applyCommand(s, { type: 'runDay' }).state;
      }
    }
    throw new Error('no booking rang ahead');
  });
});

describe('redo luck (rules 4.3.0)', () => {
  it('belongs to the buyer and the launch, so taking someone the day before does not change whether their launch is redone', () => {
    // A mid-day call holds the day until it is answered; letting it ride keeps both runs alike.
    const run = (t: CompanyState) => applyCommand(t.call ? applyCommand(t, { type: 'answer', option: 'ride' }).state : t, { type: 'runDay' }).state;
    let compared = 0;
    let redone = 0;
    for (let i = 1; i <= 24; i++) {
      const s = applyCommand(createRun({ scenarioId: 'main-street', seed: `redo-${i}` }), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
      const a = windowRequests(s).find((r) => reactionTo(s, r).kind === 'buy');
      if (!a) continue;
      // Day 2, with and without Day 1's buyer taken: the same neighbour at the window, under a different contract number.
      const days = [run(applyCommand(s, { type: 'accept', requestId: a.id }).state), run(s)];
      const buying = windowRequests(days[0]!).filter((r) => reactionTo(days[0]!, r).kind === 'buy');
      const b = buying.find((r) => r.need === 'nuanced') ?? buying[0];
      if (!b || !days[1]!.requests.some((r) => r.id === b.id && r.castId === b.castId)) continue;
      const [taken, left] = days.map((d0) => {
        // Tricky briefs are made by Tomas in both runs, so the odds of a redo are the same and only the draw is compared.
        let t = applyCommand(d0, { type: 'accept', requestId: b.id, ...(b.need === 'nuanced' ? { maker: 'h2' } : {}) }).state;
        const jobs = t.contracts.find((c) => c.requestId === b.id)!.jobIds;
        for (let d = 0; d < 5; d++) t = run(t);
        return new Map(jobs.filter((id) => t.jobs.find((j) => j.id === id)!.status === 'delivered').map((id) => [t.jobs.find((j) => j.id === id)!.launchIndex, t.events.filter((e) => e.type === 'rework_found' && e.jobId === id).length]));
      });
      for (const [k, n] of left!) {
        if (!taken!.has(k)) continue;
        expect(taken!.get(k)).toBe(n);
        compared++;
        if (n) redone++;
      }
    }
    expect(compared).toBeGreaterThan(8);
    expect(redone).toBeGreaterThan(0);
  });
});
