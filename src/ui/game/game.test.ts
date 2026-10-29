import { describe, expect, it } from 'vitest';
import { digest } from '../../ai/debrief';
import { valueOffer } from '../../engine/demand';
import { GOALS } from '../../engine/goals';
import { GHOSTS, runPolicy } from '../../engine/policies';
import { CAST_BY_ID, PRESETS, RULES, SEGMENTS } from '../../engine/rules';
import { fits, fitsWith, fitsWithRedo, forecast, humanLoad, reactionTo, servedByDay, summarize, takeableInTurn, todayLoad, windowRequests } from '../../engine/selectors';
import { applyCommand, createRun, isRegular, repLevel, replay } from '../../engine/sim';
import { CURRENT_RULES_VERSION, LEGACY_RULES_VERSION, STUDIO_RULES_VERSION } from '../../engine/versions';
import type { CompanyState } from '../../engine/types';
import { Clock } from './clock';
import { cashWarning, chatterOf, closeCall, eveningFacts, goalMoved, insightsFor, lossWarning, missReasons, noteOf, overnight, overtaken, paceLine, prepFor, walkReasons } from './eveningFacts';
import { statsAt, statsOf } from './live';
import { bookingLine, bookingsWorked } from './booking';
import { makerChoices, makersContested } from './makers';
import { launchesToNextStep } from './wordOfMouth';
import { noticeOf } from './noticeboard';
import { orderFit } from './newsFit';
import { sameOrders } from './sameOrders';
import { leverOptions, studioHint } from './studioHint';
import { fitsToday, offerRates, priceTarget, wants } from './workshopMath';

const CFG = { scenarioId: 'main-street', seed: 'ui-game-1' };

/** The states either side of the day with the most deliveries in a ghost's season. */
function busyDay(): { before: CompanyState; after: CompanyState } {
  const season = runPolicy(CFG, GHOSTS.bright);
  let best = { before: season, after: season, n: -1 };
  season.commands.forEach((c, i) => {
    if (c.type !== 'runDay') return;
    const before = replay(CFG, season.commands.slice(0, i)).state;
    const after = applyCommand(before, c).state;
    const n = after.events.filter((e) => e.day === before.day && e.type === 'delivered').length;
    if (n > best.n) best = { before, after, n };
  });
  return best;
}

describe('live top-bar numbers during playback', () => {
  const { before, after } = busyDay();
  const start = before.minute;

  it('start from the morning and end exactly on the engine summary', () => {
    expect(statsAt(before, after, start - 1).served).toBe(statsOf(before).served);
    expect(statsAt(before, after, start + RULES.minutesPerDay)).toEqual(statsOf(after));
    expect(statsAt(before, after, start - 1).profit).toBe(statsOf(before).profit);
  });

  it('never run ahead of the clock: served and owed move only when a delivery has happened', () => {
    let last = statsAt(before, after, start);
    let changes = 0;
    for (let t = start + 1; t < start + RULES.minutesPerDay; t++) {
      const now = statsAt(before, after, t);
      const deliveredNow = after.events.some((e) => e.type === 'delivered' && e.minute === t);
      if (now.owed !== last.owed) {
        expect(deliveredNow).toBe(true);
        changes++;
      }
      expect(now.served).toBeGreaterThanOrEqual(last.served);
      last = now;
    }
    expect(changes).toBeGreaterThanOrEqual(2);
  });
});

describe('workshop "Wants"', () => {
  it('names a change each blocked kind of neighbour would buy, at the price it quotes', () => {
    for (const draft of [PRESETS.bespoke, PRESETS.club, PRESETS.launchlet, { ...PRESETS.bespoke, price: 5000 }]) {
      for (const sg of Object.values(SEGMENTS)) {
        const text = wants(sg, draft);
        const price = Number(text.match(/about ([\d,]+) cr/)![1]!.replace(/,/g, ''));
        expect(text).toMatch(/^Wants: /);
        // Apply the named fixes and check that neighbour buys at that price.
        const fixed = { ...draft, price };
        if (text.includes('ready same day')) fixed.turnaroundDays = 1;
        const within = text.match(/ready within (\d) days/);
        if (within) fixed.turnaroundDays = Number(within[1]);
        if (text.includes('made to order')) fixed.style = 'custom';
        if (text.includes('any brief')) fixed.scope = 'any';
        const need = sg.nuancedBp >= 5000 ? 'nuanced' : 'simple';
        expect(valueOffer(sg.id, need, 100, fixed).blocker, `${sg.id} for ${draft.name}`).toBeNull();
      }
    }
  });
});

describe('playback clock', () => {
  it('steps by the hour while paused, skips to the evening, and rewinds for a walk-through', () => {
    const c = new Clock(480, false);
    c.advance(30);
    c.stepHour();
    expect(c.get()).toMatchObject({ t: 480 + 60, paused: true, done: false });
    c.advance(100);
    expect(c.get().t).toBe(540);
    c.skip();
    expect(c.get()).toMatchObject({ t: 960, done: true, paused: false });
    c.rewind();
    expect(c.get()).toMatchObject({ t: 480, done: false, paused: true });
  });
});

describe('evening card', () => {
  it('says what was delivered and earned in one sentence, from the engine', () => {
    const { before, after } = busyDay();
    const f = eveningFacts({ before, after });
    expect(f.delivered).toBeGreaterThan(0);
    expect(f.sentence).toContain(`delivered ${f.delivered} launch`);
    expect(f.earned).toBe(after.revenue - before.revenue);
  });
});

describe('last evening truth', () => {
  it('closes the final evening without promising another day and leaves ordinary chatter alone', () => {
    const cfg = { scenarioId: 'main-street', seed: 'closing-1' };
    let before = createRun(cfg);
    for (let day = 0; day < RULES.days - 1; day++) before = applyCommand(before, { type: 'runDay' }).state;
    const after = applyCommand(before, { type: 'runDay' }).state;

    expect(after.finished).toBe(true);
    const finalChatter = chatterOf(before, after, RULES.days - 1);
    expect(finalChatter).toContain('That is the season');
    expect(finalChatter).not.toContain('tomorrow');
    expect(chatterOf(before, applyCommand(createRun(cfg), { type: 'runDay' }).state, 0)).toBe('Ada: "Quiet day. I alphabetised the fonts."');
  });
});

// The persona panel took four same-day Launchlets on day 1 because the workshop said 4 of 5 would buy, and missed
// two. Day 1 has no template kit yet, so only one fits. These pin the numbers that now say so.
describe('day 1 with a same-day Launchlet on Main Street (panel-1)', () => {
  const start = createRun({ scenarioId: 'main-street', seed: 'panel-1' }, LEGACY_RULES_VERSION);
  const s0 = applyCommand(start, { type: 'setMenu', offers: [start.menu[0]!, PRESETS.launchlet] }).state;
  const buyers = windowRequests(s0).filter((r) => reactionTo(s0, r).kind === 'buy');
  const s1 = applyCommand(s0, { type: 'accept', requestId: buyers[0]!.id }).state;

  it('the workshop counts how many of the buyers fit, using the same forecast as the tickets', () => {
    expect(fitsToday(start, PRESETS.launchlet, 1)).toEqual({ buyers: 4, fit: 1, afterSeason: 0 });
  });

  it('a buyer who does not fit names a lever, and that lever really makes them fit', () => {
    for (const r of buyers.slice(1)) {
      expect(fits(forecast(s1, r.id))).toBe(false);
      const lever = fitsWith(s1, r.id);
      expect(lever).not.toBeNull();
      expect(fits(forecast(applyCommand(s1, { type: lever! }).state, r.id))).toBe(true);
    }
  });

  it("today's load shows the second same-day job overflowing, where the three-day gauge looks roomy", () => {
    const s2 = applyCommand(s1, { type: 'accept', requestId: buyers[1]!.id }).state;
    const t1 = todayLoad(s1);
    const t2 = todayLoad(s2);
    const three = humanLoad(s2);
    expect(t1.committed).toBeLessThanOrEqual(t1.available);
    expect(t2.committed).toBeGreaterThan(t2.available);
    expect(three.committed / three.available).toBeLessThan(0.5);
  });

  it('the studio panel points at overtime, the lever that would let the waiting buyers in', () => {
    // Counted one after another: overtime makes room for two of the three, not all three.
    expect(studioHint(s1)).toMatchObject({ lever: 'overtime', text: "3 buyers at the window don't fit today. With overtime, 2 of them would: book it, then take them.", unlocks: { n: 2, value: 680 } });
  });

  it('keeps an individual rescue choice when the queue-order buyer count does not increase', () => {
    const config = { scenarioId: 'main-street', seed: 'm2' };
    const commands = runPolicy(config, GHOSTS.hand, {}, LEGACY_RULES_VERSION).commands.slice(0, 45);
    const restored = replay(config, commands, LEGACY_RULES_VERSION);
    expect(restored.errors).toEqual([]);
    const s = restored.state;
    expect(s.day).toBe(4);
    const rory = windowRequests(s).find((r) => r.castId === 'rory')!;
    expect(fits(forecast(s, rory.id))).toBe(false);
    const withOvertime = applyCommand(s, { type: 'overtime' });
    expect(withOvertime.error).toBeUndefined();
    expect(fits(forecast(withOvertime.state, rory.id))).toBe(true);
    expect(takeableInTurn(withOvertime.state).length).toBeLessThanOrEqual(takeableInTurn(s).length);

    const before = structuredClone(s);
    const hint = studioHint(s);
    expect(hint).toEqual({ lever: 'overtime', text: "With overtime, Rory's order would fit. Book it, then choose who gets the hours." });
    expect(s).toEqual(before);
    const hidden = structuredClone(s);
    for (const job of hidden.jobs) if (job.stage !== 'rework') job.reworkFlag = !job.reworkFlag;
    expect(studioHint(hidden)).toEqual(hint);
  });

  it('the first launch out of the door gets its own line, once a season', () => {
    // Juno first: on this seed Mara's launch is the one that gets redone, and the redo's miss takes the evening's line.
    const j1 = applyCommand(s0, { type: 'accept', requestId: buyers[1]!.id }).state;
    const day1 = applyCommand(j1, { type: 'runDay' }).state;
    expect(eveningFacts({ before: j1, after: day1 }).first).toMatch(/^First launch out(: Juno at |, and a surprise: Juno's launch)/);
    expect(noteOf(day1, 0)).toMatch(/^Juno at Pop-up Vintage: ".+"$/);
    const day2 = applyCommand(day1, { type: 'runDay' }).state;
    expect(eveningFacts({ before: day1, after: day2 }).first).toBeNull();
  });

  it('a launch taken against the forecast names the work left at closing', () => {
    // Juno, then Mara against the forecast: taking Mara first would see her redone, which makes a second miss.
    const s2 = applyCommand(applyCommand(s0, { type: 'accept', requestId: buyers[1]!.id }).state, { type: 'accept', requestId: buyers[0]!.id }).state;
    const after = applyCommand(s2, { type: 'runDay' }).state;
    const reasons = missReasons(after, 0);
    expect(reasons.length).toBe(1);
    expect(after.jobs.find((j) => j.castId === 'mara')).toMatchObject({ status: 'missed', stage: 'produce', remaining: 14 });
    expect(reasons[0]).toBe("Mara's was still being made at closing");
    expect(eveningFacts({ before: s2, after }).sentence).toContain(`1 missed, refunded with a fee: ${reasons[0]}.`);
  });

  it('the debrief, like the evening, separates buyers who did not fit from buyers nobody answered', () => {
    const after = applyCommand(s1, { type: 'runDay' }).state;
    expect(digest(after).notServed).toContainEqual({ reason: "did not fit the studio's hours and were left unanswered", neighbours: 3 });
  });

  it('the evening says why each neighbour walked, unanswered buyers included', () => {
    const after = applyCommand(s1, { type: 'runDay' }).state;
    // The one put off by price had named their own and was left waiting: that is the reason given.
    expect(walkReasons(s1, after, 0)).toEqual(["3 didn't fit your hours", '1 offered their own price at the window and got no answer']);
  });

  it('puts a price on the buyers who did not fit, next to the cheapest way to more hours', () => {
    const after = applyCommand(s1, { type: 'runDay' }).state;
    const note = insightsFor(s1, after, 0, 0).find((n) => n.text.includes('walked away'))!;
    expect(note.text).toMatch(/Those who didn't fit would have paid [\d,]+ cr\. Hiring Noor adds about 4 hours of work a day for 250 cr\./);
    // People were not flat out, so the note says why the free hours could not take them.
    expect(note.text).toMatch(/People were busy only \d+% of their hours, but the free hours came where no launch was ready for them/);
    expect(note).toMatchObject({ action: 'hire', verb: 'Hire Noor (250 cr a day)' });
  });
});

describe('evening moments', () => {
  it('names a studio only on the day you pass it', () => {
    const others = [{ label: 'Old Lantern', served: [1, 3, 4] }, { label: 'Faster Lantern', served: [0, 1, 9] }];
    expect(overtaken([0, 2, 5], others, 1)).toEqual(['Faster Lantern']);
    expect(overtaken([0, 2, 5], others, 2)).toEqual(['Old Lantern']);
    expect(overtaken([0, 2, 5], others, 0)).toEqual([]);
  });

  it('marks the evening the season passes ten neighbours served, and only that evening', () => {
    const cfg = { scenarioId: 'main-street', seed: '1' };
    const season = runPolicy(cfg, GHOSTS.bright);
    const served = servedByDay(season);
    const d = served.findIndex((n) => n >= 10);
    expect(d).toBeGreaterThan(0);
    let runs = 0;
    const before = replay(cfg, season.commands.slice(0, season.commands.findIndex((c) => c.type === 'runDay' && runs++ === d))).state;
    const after = applyCommand(before, { type: 'runDay' }).state;
    expect(eveningFacts({ before, after }).first).toBe(`${served[d]} neighbours served this season.`);
  });
});

describe('word of mouth: launches to the next step', () => {
  it('counts on-time launches to the next level, allowing for the night drift, and stops at the top', () => {
    const { perLevel: P, delivered: D, decay } = RULES.rep;
    expect(launchesToNextStep(0)).toBe(Math.ceil((P + decay) / D));
    expect(launchesToNextStep(P)).toBe(Math.ceil((P + decay) / D));
    expect(launchesToNextStep(-P - 1)).toBe(1);
    expect(launchesToNextStep(RULES.rep.max)).toBeNull();
  });

  it('that many launches really do hold the next level the following morning', () => {
    const { perLevel: P, delivered: D, decay } = RULES.rep;
    for (const rep of [0, 5, P, P + 3, -P - 1, -2 * P]) {
      const after = rep + launchesToNextStep(rep)! * D;
      const morning = after > 0 ? after - decay : after + decay;
      expect(repLevel(morning) === repLevel(rep) + 1, `from ${rep}`).toBe(true);
    }
  });
});

// Codex review: an order whose launches fall after the season was treated as a shortage of hands.
describe('late in the season, a Launch Club buyer (Main Street, panel-1, day 10)', () => {
  const cfg = { scenarioId: 'main-street', seed: 'panel-1' };
  const run = runPolicy(cfg, GHOSTS.old);
  let n = 0;
  const morning = replay(cfg, run.commands.slice(0, run.commands.findIndex((c) => c.type === 'runDay' && n++ === 8) + 1)).state;
  // A neighbour in a hurry who does not fit is a staffing question of its own: answer them, so only Launch Club is asked about.
  const hurried = windowRequests(morning).filter((r) => r.source === 'premium' && r.status === 'waiting');
  const answered = hurried.reduce((t, r) => applyCommand(t, { type: 'decline', requestId: r.id }).state, morning);
  const s = applyCommand(answered, { type: 'setMenu', offers: [PRESETS.club] }).state;

  it('is counted as a season-end problem in the workshop, not a staffing one', () => {
    const f = fitsToday(morning, PRESETS.club, 0);
    expect(f.buyers).toBeGreaterThan(0);
    expect(f).toEqual({ buyers: f.buyers, fit: 0, afterSeason: f.buyers });
  });

  it('does not make the studio suggest hiring', () => {
    expect(studioHint(s)?.lever).not.toBe('hire');
  });
});

// The full-season panel's top complaint: "missed when I only took buyers that fit". The forecast assumes no rework,
// so the ticket now also asks whether one redo would make the order late.
describe('fits, with or without room for a redo (Bright Lantern mornings, Main Street, three seeds)', () => {
  const mornings = ['panel-1', '1', '2'].flatMap((seed) => {
    const cfg = { scenarioId: 'main-street', seed };
    const run = runPolicy(cfg, GHOSTS.bright);
    return run.commands.flatMap((c, i) => (c.type === 'runDay' ? [replay(cfg, run.commands.slice(0, i + 1)).state] : []));
  });
  const checks = mornings.flatMap((s) =>
    windowRequests(s)
      .filter((r) => r.status === 'waiting' && reactionTo(s, r).kind === 'buy')
      .map((r) => ({ day: s.day, id: r.id, fits: fits(forecast(s, r.id)), redo: fitsWithRedo(s, r.id) })),
  );

  it('a redo only ever adds work: room for a redo implies it fits', () => {
    expect(checks.filter((c) => c.redo && !c.fits)).toEqual([]);
  });

  it('some buyers fit only if nothing needs redoing, and they are a minority', () => {
    const tight = checks.filter((c) => c.fits && !c.redo).length;
    expect(tight).toBeGreaterThan(0);
    expect(tight).toBeLessThan(checks.filter((c) => c.fits).length / 3);
  });
});

describe('evening notes and pace', () => {
  it('says what the next medal needs per day from here', () => {
    expect(paceLine(10, 4, { bronze: 34, silver: 54, gold: 85 })).toBe('Heading for about 24 served. Bronze (34) needs 4 a day from here; you average 2.0.');
    expect(paceLine(80, 10, { bronze: 34, silver: 54, gold: 85 })).toBe('Heading for about 87 served: gold pace (85).');
  });
});

describe('studio chatter', () => {
  it('reacts to the day just played, and says the same thing on a replay of it', () => {
    const cfg = { scenarioId: 'main-street', seed: 'panel-1' };
    const s0 = createRun(cfg);
    const quiet = applyCommand(s0, { type: 'runDay' }).state;
    expect(chatterOf(s0, quiet, 0)).toMatch(/alphabetised the fonts|launch for the cat/);
    expect(chatterOf(s0, applyCommand(s0, { type: 'runDay' }).state, 0)).toBe(chatterOf(s0, quiet, 0));
  });
});

describe('studio chatter across a season', () => {
  it('does not give Noor credit in a season that never hired her', () => {
    const s = runPolicy({ scenarioId: 'bespoke-rush', seed: 'review-later' }, GHOSTS.bright);
    expect(s.commands.some(c => c.type === 'hire')).toBe(false);
    expect(s.resources.some(r => r.name === 'Noor')).toBe(false);
    expect(chatterOf(s, s, 6)).not.toMatch(/^Noor:/);
  });

  it('uses each line of a kind in turn, so a season does not repeat itself', () => {
    const s = runPolicy({ scenarioId: 'main-street', seed: '3' }, GHOSTS.hand);
    const lines = Array.from({ length: 12 }, (_, d) => chatterOf(s, s, d));
    for (let d = 1; d < lines.length; d++) expect(lines[d]).not.toBe(lines[d - 1]);
    expect(new Set(lines).size).toBeGreaterThanOrEqual(8);
  });
});

describe('the morning repeats last night', () => {
  it('names a broken promise and its cause before the next decision', () => {
    const cfg = { scenarioId: 'main-street', seed: 'panel-1' };
    let s = createRun(cfg);
    s = applyCommand(s, { type: 'setMenu', offers: [s.menu[0]!, PRESETS.launchlet] }).state;
    for (const r of windowRequests(s)) if (reactionTo(s, r).kind === 'buy') s = applyCommand(s, { type: 'accept', requestId: r.id }).state;
    s = applyCommand(s, { type: 'runDay' }).state;
    const lines = overnight(s);
    expect(lines.some((l) => /^\d* ?promises? broke: .+\. Refunded with a fee\.$/i.test(l))).toBe(true);
    // And the money: earned against running costs, then profit so far, matching the books.
    const profit = summarize(s).operatingResult;
    expect(lines.at(-1)).toMatch(/^you earned [\d,]+ cr against [\d,]+ cr of running costs \(wages [\d,]+, rent \d+\)\. Profit so far: -?[\d,]+ cr\.$/);
    expect(lines.at(-1)).toContain(`Profit so far: ${profit < 0 ? '-' : ''}${Math.abs(profit).toLocaleString('en-GB')} cr.`);
    expect(overnight(createRun(cfg))).toEqual([]);
  });

  it('from the fifth morning, says where profit is heading when it is heading up; a loss gets its own warning', () => {
    const bright = runPolicy({ scenarioId: 'main-street', seed: 'panel-1' }, GHOSTS.bright);
    const runs = bright.commands.flatMap((c, i) => (c.type === 'runDay' ? [i] : []));
    const s = replay(bright.config, bright.commands.slice(0, runs[5]! + 1)).state;
    const profit = summarize(s).operatingResult;
    const heading = Math.round((profit + (profit / s.day) * (RULES.days - s.day)) / 100) * 100;
    expect(heading).toBeGreaterThan(0);
    expect(overnight(s).at(-1)).toContain(`At this pace the season ends about ${heading.toLocaleString('en-GB')} cr up.`);
    let idle = createRun({ scenarioId: 'main-street', seed: 'panel-1' });
    for (let d = 0; d < 4; d++) idle = applyCommand(idle, { type: 'runDay' }).state;
    expect(overnight(idle).at(-1)).not.toContain('At this pace');
  });
});

describe('repricing for the neighbours put off by price', () => {
  it('names the price at which every one of them would buy, and they do', () => {
    let s = createRun({ scenarioId: 'main-street', seed: '1' });
    s = applyCommand(s, { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: 1200 }] }).state;
    const walkers = windowRequests(s).filter((r) => r.status === 'waiting' && reactionTo(s, r).kind === 'walk');
    const priced = walkers.filter((r) => { const x = reactionTo(s, r); return x.kind === 'walk' && x.reason === 'price'; });
    const t = priceTarget(s, walkers)!;
    expect(t.price).toBeLessThan(1200);
    const after = applyCommand(s, { type: 'setMenu', offers: [{ ...PRESETS.bespoke, price: t.price }] }).state;
    for (const r of priced) expect(reactionTo(after, r).kind).toBe('buy');
  });
});

describe('the morning noticeboard', () => {
  it('stays quiet on the first morning, then pins one line a morning, last night first', () => {
    const s = runPolicy({ scenarioId: 'main-street', seed: '2' }, GHOSTS.hand);
    expect(noticeOf(createRun({ scenarioId: 'main-street', seed: '2' }))).toBeNull();
    const mornings: string[] = [];
    runPolicy({ scenarioId: 'main-street', seed: '2' }, GHOSTS.hand, { onMorning: (x) => void (x.day > 0 && mornings.push(noticeOf(x)!)) });
    expect(mornings).toHaveLength(RULES.days - 1);
    expect(mornings.every((m) => m.length > 0)).toBe(true);
    // Last night's takeoff outranks Noor's first day on the board.
    const noor = s.resources.find((r) => r.role === 'junior')!;
    const tookOff = s.events.some((e) => e.type === 'takeoff' && e.day === noor.fromDay - 1);
    expect(tookOff).toBe(true);
    expect(mornings[noor.fromDay - 1]).toMatch(/has run out of nearly everything|now reaches the bus stop/);
  });
});

describe('the evening choice for tomorrow', () => {
  // A player who takes one buyer a morning and leaves the rest at the window, as the panel's personas often did.
  function season(): { before: CompanyState; after: CompanyState }[] {
    let s = applyCommand(createRun({ scenarioId: 'main-street', seed: '2' }), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
    const days: { before: CompanyState; after: CompanyState }[] = [];
    while (!s.finished) {
      const first = windowRequests(s).find((r) => r.status === 'waiting' && reactionTo(s, r).kind === 'buy' && fits(forecast(s, r.id)));
      if (first) s = applyCommand(s, { type: 'accept', requestId: first.id }).state;
      const after = applyCommand(s, { type: 'runDay' }).state;
      days.push({ before: s, after });
      s = after;
    }
    return days;
  }

  it('offers at most two moves, each one the engine accepts, and hiring when hours ran short', () => {
    const labels: string[] = [];
    const whys: string[] = [];
    for (const { before, after } of season()) {
      const preps = prepFor(before, after, before.day);
      expect(preps.length).toBeLessThanOrEqual(2);
      for (const p of preps) expect(applyCommand(after, p.command).error).toBeUndefined();
      if (after.finished) expect(preps).toEqual([]);
      labels.push(...preps.map((p) => p.label));
      // Her gain is put in her cost's terms: today with her in the studio, never more than walked.
      const hire = preps.find((p) => p.command.type === 'hire');
      const m = hire && /(\d+) didn't fit .*Had she been here today, (\d+) more would have fitted, worth about ([\d,]+) cr\. She starts Day \d+: [\d,]+ cr to the season's end\./.exec(hire.why);
      if (m) expect(Number(m[2])).toBeLessThanOrEqual(Number(m[1]));
      if (m) whys.push(hire!.why);
    }
    expect(labels).toContain('Hire Noor (250 cr a day)');
    expect(whys.length).toBeGreaterThan(0);
  });
});

describe('who "could have been taken"', () => {
  it('counts buyers left at the window together, in queue order, not each on their own', () => {
    // Find a morning where more buyers fit alone than fit together, leave them all at the window, and open.
    let s = applyCommand(createRun({ scenarioId: 'main-street', seed: '3' }), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
    let found = false;
    while (!s.finished && !found) {
      const alone = windowRequests(s).filter((r) => r.status === 'waiting' && reactionTo(s, r).kind === 'buy' && fits(forecast(s, r.id)));
      const together = takeableInTurn(s);
      const after = applyCommand(s, { type: 'runDay' }).state;
      if (together.length > 0 && alone.length > together.length) {
        found = true;
        const reasons = walkReasons(s, after, s.day).join('; ');
        expect(reasons).toContain(`${together.length} could have been taken`);
        expect(reasons).toContain(`${alone.length - together.length} didn't fit your hours`);
      }
      s = after;
    }
    expect(found).toBe(true);
  });
});

describe('side goal progress in the evening', () => {
  it('speaks up on the evening a counted goal moves, and stays quiet otherwise', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'goals-progress' });
    const careful = GOALS['main-street']!.find((g) => g.id === 'careful-6')!;
    let said: string | null = null;
    for (let d = 0; d < 8 && !said; d++) {
      for (const r of windowRequests(s)) if (r.segment === 'careful' && reactionTo(s, r).kind === 'buy') s = applyCommand(s, { type: 'accept', requestId: r.id }).state;
      const before = s;
      s = applyCommand(s, { type: 'runDay' }).state;
      said = goalMoved(before, s);
      if (!said) expect(careful.progress(before)).toBe(careful.progress(s));
    }
    expect(said).toMatch(/^Side goal, serve six careful voices: [1-6] of 6 delivered/);
  });
});

describe('a season heading for a loss', () => {
  it('is said plainly from the fifth morning, and not while the pace leads to profit', () => {
    let idle = createRun({ scenarioId: 'main-street', seed: 'loss-1' });
    for (let d = 0; d < 3; d++) idle = applyCommand(idle, { type: 'runDay' }).state;
    expect(lossWarning(idle)).toBeNull();
    idle = applyCommand(idle, { type: 'runDay' }).state;
    expect(lossWarning(idle)).toMatch(/^Heading for a loss: about [\d,]+ cr down by the end, earning about 0 cr a day against 920 cr a day to run\./);
    const bright = runPolicy({ scenarioId: 'main-street', seed: 'panel-1' }, GHOSTS.bright);
    const runs = bright.commands.flatMap((c, i) => (c.type === 'runDay' ? [i] : []));
    const mid = replay(bright.config, bright.commands.slice(0, runs[7]! + 1)).state;
    expect(summarize(mid).operatingResult).toBeGreaterThan(0);
    expect(lossWarning(mid)).toBeNull();
  });
});

describe('the evening before the street changes', () => {
  it('leads with the change and offers to redesign the window', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'panel-1' });
    let before = s;
    while (s.day < 4) {
      before = s;
      s = applyCommand(s, { type: 'runDay' }).state;
    }
    const [first] = insightsFor(before, s, 3, 0);
    expect(first).toMatchObject({ action: 'design', verb: 'Redesign the window' });
    expect(first!.text).toMatch(/^Tomorrow the street changes\. Market fortnight: .* More "Small and often" and "Last minute" customers will come to the window\./);
  });
});

describe('buyers who want the same', () => {
  it('fold into one row in pairs, word of mouth with walk-ins, side-goal buyers with each other', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'loss-1' }, LEGACY_RULES_VERSION);
    for (const id of takeableInTurn(s).slice(0, 3)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
    s = applyCommand(s, { type: 'runDay' }).state;
    const forecasts = new Map(windowRequests(s).filter((r) => r.status === 'waiting' && reactionTo(s, r).kind === 'buy').map((r) => [r.id, forecast(s, r.id)] as const));
    const groups = [...sameOrders(s, forecasts, null).values()].map((g) => g.map((r) => `${r.castId}:${r.source}:${r.segment}`));
    // Careful buyers count toward Main Street's side goal; the moment buyers do not, so they never share a row.
    expect(groups).toContainEqual(['malik:walkin:careful', 'wren:word:careful']);
    expect(groups.every((g) => new Set(g.map((x) => x.split(':')[2])).size === 1)).toBe(true);
  });
});

describe('a news option that adds an order', () => {
  it('says whether the order would fit before it is chosen, and options without an order say nothing', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'bookfit-1275' }, LEGACY_RULES_VERSION);
    const seen: string[] = [];
    while (!s.finished && s.day < 9) {
      for (const n of s.news.filter((x) => x.day === s.day && x.choice === null)) {
        seen.push(`${n.card}: ${orderFit(s, n, 0)} / ${orderFit(s, n, 1)}`);
        if (n.card === 'clemTen') {
          const chosen = applyCommand(s, { type: 'choose', newsId: n.id, option: 1 }).state;
          const request = chosen.requests.find(r => !s.requests.some(old => old.id === r.id))!;
          const baseline = forecast(chosen);
          const withOrder = forecast(chosen, request.id);
          expect(baseline.atRisk.length).toBeGreaterThan(0);
          expect(withOrder.atRisk).toEqual(baseline.atRisk);
          expect(withOrder.newAtRisk).toEqual([]);
          expect(withOrder.newAfterSeason).toEqual([]);
        }
        s = applyCommand(s, { type: 'choose', newsId: n.id, option: 0 }).state;
      }
      for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
      s = applyCommand(s, { type: 'runDay' }).state;
    }
    expect(seen).toContain('oscarRescue: null / As things stand it fits, with no room for a redo.');
    expect(seen).toContain('premiere: null / As things stand it would be late: it needs more hours.');
    expect(seen).toContain('clemTen: null / This order would be on time. Existing work would be late without it.');
  });
});

describe('close calls', () => {
  it('names the narrowest escape of the day: a save before a plain close shave, and nothing on a comfortable day', () => {
    const hand = runPolicy({ scenarioId: 'main-street', seed: 'maker-repin-0' }, GHOSTS.hand, {}, LEGACY_RULES_VERSION);
    expect(closeCall(hand, 3)).toBe("Close call: Juno's launch went out at 4:31pm, 29 minutes before it was due.");
    expect(closeCall(hand, 2)).toBeNull();
    const recovery = runPolicy({ scenarioId: 'main-street', seed: 'maker-repin-candidate-25' }, GHOSTS.hand, {}, LEGACY_RULES_VERSION);
    const delivered = recovery.events.filter((e) => e.day === 4 && e.type === 'delivered');
    const spare = (jobId: string) => recovery.jobs.find((j) => j.id === jobId)!.dueAt - delivered.find((e) => e.jobId === jobId)!.minute;
    expect(recovery.events).toContainEqual(expect.objectContaining({ day: 4, type: 'rework_found', jobId: 'c13-l1' }));
    expect(recovery.events.some((e) => e.day === 4 && e.jobId === 'c16-l1' && (e.type === 'rework_found' || e.type === 'snag'))).toBe(false);
    expect(spare('c13-l1')).toBe(71);
    expect(spare('c16-l1')).toBe(22);
    expect(spare('c16-l1')).toBeLessThan(spare('c13-l1'));
    expect(closeCall(recovery, 4)).toBe("Saved: Clem's launch had to be redone today and still went out at 3:49pm, 1 hour before it was due.");
  });
});

describe('the window levers', () => {
  it('price Noor on a day like today, though hiring her only adds hands from tomorrow', () => {
    let s = applyCommand(createRun({ scenarioId: 'main-street', seed: 'panel-10' }, LEGACY_RULES_VERSION), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
    for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
    s = applyCommand(s, { type: 'runDay' }).state;
    const noor = leverOptions(s, { ai: true, pace: true }).find((l) => l.id === 'hire')!;
    expect(noor.n).toBeGreaterThan(0);
    expect(noor.cost).toBe(RULES.staff.junior.dailyCost);
    const hired = applyCommand(s, noor.commands[0]!).state;
    expect(hired.resources.find((r) => r.role === 'junior')!.fromDay).toBe(s.day + 1);
    expect(takeableInTurn(hired)).toEqual(takeableInTurn(s));
  });
});

describe('an evening with nothing out', () => {
  it('says what is in the works and when the first is due, rather than calling the day quiet', () => {
    let s = createRun({ scenarioId: 'main-street', seed: 'panel-10' }, LEGACY_RULES_VERSION);
    const sentences: string[] = [];
    for (let d = 0; d < 3; d++) {
      for (const id of takeableInTurn(s).slice(0, 1)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
      const after = applyCommand(s, { type: 'runDay' }).state;
      sentences.push(eveningFacts({ before: s, after }).sentence);
      s = after;
    }
    expect(sentences[2]).toBe("Nothing went out today, but 1 launch is in the works; Wren's is due Day 5.");
  });
});

describe('missed launches at closing', () => {
  it('names each unfinished stage without attributing it to another launch being redone', () => {
    const hand = runPolicy({ scenarioId: 'main-street', seed: 'maker-repin-miss-6' }, GHOSTS.hand, {}, LEGACY_RULES_VERSION);
    expect(hand.events).toContainEqual(expect.objectContaining({ day: 6, type: 'rework_found', jobId: expect.any(String) }));
    expect(hand.jobs.find((j) => j.id === 'c22-l1')).toMatchObject({ castId: 'ines', status: 'missed', stage: 'finish', remaining: 55 });
    expect(hand.jobs.find((j) => j.id === 'c23-l1')).toMatchObject({ castId: 'ollie', status: 'missed', stage: 'produce', remaining: 47 });
    expect(missReasons(hand, 6)).toEqual(["Ines's was still being finished at closing", "Ollie's was still being made at closing"]);
  });

  it('keeps own redo/change facts and distinguishes waiting from work in progress despite tiredness', () => {
    const bright = runPolicy({ scenarioId: 'main-street', seed: 'bright-repin-candidate-152' }, GHOSTS.bright, {}, LEGACY_RULES_VERSION);
    const before = structuredClone(bright);
    expect(bright.overtimeDays).toContain(10);
    expect(bright.jobs.find((j) => j.id === 'c50-l1')).toMatchObject({ castId: 'florence', status: 'missed', stage: 'finish', remaining: 5 });
    expect(bright.jobs.find((j) => j.id === 'c52-l1')).toMatchObject({ castId: 'idris', status: 'missed', stage: 'finish', remaining: 0 });
    expect(missReasons(bright, 11)).toEqual([
      "Hugo's was still being redone at closing",
      "Florence's was still being finished at closing",
      "Idris's was waiting to be finished at closing",
      "Agnes's was waiting to be finished at closing; a change was asked for",
    ]);
    expect(bright).toEqual(before);
  });
});

describe('cash at the close', () => {
  it('warns in the last days when today\'s costs would leave the studio short, and not when it is safe', () => {
    let idle = createRun({ scenarioId: 'main-street', seed: 'loss-1' });
    while (idle.day < 8) idle = applyCommand(idle, { type: 'runDay' }).state;
    expect(cashWarning(idle)).toMatch(/^Cash: at today's costs, and selling nothing more, the studio ends about [\d,]+ cr short\. A medal needs it solvent at the close\.$/);
    const bright = runPolicy({ scenarioId: 'main-street', seed: 'panel-1' }, GHOSTS.bright);
    const runs = bright.commands.flatMap((c, i) => (c.type === 'runDay' ? [i] : []));
    expect(cashWarning(replay(bright.config, bright.commands.slice(0, runs[8]! + 1)).state)).toBeNull();
  });
});

describe('an explicit refusal at the window', () => {
  it.each([STUDIO_RULES_VERSION, CURRENT_RULES_VERSION])('%s names a regular loss only when the refusal loses them', version => {
    let s = createRun({ scenarioId: 'main-street', seed: 'panel-1' }, version);
    while (!s.finished) {
      for (const n of s.news) if (n.day === s.day && n.choice === null) s = applyCommand(s, { type: 'choose', newsId: n.id, option: 0 }).state;
      const r = windowRequests(s).find((x) => x.status === 'waiting' && isRegular(s, x.castId) && reactionTo(s, x).kind === 'buy');
      if (r) {
        const before = applyCommand(s, { type: 'decline', requestId: r.id }).state;
        const after = applyCommand(before, { type: 'runDay' }).state;
        const text = insightsFor(before, after, before.day, 0).map((i) => i.text).join(' ');
        const loss = `${CAST_BY_ID[r.castId]!.name} came back today and was turned away. Regulars who are not served do not come back.`;
        if (version === STUDIO_RULES_VERSION) {
          expect(after.lostCast).toContain(r.castId);
          expect(text).toContain(loss);
        } else {
          expect(after.lostCast).not.toContain(r.castId);
          expect(text).not.toContain(loss);
          expect(after.relationshipMemory).toContainEqual(expect.objectContaining({ castId: r.castId, kind: 'declined-before-promise', requestId: r.id }));
        }
        return;
      }
      for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
      s = applyCommand(s, { type: 'runDay' }).state;
    }
    throw new Error('no regular came back');
  });
});

describe('what an offer earns per hour', () => {
  it('sets each offer against the running cost per hour of people\'s time, and a cheap templated offer earns less before its kit', () => {
    const s = applyCommand(createRun({ scenarioId: 'main-street', seed: 'panel-1' }), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
    const r = offerRates(s)!;
    expect(r.costs).toBeGreaterThan(0);
    expect(r.earns).toHaveLength(2);
    expect(r.earns[1]!).toBeLessThan(r.earns[0]!);
    expect(r.earns.every((e) => e % 5 === 0)).toBe(true);
  });
});

describe('who makes it', () => {
  it('separates the chance of avoiding a redo from whether a redo would miss the deadline', () => {
    const s = createRun({ scenarioId: 'main-street', seed: 'maker-odds' });
    s.requests = [{ id: 'maker-buyer', day: 0, index: 0, castId: 'eli', segment: 'careful', need: 'nuanced', wtpPercent: 115, lineIndex: 0, status: 'waiting', source: 'walkin' }];
    const choices = makerChoices(s, s.requests[0]!)!;
    const ada = choices.find((m) => m.id === 'h1')!;
    const tomas = choices.find((m) => m.id === 'h2')!;
    expect(tomas.firstTime).toBeLessThan(100);
    expect(ada.firstTime).toBeGreaterThan(tomas.firstTime);
    expect(tomas.mins).toBeLessThan(ada.mins);
    expect(fits(forecast(s, 'maker-buyer', { maker: tomas.id, redo: true }))).toBe(true);
  });

  it('lets Ada take one tricky job at a time, so a second tricky buyer that morning goes to Tomas or away', () => {
    for (const seed of ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6']) {
      let s = applyCommand(createRun({ scenarioId: 'main-street', seed }), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
      for (let day = 0; day < 6; day++) {
        const tricky = windowRequests(s).filter((r) => makerChoices(s, r)?.every((m) => m.fits));
        if (tricky.length >= 2) {
          expect(makersContested(s, makerChoices(s, tricky[0]!)!)).toMatch(/^Ada takes one job at a time, and \d+ tricky briefs are waiting: choose which gets Ada\.$/);
          const t = applyCommand(s, { type: 'accept', requestId: tricky[0]!.id, maker: 'h1' }).state;
          const next = makerChoices(t, t.requests.find((r) => r.id === tricky[1]!.id)!)!;
          expect(next[0]).toMatchObject({ id: 'h1', fits: false, busyWith: expect.any(String) });
          expect(applyCommand(t, { type: 'accept', requestId: tricky[1]!.id, maker: 'h1' }).error).toBeTruthy();
          expect(applyCommand(t, { type: 'accept', requestId: tricky[1]!.id, maker: 'h2' }).error).toBeFalsy();
          return;
        }
        s = applyCommand(s, { type: 'runDay' }).state;
      }
    }
    throw new Error('no morning with two tricky buyers both could make');
  });
});

describe('a booking for tomorrow', () => {
  it('says it is one neighbour, how much of tomorrow it takes, and how many new buyers tomorrow usually brings', () => {
    for (const seed of ['panel-1', 'panel-2', 'panel-3', 'panel-4']) {
      let s = applyCommand(createRun({ scenarioId: 'main-street', seed }), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
      for (let day = 0; day < RULES.days - 2; day++) {
        const b = windowRequests(s).find((r) => r.source === 'booking');
        if (b) {
          expect(bookingLine(s, b)).toMatch(/^One neighbour towards your medal count(, \d launches)?\. About .+ of people's work in total\. Tomorrow: about .+ of their 12 hours, before new buyers\. Usually \d+ or so new buyers arrive tomorrow\. If it all goes out on time, big-night neighbours hear about it\.$/);
          expect(bookingLine(s, windowRequests(s).find((r) => r.source !== 'booking')!)).toBeNull();
          return;
        }
        s = applyCommand(s, { type: 'runDay' }).state;
      }
    }
    throw new Error('no booking rang ahead');
  });
});

describe('a booking, the day after', () => {
  it("names the booking and the hours it took on a day when buyers did not fit", () => {
    for (const seed of ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6']) {
      let s = applyCommand(createRun({ scenarioId: 'main-street', seed }), { type: 'setMenu', offers: [PRESETS.bespoke, PRESETS.launchlet] }).state;
      for (let day = 0; day < RULES.days - 2; day++) {
        const b = windowRequests(s).find((r) => r.source === 'booking' && reactionTo(s, r).kind === 'buy');
        if (b) s = applyCommand(s, { type: 'accept', requestId: b.id }).state;
        for (const id of takeableInTurn(s)) s = applyCommand(s, { type: 'accept', requestId: id }).state;
        const before = s;
        s = applyCommand(s, { type: 'runDay' }).state;
        const worked = bookingsWorked(s, day);
        if (!worked.length) continue;
        expect(worked[0]!.minutes).toBeGreaterThan(0);
        const note = insightsFor(before, s, day, 0).find((n) => n.text.includes('walked away'));
        if (note?.text.includes("didn't fit your hours")) {
          expect(note.text).toContain(`${worked[0]!.name}'s booking, taken yesterday, used about`);
          return;
        }
      }
    }
    throw new Error('no day where a booking ran and buyers did not fit');
  });
});
