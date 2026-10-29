import { describe, expect, it } from 'vitest';
import { CAST, SPECIAL_CAST, PRESETS, RULES } from '../../engine/rules';
import { GHOSTS, runPolicy } from '../../engine/policies';
import { applyCommand, createRun, replay } from '../../engine/sim';
import { reactionTo } from '../../engine/selectors';
import type { Command, CompanyState, Request } from '../../engine/types';
import { frameAt } from '../timeline';
import ordinary from './fixtures/ordinary-order-intake.json';
import { BRIEF_IDENTITIES, artifactLabel, briefFor, portfolioAt, projectSceneAt, seriesLabel, workFor } from './portfolio';
import { CURRENT_RULES_VERSION, LEGACY_RULES_VERSION } from '../../engine/versions';
import { APPROACHES, PROJECTS, nightCalendar, projectBrief, projectRecords } from '../../engine/projects';
import { advanceStudy, milestoneStudy, nightStudy, preparedStudy } from '../portfolio/study';
import type { ProjectApproach, ProjectId } from '../../engine/types';

const request = (castId: string, lineIndex = 0): Request => ({ id: 'r', day: 0, index: 0, castId, segment: 'moment', need: 'nuanced', wtpPercent: 100, lineIndex, status: 'waiting', source: 'walkin' });
const commands = ordinary.commands as Command[];
const season = replay(ordinary.config, commands, LEGACY_RULES_VERSION).state;
function apply(state: CompanyState, command: Command): CompanyState {
  const result = applyCommand(state, command);
  expect(result.error).toBeUndefined();
  return result.state;
}

describe('authored launch briefs', () => {
  it('labels a recurring bakery series with its own customer’s business', () => {
    expect(seriesLabel(briefFor(request('rosa')).castId, 2, 3)).toBe('Rosa Bakes series · 02 / 03');
    expect(seriesLabel(briefFor(request('mara')).castId, 1, 3)).toBe('Moonrise Bakery series · 01 / 03');
  });
  it('intentionally covers every line for every actual cast member', () => {
    expect(Object.keys(BRIEF_IDENTITIES).sort()).toEqual([...CAST, ...SPECIAL_CAST].map(c => c.id).sort());
    for (const cast of [...CAST, ...SPECIAL_CAST]) {
      expect(BRIEF_IDENTITIES[cast.id]!.lines).toHaveLength(cast.lines.length);
      for (const [lineIndex, line] of cast.lines.entries()) {
        const brief = briefFor({ ...request(cast.id, lineIndex), segment: cast.segment });
        expect(brief.request).toBe(line);
        expect(brief.headline.length).toBeGreaterThan(6);
        expect(brief.subject).toBeTruthy();
      }
    }
    expect(briefFor(request('clem')).subject).toBe('saxophone');
    expect(briefFor(request('hugo')).family).toBe('artisan');
    expect(briefFor(request('wren')).family).toBe('sleeve');
  });

  it('maps news line zero to its actual fixed brief instead of the ordinary first visit', () => {
    const cases = [
      ['mara', "Mara's regular", 'A season at Moonrise', 'mara'],
      ['eli', 'Second opening', 'The curtain rises again', 'eli'],
      ['hugo', 'A quiet send-off', 'The next pair of hands', 'hugo'],
      ['clem', 'Ten years of Clem', 'Ten years of Clem', 'clem'],
      ['oscar', 'Tap takeover rescue', 'Tonight, the taps are ours', 'oscar'],
      ['association', 'Summer street party', 'Summer on our street', 'party'],
    ];
    for (const [castId, name, headline, story] of cases) {
      const brief = briefFor({ ...request(castId!), source: 'news', offer: { ...PRESETS.bespoke, name: name! } });
      expect(brief.headline).toBe(headline);
      expect(brief.story).toBe(story);
      expect(brief.request.length).toBeGreaterThan(50);
    }
    for (const castId of ['eli', 'mina', 'clem', 'yara']) {
      const brief = briefFor({ ...request(castId), source: 'news', offer: { ...PRESETS.bespoke, name: 'Premiere rush' } });
      expect(brief.detail).toMatch(/same-day|today/);
      expect(brief.request).not.toBe(CAST.find(c => c.id === castId)!.lines[0]);
    }
  });
});

describe('the delivered portfolio', () => {
  it('keeps the temp’s name on delivered work after the next opening removes them', () => {
    let state = createRun({ scenarioId: 'main-street', seed: 'e2e-1' });
    state = apply(state, { type: 'setMenu', offers: [PRESETS.launchlet, PRESETS.bespoke] });
    state = apply(state, { type: 'temp' });
    for (const r of state.requests.filter(r => r.day === 0 && r.status === 'waiting')) if (reactionTo(state, r).kind === 'buy') state = apply(state, { type: 'accept', requestId: r.id });
    state = apply(state, { type: 'runDay' });
    expect(state.resources.find(r => r.id === 't0')?.name).toBe(RULES.staff.temp.name);
    expect(state.events.some(e => e.type === 'task_start' && e.resourceId === 't0')).toBe(true);
    for (let day = 1; day < 5; day++) state = apply(state, { type: 'runDay' });
    expect(state.resources.some(r => r.id === 't0')).toBe(false);
    expect(portfolioAt(state).find(p => p.jobId === 'c2-l1')!.route).toContain(`Briefed by ${RULES.staff.temp.name}`);
    expect(portfolioAt(state).find(p => p.jobId === 'c2-l1')!.route).not.toContain('t0');
  });

  it('keeps Noor and Remi in the credits after letting Noor go and the student placement ends', () => {
    let state = createRun({ scenarioId: 'festival-week', seed: 'portfolio-departures' });
    state.news = [{ id: 'student', day: 0, card: 'student', choice: null }];
    state = apply(state, { type: 'setMenu', offers: [PRESETS.launchlet, PRESETS.bespoke] });
    state = apply(state, { type: 'hire' });
    state = apply(state, { type: 'temp' });
    state = apply(state, { type: 'choose', newsId: 'student', option: 1 });
    for (let day = 0; day < 7; day++) {
      if (day === 4) state = apply(state, { type: 'letGo', resourceId: 'j1' });
      for (const r of state.requests.filter(r => r.day === state.day && r.status === 'waiting')) if (reactionTo(state, r).kind === 'buy') state = apply(state, { type: 'accept', requestId: r.id });
      state = apply(state, { type: 'runDay' });
    }
    for (const [id, name] of [['j1', RULES.staff.junior.name], ['st0', RULES.staff.student.name]]) {
      expect(state.resources.some(r => r.id === id)).toBe(false);
      const start = state.events.find(e => e.type === 'task_start' && e.resourceId === id && state.jobs.find(j => j.id === e.jobId)?.status === 'delivered')!;
      expect(start).toBeDefined();
      const route = portfolioAt(state).find(p => p.jobId === start.jobId)!.route;
      expect(route).toContain(name);
      expect(route).not.toContain(id);
    }
  });
  it('keeps Clem off the street until the exact delivery minute and reconstructs its working subject', () => {
    const job = season.jobs.find(j => j.id === 'c15-l1')!;
    expect(job.deliveredAt).toBe(3442);
    expect(portfolioAt(season, 3441).some(p => p.jobId === job.id)).toBe(false);
    const piece = portfolioAt(season, 3442).find(p => p.jobId === job.id)!;
    expect(piece.brief.headline).toBe('Ten years of Clem');
    expect(piece.brief.subject).toBe('saxophone');
    expect(piece.day).toBe(7);
    expect(piece.route).toContain('Made by Tomas');
    let before = createRun(ordinary.config, LEGACY_RULES_VERSION);
    for (const command of commands) {
      if (command.type === 'runDay' && before.day === 7) break;
      before = applyCommand(before, command).state;
    }
    const frame = frameAt(before, season, 3441);
    const folder = frame.folders.find(f => f.jobId === job.id)!;
    expect(folder.stage).toBe('finish');
    expect(workFor(season, [folder.jobId], 3441)[0]!.brief).toEqual(piece.brief);
    expect(portfolioAt(season, 3840).find(p => p.jobId === job.id)).toEqual(piece);
  });

  it('uses frozen terms and the actual counter price after the menu changes', () => {
    const counter = season.contracts.find(c => c.price !== c.offer.price)!;
    expect(counter).toBeDefined();
    const piece = portfolioAt(season).find(p => p.contractId === counter.id)!;
    expect(piece.offer).toEqual(counter.offer);
    expect(piece.price).toBe(counter.price);
    expect(piece.price).not.toBe(counter.offer.price);
  });

  it('does not attribute production to a preferred maker who did not start it', () => {
    const state = structuredClone(season);
    const job = state.jobs.find(j => j.id === 'c15-l1')!;
    job.maker = 'h1';
    const piece = portfolioAt(state).find(p => p.jobId === job.id)!;
    expect(piece.route).toContain('Made by Tomas');
    expect(piece.route).not.toContain('Made by Ada');
    expect(workFor(state, [job.id], 0)[0]!.route).toBe('Production has not started');
  });

  it('keeps a recurring order partial until its last delivered launch, and excludes misses and refunds', () => {
    const run = runPolicy({ scenarioId: 'festival-week', seed: 'portfolio' }, GHOSTS.bright);
    const state = replay(run.config, run.commands).state;
    const recurring = state.contracts.find(c => c.offer.launches > 1 && c.jobIds.filter(id => state.jobs.find(j => j.id === id)!.deliveredAt !== null).length > 1)!;
    expect(recurring).toBeDefined();
    const jobs = state.jobs.filter(j => j.contractId === recurring.id && j.deliveredAt !== null).sort((a, b) => a.deliveredAt! - b.deliveredAt!);
    const first = portfolioAt(state, jobs[0]!.deliveredAt!).find(p => p.jobId === jobs[0]!.id)!;
    expect(first.deliveredInOrder).toBe(1);
    expect(first.complete).toBe(false);
    expect(first.launches).toBe(recurring.offer.launches);
    expect(portfolioAt(state).every(p => state.jobs.find(j => j.id === p.jobId)!.status === 'delivered')).toBe(true);
    for (const status of ['missed', 'refunded']) for (const job of season.jobs.filter(j => j.status === status)) expect(portfolioAt(season).some(p => p.jobId === job.id)).toBe(false);
  });

  it('reconstructs identically from a reloaded tape and a branch prefix without future deliveries', () => {
    expect(portfolioAt(replay(ordinary.config, JSON.parse(JSON.stringify(commands)), LEGACY_RULES_VERSION).state)).toEqual(portfolioAt(season));
    const prefix = commands.findIndex(c => c.type === 'accept' && c.requestId === 'd5-n');
    const branch = replay(ordinary.config, commands.slice(0, prefix), LEGACY_RULES_VERSION).state;
    expect(portfolioAt(branch).some(p => p.brief.story === 'clem')).toBe(false);
    expect(portfolioAt(branch)).toEqual(portfolioAt(season, branch.minute));
  });

  it('leaves a recurring order partial after both a missed launch and a closing refund', () => {
    const run = runPolicy({ scenarioId: 'festival-week', seed: 'portfolio' }, { ...GHOSTS.bright, menu: [PRESETS.club], accept: 'all', news: 'default' });
    const state = replay(run.config, run.commands).state;
    const contract = state.contracts.find(c => c.jobIds.map(id => state.jobs.find(j => j.id === id)!.status).join(',') === 'delivered,missed,refunded')!;
    expect(contract).toBeDefined();
    const pieces = portfolioAt(state).filter(p => p.contractId === contract.id);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ launch: 1, launches: 3, deliveredInOrder: 1, complete: false });
    expect(portfolioAt(state).some(p => p.jobId === contract.jobIds[1] || p.jobId === contract.jobIds[2])).toBe(false);
  });
});

describe('commission artwork and event scenes', () => {
  it('keeps the approved headline, palette and customer copy in work, delivery, replay and minute previews', () => {
    const config = { scenarioId: 'main-street', seed: 'first-season' };
    let state = createRun(config);
    for (const command of [{ type: 'accept', requestId: 'd0-r0' }, { type: 'runDay' }, { type: 'runDay' }] as Command[]) state = apply(state, command);
    const brief = projectBrief(state, 'clem-ten', 'new-band');
    const design = structuredClone(brief.defaultDesign);
    design.pieces[0]!.headline = 'The room is still ours';
    design.pieces[0]!.palette = 'river';
    design.pieces[0]!.treatment = 'third-ink';
    state = apply(state, { type: 'acceptProject', projectId: 'clem-ten', approach: 'new-band', design });
    const contract = state.contracts.at(-1)!;
    const proof = structuredClone(contract.project!.proof!);
    expect(proof.design).toEqual(design);
    expect(proof.pieces[0]!.copy).toEqual(brief.pieces[0]!.copy);
    expect(workFor(state, contract.jobIds, state.minute)[0]!.brief.proof).toEqual(proof);
    for (let day = state.day; day < 5; day++) state = apply(state, { type: 'runDay' });
    const job = state.jobs.find(job => job.contractId === contract.id)!;
    expect(job.status).toBe('delivered');
    expect(portfolioAt(state, job.deliveredAt! - 1).some(piece => piece.contractId === contract.id)).toBe(false);
    expect(workFor(state, contract.jobIds, job.deliveredAt! - 1)[0]!.brief.proof).toEqual(proof);
    const delivered = portfolioAt(state, job.deliveredAt!).find(piece => piece.contractId === contract.id)!;
    expect(delivered.brief.proof).toEqual(proof);
    const reloaded = replay(config, JSON.parse(JSON.stringify(state.commands)), CURRENT_RULES_VERSION);
    expect(reloaded.errors).toEqual([]);
    expect(portfolioAt(reloaded.state).find(piece => piece.contractId === contract.id)!.brief.proof).toEqual(proof);
    expect(projectSceneAt(reloaded.state, job.deliveredAt!).milestones[0]!.pieces[0]!.brief.proof).toEqual(proof);
  });

  it('uses project identity for every approach, independently of the offer name', () => {
    const headlines = new Set<string>();
    for (const [id, definition] of Object.entries(PROJECTS)) for (const approach of definition.approaches) {
      const r: Request = { ...request(definition.castId), source: 'project', project: { id: id as ProjectId, approach }, offer: { ...PRESETS.bespoke, name: 'An unrelated window name' } };
      const brief = briefFor(r);
      expect(brief.project).toEqual(r.project);
      expect(brief.request).toContain(APPROACHES[approach].detail);
      headlines.add(brief.headline);
    }
    expect(headlines.size).toBe(8);
    expect(briefFor({ ...request('clem'), offer: { ...PRESETS.bespoke, name: APPROACHES['first-night'].name } }).project).toBeUndefined();
  });

  it.each([
    ['clem-ten', 'first-night'], ['clem-ten', 'new-band'], ['mara-regular', 'weekly-rhythm'],
    ['mara-regular', 'market-debut'], ['hugo-handover', 'quiet-sendoff'], ['hugo-handover', 'open-bench'],
  ] as [ProjectId, ProjectApproach][])('installs %s / %s only after the last actual delivery', (id, approach) => {
    const state = milestoneStudy(id, approach);
    expect(state.rulesVersion).toBe(CURRENT_RULES_VERSION);
    const record = projectRecords(state)[0]!;
    expect(record.status).toBe('delivered');
    expect(record.contract.project!.proof!.design.pieces).toHaveLength(record.promised);
    expect(projectSceneAt(state, record.completedAt! - 1).milestones).toHaveLength(0);
    const installed = projectSceneAt(state, record.completedAt!).milestones[0]!;
    expect(installed.record.approach).toBe(approach);
    expect(installed.pieces).toHaveLength(record.promised);
    expect(installed.pieces.every(p => p.brief.project?.approach === approach)).toBe(true);
  });

  it.each(['main-street', 'festival-week', 'bespoke-rush'])('keeps the %s event date and actual work package visible', scenarioId => {
    const state = nightStudy(scenarioId, 'trail');
    const cal = nightCalendar(state);
    const record = projectRecords(state).find(p => p.id === 'lantern-night')!;
    expect(record.status).toBe('delivered');
    expect(projectSceneAt(state, record.completedAt!).night).toMatchObject({ mode: 'ready', day: cal.day });
    const scene = projectSceneAt(state, (cal.day + 1) * RULES.minutesPerDay);
    expect(scene.night.mode).toBe('delivered');
    expect(scene.night.pieces).toHaveLength(scenarioId === 'bespoke-rush' ? 2 : 3);
    const artifacts = scene.night.pieces.map(p => artifactLabel(p.brief, p.launch));
    expect(new Set(artifacts).size).toBe(scene.night.promised);
    expect(artifacts).toEqual(scenarioId === 'bespoke-rush' ? ['Open studios invitation', 'Open studios catalogue'] : scenarioId === 'festival-week' ? ['The lantern walk programme', 'The lantern walk map', 'The lantern walk sign'] : ['Lantern Night programme', 'Lantern Night map', 'Lantern Night sign']);
    expect(scene.night.pieces[0]!.brief.event).toMatchObject({ name: cal.name, day: cal.day, careful: cal.careful });
    expect(scene.night.contributors.every(p => record.contract.project!.contributors.includes(p.brief.project!.id))).toBe(true);
  });

  it('shows only the printed parts of a partial Festival trail', () => {
    const state = nightStudy('festival-week', 'partial');
    const scene = projectSceneAt(state);
    expect(scene.night).toMatchObject({ mode: 'partial', promised: 3 });
    expect(scene.night.pieces).toHaveLength(2);
    expect(scene.night.label).toContain('programme unfinished');
    expect(scene.night.pieces.every(p => state.jobs.find(j => j.id === p.jobId)?.status === 'delivered')).toBe(true);
  });

  it('keeps unaccepted work in the studio window without inventing an event or contributors', () => {
    const state = nightStudy('main-street', 'window');
    const scene = projectSceneAt(state);
    expect(scene.night).toMatchObject({ mode: 'window', approach: null, promised: 0, contributors: [] });
    expect(scene.night.pieces.length).toBeGreaterThan(0);
    expect(scene.night.pieces.every(p => p.brief.project?.id !== 'lantern-night')).toBe(true);
  });

  it('displays an original artifact after a declined change without crediting the lost contribution', () => {
    let state = preparedStudy();
    state = apply(state, { type: 'acceptProject', projectId: 'clem-ten', approach: 'first-night', design: projectBrief(state, 'clem-ten', 'first-night').defaultDesign });
    state = apply(state, { type: 'acceptProject', projectId: 'hugo-handover', approach: 'quiet-sendoff', design: projectBrief(state, 'hugo-handover', 'quiet-sendoff').defaultDesign });
    const job = state.jobs.at(-1)!;
    state.call = { jobId: job.id, minute: state.minute, cause: 'snag', minutes: 90 };
    job.snag = 90;
    state = apply(state, { type: 'answer', option: 'cut' });
    state = advanceStudy(state, 7);
    state = apply(state, { type: 'acceptProject', projectId: 'lantern-night', approach: 'courtyard', design: projectBrief(state, 'lantern-night', 'courtyard').defaultDesign });
    const scene = projectSceneAt(advanceStudy(state, 12));
    const hugo = scene.milestones.find(p => p.record.id === 'hugo-handover')!;
    expect(hugo.record).toMatchObject({ status: 'compromised', earned: false });
    expect(hugo.pieces).toHaveLength(1);
    expect(scene.night.contributors.some(p => p.castId === 'hugo')).toBe(false);
  });
});
