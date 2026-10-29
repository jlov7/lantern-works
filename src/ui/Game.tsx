import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { flushSync } from 'react-dom';
import { RULES, phaseFor, scenarioById } from '../engine/rules';
import { applyCommand, paceOn } from '../engine/sim';
import { counterFor, fits, forecast, reactionTo, windowRequests } from '../engine/selectors';
import type { CallOption, Command, CompanyState, OfferSpec, Pace, ProjectApproach, ProjectId } from '../engine/types';
import { AI_CHANGED, aiAvailable } from './advisor';
import { ActionBar } from './game/ActionBar';
import { useClock } from './game/clock';
import { CallCard } from './game/CallCard';
import { DayLog } from './game/DayLog';
import { Evening } from './game/Evening';
import { cashWarning, dayUtil, lossWarning, overnight, type InsightAction } from './game/eveningFacts';
import { offerRates } from './game/workshopMath';
import { quickOffer } from './game/quickOffer';
import { noticeOf } from './game/noticeboard';
import { newToday, OPENS, type Opens } from './game/firstSeason';
import { GameDialogs } from './game/GameDialogs';
import { GuideContext } from './game/guideSteps';
import { GUIDE_EXIT_TARGETS } from './game/Guide';
import { NewsCard } from './game/NewsCard';
import { Planning, SHOW_PANEL, type PanelId } from './game/Planning';
import { SignStrip } from './game/SignStrip';
import { LiveRegion, Toast } from './game/Status';
import { StreetStrip } from './game/StreetStrip';
import { StudioPanel } from './game/StudioPanel';
import { TopBar } from './game/TopBar';
import { useDialogs } from './game/useDialogs';
import { useMorningPlan } from './game/useMorningPlan';
import { useGuide } from './game/useGuide';
import { usePlayback } from './game/usePlayback';
import { useAnnouncer, useShortcuts } from './game/useStatus';
import { PaceControl, WindowQueue } from './game/WindowQueue';
import { WorldView } from './game/WorldView';
import { DueNext } from './game/DueNext';
import { castName, dayLabel } from './format';
import { projectBlocked, projectBrief, projectFor } from '../engine/projects';
import { hasAuthorshipRules, hasCreativePromiseRules, hasStudioRules } from '../engine/versions';
import { approveProof, validateDesign, type CreativeIntention, type DesignSpec } from '../engine/design';
import { contractProof, ordinaryBrief } from '../engine/ordinary';
import { ordinaryDraftFor, type OrdinaryDraft } from './game/ordinaryComposition';
import { ProjectBoard, ProjectNotice, ProjectProgress, type ProjectSelection } from './game/ProjectBoard';
import { WorkPortfolio } from './game/WorkPortfolio';
import { CareerProgress } from './creative/CareerProgress';
import { DayPlan } from './game/DayPlan';
import { DeskPanel, PromisesList } from './Panels';
import { loadPrefs, loadStamps, savePrefs, PREFS_EVENT, type Prefs } from './persist';
import { midweek } from './screens/gazette';
import { GazettePage } from './screens/GazettePage';
import { GHOST_IDS, useGhosts } from './screens/ghosts';
import { GHOSTS } from '../engine/policies';
import { sounds } from './sound';
import { useSoundscape } from './useSoundscape';
import { useRun, type RunInitial, type RunMeta } from './useRun';
import { previousMorning } from './game/resumeHistory';
import { AtelierWindow } from './atelier/AtelierWindow';
import { CampaignArtwork } from './portfolio/Artwork';
import { briefFor } from './game/portfolio';
import { useReducedMotion } from './useReducedMotion';
import '../styles/workspace.css';
import '../styles/commissions.css';

/** Neighbours at the window who named their own price and have no answer yet. */
const haggling = (s: CompanyState) => windowRequests(s).filter((r) => r.status === 'waiting' && reactionTo(s, r).kind !== 'buy' && counterFor(s, r));

/** The morning the midweek paper comes out: half the season played. */
const MID = Math.floor(RULES.days / 2);

export function Game({ initial, onExit, onSeasonEnd }: { initial: RunInitial; onExit: () => void; onSeasonEnd: (s: CompanyState, meta: RunMeta) => void }): JSX.Element {
  const run = useRun(initial);
  const { state, apply, meta } = run;
  const scenario = scenarioById(state.config.scenarioId)!;
  const reducedMotion = useReducedMotion();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useEffect(() => {
    const update = () => setPrefs(loadPrefs());
    window.addEventListener(PREFS_EVENT, update);
    return () => window.removeEventListener(PREFS_EVENT, update);
  }, []);
  const [selected, setSelected] = useState<string | null>(() => windowRequests(initial.state).find(r => r.status === 'waiting')?.id ?? null);
  const [windowView, setWindowView] = useState<'customers' | 'commissions'>('customers');
  const [projectSelection, setProjectSelection] = useState<ProjectSelection>({ id: 'clem-ten', approach: null });
  const [ordinaryDrafts, setOrdinaryDrafts] = useState<Record<string, OrdinaryDraft>>({});
  const onDraft = useCallback((id: string, draft: OrdinaryDraft) => setOrdinaryDrafts(current => ({ ...current, [id]: draft })), []);
  const [chosenPlace, setPlace] = useState<'window' | 'work' | 'studio'>('window');
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const placeScroll = useRef({ window: 0, work: 0, studio: 0 });
  const undoFocus = useRef(false);
  const guideFocus = useRef<number | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const deferStudioLesson = useRef(false);
  const navigate = useCallback((destination: 'window' | 'work' | 'studio', customer = false) => {
    placeScroll.current[chosenPlace] = window.scrollY;
    setPlace(destination);
    if (customer) setPendingFocus('[data-customer-heading], .reply-receipt');
    requestAnimationFrame(() => {
      window.scrollTo({ top: placeScroll.current[destination], behavior: 'instant' });
      const target = customer ? document.querySelector<HTMLElement>('[data-customer-heading], .reply-receipt') : workspaceHeading.current;
      target?.focus({ preventScroll: true });
      if (customer) target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      else requestAnimationFrame(() => window.scrollTo({ top: placeScroll.current[destination], behavior: 'instant' }));
    });
  }, [chosenPlace]);
  const focusWindow = useCallback(() => navigate('window', true), [navigate]);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [claudeOn, setClaudeOn] = useState(aiAvailable());
  useEffect(() => {
    const on = () => setClaudeOn(aiAvailable());
    window.addEventListener(AI_CHANGED, on);
    return () => window.removeEventListener(AI_CHANGED, on);
  }, []);
  const [yesterday, setYesterday] = useState<{ people: number; ai: number | null } | null>(null);
  const dialogs = useDialogs();
  const { text: spoken, announce, clear: clearSpoken } = useAnnouncer();
  const ghosts = useGhosts(state.config, state.rulesVersion);
  const say = useCallback((msg: string | null) => msg && setToast({ text: msg, id: Date.now() }), []);
  const clearToast = useCallback(() => setToast(null), []);
  const seasonEnd = useCallback((s: CompanyState) => onSeasonEnd(s, meta), [onSeasonEnd, meta]);
  const { play, open, next, answerCall } = usePlayback({ run, reducedMotion, speed: prefs.speed, sound: prefs.sound, announce, onSeasonEnd: seasonEnd });
  const done = useClock(play?.clock ?? null, (c) => c.done);
  const held = useClock(play?.clock ?? null, (c) => c.held);
  const onAnswer = useCallback((option: CallOption) => {
    setPlace('work');
    const err = answerCall(option);
    if (err) return say(err);
    if (prefs.sound) sounds.take();
  }, [answerCall, say, prefs.sound]);
  const busy = play !== null;
  const playing = busy && !done;
  // An evening stays on screen above the next morning, whose decisions are open below it; only the season's last
  // evening, and the day while it plays, hold the morning back.
  const blocking = playing || (busy && done && play.after.finished);
  const evening = busy && done && !blocking;
  const finalEvening = blocking && done && state.finished;
  const locked = windowRequests(state).some((r) => r.status !== 'waiting');
  const guide = useGuide(meta, initial.state.commands.length === 0, locked);
  const guideApi = useMemo(() => ({ ...guide, skip: () => { setPendingFocus(guide.step === null ? null : GUIDE_EXIT_TARGETS[guide.step]!); guide.skip(); } }), [guide]);
  const place = held ? 'work' : chosenPlace;
  const [visitedWork, setVisitedWork] = useState(false);
  useEffect(() => { if (place === 'work') setVisitedWork(true); }, [place]);
  const readingEvening = !!play && done && place === 'work';
  const pendingSketch = projectSelection.approach !== null && hasAuthorshipRules(state.rulesVersion) && !state.contracts.some(contract => contract.project?.id === projectSelection.id);
  const composingProject = place === 'window' && windowView === 'commissions' && pendingSketch;
  const [planRetry, setPlanRetry] = useState(0);
  const morning = useMorningPlan(state, selected, !blocking && !state.finished, `${meta.id}:${planRetry}`, ordinaryDrafts);
  const outlook = morning.result?.outlook ?? null;
  const { startFromGesture } = useSoundscape({
    enabled: prefs.sound,
    scene: place === 'work' ? done && play ? finalEvening && state.events.some(e => e.type === 'project_completed' && e.requestId === 'project-lantern-night') ? 'gathering' : 'evening' : 'work' : windowView === 'commissions' ? 'design' : 'window',
    attention: dialogs.dialog !== null || held,
    relationship: (play && !done ? play.before : state).events.some(e => e.type === 'project_completed'),
  });
  const onUndo = useCallback(() => {
    const command = run.current().commands.at(-1);
    undoFocus.current = guide.step !== null && !!command && 'requestId' in command;
    run.undo();
    if (command && 'requestId' in command) { setSelected(command.requestId); setWindowView('customers'); setPlace('window'); setPendingFocus('[data-customer-heading], .reply-receipt'); }
    if (command?.type === 'acceptProject') { setProjectSelection({ id: command.projectId, approach: command.approach, maker: command.maker, design: command.design, sourceId: command.sourceId, reviewing: true }); setWindowView('commissions'); setPlace('window'); }
    if ((command?.type === 'accept' || command?.type === 'reserve') && command.design) setOrdinaryDrafts(current => ({ ...current, [command.requestId]: { design: command.design!, ...(command.intention ? { intention: command.intention } : {}) } }));
    announce('Undone. The previous decision is restored.');
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-customer-heading]')?.focus());
  }, [run, announce, guide.step]);
  useEffect(() => {
    if (guide.step === null) { guideFocus.current = null; return; }
    if (guide.step === 4 && deferStudioLesson.current) { deferStudioLesson.current = false; return; }
    guideFocus.current = guide.step;
    setPlace(guide.step === 4 ? 'studio' : guide.step === 3 ? 'work' : 'window');
  }, [guide.step]);
  useEffect(() => {
    const step = guideFocus.current;
    if (step === null) return;
    if ((step === 0 || step === 1) && !morning.result) return;
    const heading = undoFocus.current ? document.querySelector<HTMLElement>('[data-customer-heading]') : step === 3 ? document.getElementById('evening-h') : step === 2 ? document.querySelector<HTMLElement>('.reply-receipt') ?? document.getElementById(`guide-step-${step}`) : document.getElementById(`guide-step-${step}`);
    if (!heading) return;
    heading.focus({ preventScroll: true });
    (step === 3 ? heading : heading.closest('.coach'))?.scrollIntoView({ block: 'start', behavior: 'instant' });
    undoFocus.current = false;
    guideFocus.current = null;
  }, [guide.step, place, morning.result]);
  useEffect(() => {
    if (pendingFocus === null) return;
    for (const selector of pendingFocus.split(',')) {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target || target.matches(':disabled')) continue;
      target.focus();
      if (document.activeElement === target) { setPendingFocus(null); return; }
    }
    // A pending plan can temporarily disable Open. Honour the handoff when ready unless the player moves on.
    const cancel = () => setPendingFocus(null);
    const movedFocus = (event: FocusEvent) => { if (event.target instanceof HTMLElement && event.target.matches('button, input, select, textarea, a[href], summary')) cancel(); };
    document.addEventListener('pointerdown', cancel, { once: true });
    document.addEventListener('keydown', cancel, { once: true });
    document.addEventListener('focusin', movedFocus);
    return () => { document.removeEventListener('pointerdown', cancel); document.removeEventListener('keydown', cancel); document.removeEventListener('focusin', movedFocus); };
  }, [pendingFocus, morning.result, place]);
  useEffect(() => { if (held || (busy && done)) setPlace('work'); }, [held, busy, done]);
  const playedDay = (blocking || readingEvening) && play ? Math.floor(play.before.minute / RULES.minutesPerDay) : state.day;
  const { show } = dialogs;

  const openWorkshop = useCallback((slot: number) => show({ kind: 'workshop', slot }), [show]);
  const designForWalkers = useCallback(() => {
    const s = run.current();
    // Once anyone has been answered the sign is up for the day: say so rather than open a workshop that cannot save.
    if (windowRequests(s).some((r) => r.status !== 'waiting')) return say("The sign is up for today. Redesign tomorrow morning, or undo this morning's answers first.");
    openWorkshop(s.menu.length < RULES.maxMenu ? s.menu.length : -1);
  }, [openWorkshop, run, say]);
  const onAccept = useCallback((id: string, counter?: boolean, maker?: string, design?: DesignSpec, intention?: CreativeIntention) => {
    const x = reactionTo(run.current(), run.current().requests.find((r) => r.id === id)!);
    // Commit at once so the folded ticket's focus moves on in the same task, never resting on the page.
    const err = flushSync(() => apply({ type: 'accept', requestId: id, ...(counter ? { counter: true as const } : {}), ...(maker ? { maker } : {}), ...(design ? { design } : {}), ...(intention ? { intention } : {}) }));
    if (err) return say(err);
    if (prefs.sound) {
      sounds.take();
      if ((x.kind === 'buy' && x.price > 0) || counter) sounds.coin();
    }
    setSelected(id);
    setPendingFocus('.reply-receipt');
    announce(`${castName(run.current().requests.find(r => r.id === id)!.castId)}: taken. Undo is available. Choose Next customer when ready.`);
  }, [apply, say, prefs.sound, run, announce]);
  const onReserve = useCallback((id: string, startsInDays: 1 | 2, design?: DesignSpec, intention?: CreativeIntention) => {
    const err = flushSync(() => apply({ type: 'reserve', requestId: id, startsInDays, ...(design ? { design } : {}), ...(intention ? { intention } : {}) }));
    if (err) return say(err);
    setSelected(id);
    setPendingFocus('.reply-receipt');
    announce(`${castName(run.current().requests.find(request => request.id === id)!.castId)} reserved studio capacity. Undo is available.`);
    if (prefs.sound) sounds.coin();
  }, [apply, say, announce, run, prefs.sound]);
  const onAcceptProject = useCallback((projectId: ProjectId, approach: ProjectApproach, maker?: string, design?: DesignSpec, sourceId?: string) => {
    const err = flushSync(() => apply({ type: 'acceptProject', projectId, approach, ...(maker ? { maker } : {}), ...(design ? { design } : {}), ...(sourceId ? { sourceId } : {}) }));
    if (err) return say(err);
    announce('Commission booked. The waiting customers and due promises have been updated. Undo is available.');
    if (prefs.sound) sounds.coin();
  }, [apply, say, announce, prefs.sound]);
  const openProjects = useCallback(() => {
    placeScroll.current[chosenPlace] = window.scrollY;
    flushSync(() => { setWindowView('commissions'); setPlace('window'); });
    const target = document.getElementById('project-quote-h') ?? document.querySelector<HTMLElement>('.project-receipt') ?? document.getElementById('project-board-h');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [chosenPlace]);
  const openInvitation = useCallback((id: ProjectId) => {
    setProjectSelection({ id, approach: null });
    openProjects();
  }, [openProjects]);
  const returnCustomer = useCallback(() => { setWindowView('customers'); focusWindow(); }, [focusWindow]);
  const onDecline = useCallback((id: string) => {
    const err = flushSync(() => apply({ type: 'decline', requestId: id }));
    if (err) return say(err);
    if (prefs.sound) sounds.decline();
    setSelected(id);
    setPendingFocus('.reply-receipt');
    announce('Customer turned away. Undo is available. Choose Next customer when ready.');
  }, [apply, say, prefs.sound, announce]);
  const declineAll = useCallback((ids: string[]) => {
    flushSync(() => {
      for (const id of ids) apply({ type: 'decline', requestId: id });
    });
    if (prefs.sound) sounds.decline();
    setSelected(ids.at(-1) ?? null);
    setPendingFocus('.reply-receipt');
    announce(`${ids.length} requests declined. Undo restores one reply at a time until you open.`);
  }, [apply, prefs.sound, announce]);
  const onSelect = useCallback((id: string) => {
    setSelected(id);
    setWindowView('customers');
    setPlace('window');
    setPendingFocus('[data-customer-heading], .reply-receipt');
    requestAnimationFrame(() => {
      const target = document.getElementById(`tn-${id}`) ?? document.querySelector<HTMLElement>('.reply-receipt');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  }, []);
  const takeAll = useCallback(() => {
    const ids: string[] = [];
    flushSync(() => {
      for (const request of windowRequests(run.current())) {
        const current = run.current();
        const draft = ordinaryDraftFor(current, request.id, ordinaryDrafts[request.id]);
        if (request.status !== 'waiting' || reactionTo(current, request).kind !== 'buy' || !fits(forecast(current, request.id, draft))) continue;
        if (!apply({ type: 'accept', requestId: request.id, ...draft })) ids.push(request.id);
      }
    });
    if (prefs.sound) sounds.coin();
    setSelected(ids.at(-1) ?? null);
    setPendingFocus('.reply-receipt');
  }, [apply, run, prefs.sound, ordinaryDrafts]);
  const takeSome = useCallback((ids: string[]) => {
    flushSync(() => {
      for (const id of ids) {
        const current = run.current();
        const draft = ordinaryDraftFor(current, id, ordinaryDrafts[id]);
        if (fits(forecast(current, id, draft))) apply({ type: 'accept', requestId: id, ...draft });
      }
    });
    if (prefs.sound) sounds.coin();
    setSelected(ids.at(-1) ?? null);
    setPendingFocus('.reply-receipt');
  }, [apply, run, prefs.sound, ordinaryDrafts]);
  const doCommand = useCallback((c: Command) => void say(apply(c)), [apply, say]);
  const onQuickOffer = useCallback(() => {
    const offer = quickOffer(run.current());
    if (!offer) return;
    const err = flushSync(() => apply(offer.command));
    if (err) return say(err);
    focusWindow();
  }, [apply, run, say, focusWindow]);
  const onReprice = useCallback(
    (i: number, price: number) => doCommand({ type: 'setMenu', offers: run.current().menu.map((o, k) => (k === i ? { ...o, price } : o)) }),
    [doCommand, run],
  );
  const onLevers = useCallback((commands: Command[]) => {
    for (const c of commands) {
      const err = apply(c);
      if (err) return say(err);
    }
    if (!document.querySelector('.queue-comparison[open]')) setPendingFocus('[data-customer-heading], .reply-receipt');
    // Hiring is the one lever that does nothing today: say when it starts, so the buyers still waiting make sense.
    if (commands.some((c) => c.type === 'hire')) say(`${RULES.staff.junior.name} is hired: she starts tomorrow, ${RULES.staff.junior.dailyCost} cr a day.`);
  }, [apply, say]);
  const onPace = useCallback((pace: Pace) => doCommand({ type: 'pace', pace }), [doCommand]);
  const onChoose = useCallback((newsId: string, option: number) => {
    const before = run.current();
    const err = flushSync(() => apply({ type: 'choose', newsId, option }));
    if (err) return say(err);
    setPendingFocus('[data-customer-heading], .reply-receipt, #window-h');
    const request = run.current().requests.find((r) => !before.requests.some((old) => old.id === r.id));
    if (!request) {
      requestAnimationFrame(() => { const heading = document.querySelector<HTMLElement>('[data-customer-heading], .reply-receipt') ?? document.getElementById('window-h'); heading?.focus(); });
      return;
    }
    flushSync(() => { setSelected(request.id); setWindowView('customers'); setPlace('window'); });
    const ticket = document.getElementById(`tn-${request.id}`);
    ticket?.focus({ preventScroll: true });
    ticket?.closest('.ticket')?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [apply, run, say, reducedMotion]);
  const onRemove = useCallback((i: number) => doCommand({ type: 'setMenu', offers: run.current().menu.filter((_, k) => k !== i) }), [doCommand, run]);
  const onSaveOffer = useCallback((o: OfferSpec, slot: number) => {
    const offers = [...run.current().menu];
    offers[slot] = o;
    const err = apply({ type: 'setMenu', offers });
    say(err);
    return err;
  }, [apply, run, say]);

  const openDay = useCallback(() => {
    if (!morning.result) return;
    const before = run.current();
    // Each morning's street news is a decision: the shop opens once it has an answer.
    if (before.news.some((n) => n.day === before.day && n.choice === null)) {
      flushSync(() => { setWindowView('customers'); setPlace('window'); });
      document.getElementById('pending-news')?.querySelector<HTMLElement>('h3')?.focus();
      return say('Street news first: choose an answer on the card, then open the shop.');
    }
    // Someone who named their own price gets an answer, never silence: opening turns down any not yet taken, and
    // the button says so before it is pressed.
    for (const r of haggling(before)) apply({ type: 'decline', requestId: r.id });
    // Opening the next morning puts last evening away.
    if (play) {
      next();
      clearSpoken();
      deferStudioLesson.current = true;
      guide.reach(4);
    }
    const err = open();
    if (err) return say(err);
    setYesterday(dayUtil(before, run.current()));
    setSelected(null);
    setWindowView('customers');
    setPlace('work');
    guide.reach(3);
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [apply, open, next, play, clearSpoken, run, say, guide, reducedMotion, morning.result]);
  const goNext = useCallback((then?: () => void) => {
    next();
    clearSpoken();
    deferStudioLesson.current = true;
    guide.reach(4);
    setWindowView('customers');
    setPlace('window');
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      if (then) then();
      else document.getElementById('window-h')?.focus({ preventScroll: true });
    });
  }, [next, guide, clearSpoken]);
  const onNext = useCallback(() => goNext(), [goNext]);
  const onInsight = useCallback((a: InsightAction) => {
    if (a === 'books') return show({ kind: 'books' });
    if (a === 'hire') {
      const err = apply({ type: 'hire' });
      if (err) return say(err);
      const noor = run.current().resources.find((r) => r.role === 'junior' && r.name === RULES.staff.junior.name);
      return say(`${RULES.staff.junior.name} is hired: she starts ${noor ? dayLabel(noor.fromDay) : 'tomorrow'}, ${RULES.staff.junior.dailyCost} cr a day.`);
    }
    if (a === 'design') return designForWalkers();
    const id: PanelId = a === 'studio' || a === 'patterns' ? 'studio' : a === 'desk' ? 'desk' : 'promises';
    flushSync(() => setPlace('studio'));
    window.dispatchEvent(new CustomEvent(SHOW_PANEL, { detail: id }));
    requestAnimationFrame(() => {
      const el = document.getElementById(a === 'patterns' ? 'patterns-h' : id);
      el?.scrollIntoView({ block: 'start' });
      (a === 'patterns' ? el : el?.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true });
    });
  }, [designForWalkers, show, apply, say, run]);
  const onPrep = useCallback((c: Command) => void say(apply(c)), [apply, say]);
  const onHourByHour = useCallback(() => play?.clock.rewind(), [play]);
  const onPrefs = useCallback((p: Prefs) => { startFromGesture(p.sound); savePrefs(p); setPrefs(p); }, [startFromGesture]);

  // The evening leads with the work that just left the studio, before the next morning's plan.
  // (After the season's last evening the bar's way on takes focus instead.)
  useEffect(() => {
    if (!busy || !done) return;
    const h = document.getElementById('evening-h');
    if (evening) h?.focus({ preventScroll: true });
    h?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [busy, done, evening]);
  // Picking a neighbour in the miniature brings their ticket into view.
  useEffect(() => {
    if (selected) document.getElementById(`ticket-${selected}`)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [selected, reducedMotion]);
  useEffect(() => {
    document.title = state.finished && !playing ? `Season over, ${scenario.name} - Lantern Works` : `${dayLabel(playedDay)} of ${RULES.days}, ${scenario.name} - Lantern Works`;
  }, [playedDay, state.finished, playing, scenario.name]);
  useShortcuts({
    ' ': composingProject || readingEvening ? undefined : () => (playing ? play?.clock.pause(!play.clock.get().paused) : !blocking && !state.finished && openDay()),
    s: () => playing && play?.clock.skip(),
    Enter: () => (blocking || readingEvening) && done && onNext(),
    w: () => !blocking && !locked && !state.finished && openWorkshop(0),
  });

  const news = state.news.find((n) => n.day === state.day);
  // Once per morning: it replays the season up to last night.
  const lastNight = useMemo(() => overnight(state, previousMorning(state, run.history)), [state.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const notice = useMemo(() => noticeOf(state), [state.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const losing = useMemo(() => lossWarning(state), [state.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const shortOfCash = cashWarning(state);
  const rates = useMemo(() => offerRates(state), [state]);
  // The season's running tally of who left and why, from the third morning: the end screen should not be the first
  // place a player learns that most of the street did not fit their hours.
  const tally = useMemo(() => {
    const lost = morning.result?.lost;
    if (!lost) return null;
    const n = lost.reduce((a, r) => a + r.neighbours, 0);
    return n ? `${n} neighbours have left without a launch: ${lost.slice(0, 3).map((r) => `${r.neighbours} ${r.reason}`).join('; ')}.` : null;
  }, [morning.result]);
  // Until a season has been finished, the studio's systems open over the first mornings.
  const [opens] = useState<Opens>(() => (loadStamps().includes('first-season') ? null : OPENS));
  const currentCustomer = windowRequests(state).find(r => r.id === selected) ?? windowRequests(state).find(r => r.status === 'waiting');
  const currentReaction = currentCustomer ? reactionTo(state, currentCustomer) : null;
  const currentCounter = currentCustomer?.status === 'waiting' ? counterFor(state, currentCustomer) : null;
  const currentContract = currentCustomer?.contractId ? state.contracts.find(c => c.id === currentCustomer.contractId) : undefined;
  const currentOffer = currentContract?.offer ?? (currentReaction?.kind === 'buy' ? currentReaction.offer : currentCounter ? state.menu[currentCounter.offerIndex] : undefined);
  const currentBrief = currentCustomer && currentOffer && currentCustomer.status === 'waiting' && hasCreativePromiseRules(state.rulesVersion) ? ordinaryBrief(currentCustomer, currentOffer) : null;
  const currentProof = currentContract ? contractProof(currentContract) : currentBrief ? approveProof(currentBrief, ordinaryDrafts[currentCustomer!.id]?.design ?? currentBrief.defaultDesign).proof : undefined;
  const proofBrief = composingProject ? projectBrief(state, projectSelection.id, projectSelection.approach!, projectSelection.sourceId) : null;
  const proofDecision = proofBrief ? { reviewing: projectSelection.reviewing ?? false, blocked: !!projectBlocked(state, projectSelection.id, projectSelection.approach!, projectSelection.sourceId), invalid: validateDesign(proofBrief, projectSelection.design ?? proofBrief.defaultDesign).length > 0, onReturn: returnCustomer } : undefined;
  const windowScene = hasAuthorshipRules(state.rulesVersion) ? <AtelierWindow state={state} request={currentCustomer ?? null} reducedMotion={reducedMotion} onInspect={focusWindow} artwork={currentCustomer ? <CampaignArtwork brief={briefFor(currentCustomer, currentOffer, state.config, currentProof, state.rulesVersion)} miniature /> : undefined} /> : <><WorldView state={state} play={null} selected={selected} onSelect={onSelect} reducedMotion={reducedMotion} /><DueNext state={state} /></>;
  const planningMessage = <><p role="status">{morning.error ?? 'Checking the studio’s hours and promises…'}</p>{morning.error && <button type="button" className="btn" onClick={() => setPlanRetry(n => n + 1)}>Check the plan again</button>}</>;
  const queueSnapshot = morning.retained;
  const queue = queueSnapshot ? (
    <WindowQueue plan={queueSnapshot.plan} pending={morning.result ? undefined : planningMessage} updatingProof={morning.draftPending} onReserve={onReserve} scene={windowScene} onUndo={onUndo} canUndo={run.canUndo && !blocking && !!morning.result} state={queueSnapshot.state} forecasts={queueSnapshot.plan.forecasts} selected={queueSnapshot.selected} disabled={blocking || !morning.result} locked={locked} onAccept={onAccept} ordinaryDrafts={ordinaryDrafts} onDraft={onDraft} onDecline={onDecline} onSelect={onSelect} onTakeAll={takeAll} onTakeSome={takeSome} onDeclineAll={declineAll} onDesign={designForWalkers} onQuickOffer={onQuickOffer} onLevers={onLevers} onReprice={onReprice} onPace={onPace} outlook={outlook} paceOpen={!opens || state.day >= opens.pace} aiOpen={!opens || state.day >= opens.ai} flyersOpen={!opens || state.day >= opens.flyers} rivals={ghosts ? GHOST_IDS.map((id) => ({ label: GHOSTS[id].label, served: ghosts[id].served[state.day - 1] ?? 0 })) : null} />
  ) : <section className="queue workspace-queue" aria-label="Morning plan"><div className="window-scene">{windowScene}</div>{planningMessage}</section>;
  const opening = newToday(opens, state.day);
  // The midweek paper, once, on the morning the season turns; rivals as they stood at last night's close.
  const midPaper = useMemo(
    () => (state.day === MID && !state.finished ? midweek(state, ghosts ? GHOST_IDS.map((id) => ({ label: GHOSTS[id].label, served: ghosts[id].served[MID - 1] ?? 0 })) : null) : null),
    [state.day, ghosts], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const phase = phaseFor(scenario, Math.min(state.day, RULES.days - 1));

  return (
    <GuideContext.Provider value={guideApi}>
      <div className={`game${playing ? ' is-playing' : ''}${composingProject ? ' is-composing' : ''}${readingEvening ? ' is-evening' : ''}`}>
        <TopBar
          state={state}
          play={blocking || readingEvening ? play : null}
          street={scenario.name}
          branch={meta.branchDay !== undefined}
          claudeOn={claudeOn}
          speed={prefs.speed}
          sound={prefs.sound}
          reduced={reducedMotion}
          onExit={onExit}
          onBooks={() => show({ kind: 'books' })}
          onKey={dialogs.showKey}
          onSettings={() => show({ kind: 'settings' })}
        >
          {initial.meta.readOnly && <div className="banner banner-action"><p role="status">{meta.readOnly ? 'Replay preview. Changes here are not saved. Save a copy to keep this season and your next moves in this browser.' : 'Copy saved in this browser. Your next moves will save automatically.'}</p>{meta.readOnly && <button type="button" className="btn" onClick={run.keepCopy}>Save a copy and continue</button>}</div>}
          {!run.storageOk && <p className="banner" role="status">This browser could not save your latest moves. Previously saved seasons remain stored. Keep this tab open to retain the moves since the last successful save.</p>}
          {run.saved === 'stale' && <p className="banner">This season continued in another tab. Moves here are no longer saved; reopen it from the street map.</p>}
          {state.cash < 0 && !state.finished && <p className="banner banner-bad">The studio is overdrawn. Wages still go out each morning; promises still have to be kept.</p>}
        </TopBar>

        <main className={`stage workspace-stage place-${place}`}>
          <h1 className="vh" tabIndex={-1} data-screen-heading>Lantern Works, {scenario.name}, {dayLabel(playedDay)}</h1>
          <a className="skip-link" href="#workspace-heading" onClick={event => { event.preventDefault(); workspaceHeading.current?.focus(); }}>Skip to the current workspace</a>
          <h2 ref={workspaceHeading} tabIndex={-1} className="vh" id="workspace-heading">{place === 'window' ? 'Window: customer decisions' : place === 'work' ? 'Work: promises and production' : 'Studio: change the business'}</h2>
          {place === 'window' && <section className="workspace-place" aria-label="Window">
            {blocking ? <p>The studio is working. <button type="button" className="btn" onClick={() => navigate('work')}>Watch the work</button></p> : <>
              {!composingProject && news?.choice === null && <div id="pending-news"><p className="pending-news">Street news needs your answer before opening.</p><NewsCard state={state} news={news} disabled={false} onChoose={onChoose} /></div>}
              {!composingProject && <div className="window-tools"><button type="button" className="due-link" onClick={() => navigate('work')}>{state.jobs.filter(j => (j.status === 'active' || j.status === 'scheduled') && j.dueAt <= (state.day + 1) * RULES.minutesPerDay).length} launches due tonight · See Work</button>{hasStudioRules(state.rulesVersion) && <ProjectNotice state={state} onOpen={openProjects} sketch={pendingSketch ? projectBrief(state, projectSelection.id, projectSelection.approach!, projectSelection.sourceId).title : undefined} />}</div>}
              {windowView === 'commissions' && hasStudioRules(state.rulesVersion) ? <ProjectBoard selection={projectSelection} onSelection={setProjectSelection} state={state} disabled={blocking} onAccept={onAcceptProject} onReturn={returnCustomer} customer={currentCustomer ? castName(currentCustomer.castId) : undefined} onUndo={onUndo} canUndo={run.canUndo && !blocking} /> : queue}
              {!composingProject && <details className="morning-notes"><summary>Morning notes</summary>
                {news && news.choice !== null && <NewsCard state={state} news={news} disabled onChoose={onChoose} />}
                {lastNight.map(line => <p key={line}>{line}</p>)}{tally && <p>{tally}</p>}{notice && <p>{notice}</p>}{phase.note && phase.fromDay === state.day && <p>{phase.note}</p>}
                {losing && <p className="risk risk-warn">{losing}</p>}{shortOfCash && <p className="risk risk-warn">{shortOfCash}</p>}{midPaper && <GazettePage paper={midPaper} id="gz-mid" className="gazette-mid" />}
              </details>}
            </>}
          </section>}
          {(place === 'work' || visitedWork) && <section className="workspace-place work-place" aria-label="Work" hidden={place !== 'work'} style={place !== 'work' ? { display: 'none' } : undefined}>
            {place === 'work' && play && done && <Evening play={play} live={state} ghosts={ghosts} reducedMotion={reducedMotion} onAction={onInsight} onHourByHour={onHourByHour} onInvitation={!finalEvening ? openInvitation : undefined} canHire={!applyCommand(state, { type: 'hire' }).error} onPrep={onPrep} opens={opens} extra={<>{tally && <p className="small tally">Season so far: {tally}</p>}{notice && evening && <p className="small notice">On the noticeboard: {notice}</p>}</>} />}
            <div className="world-col"><div className="world-wrap"><WorldView state={state} play={play} selected={selected} onSelect={onSelect} reducedMotion={reducedMotion} illustrated={prefs.studioView === 'illustrated'} /></div></div>
            {place === 'work' && <>
            {play && held && play.after.call && <CallCard state={play.after} onAnswer={onAnswer} />}
            {play && !done && <DayLog play={play} />}
            {hasStudioRules(state.rulesVersion) && <ProjectProgress state={state} play={play} onOpen={openProjects} />}
            {!blocking && !readingEvening && <><DueNext state={state} />{selected && windowRequests(state).some(r => r.id === selected && r.status === 'waiting') && <p className="considering">Considering {castName(state.requests.find(r => r.id === selected)!.castId)}. This is a preview; no order has been taken.</p>}<DayPlan state={state} considering={selected && windowRequests(state).some(r => r.id === selected && r.status === 'waiting') ? selected : null} calendar={morning.result?.calendar ?? null} /><PromisesList state={state} evening={false} /></>}
            <WorkPortfolio state={state} play={play} onFeature={pieceIds => apply({ type: 'featurePieces', pieceIds })} onUndo={onUndo} canUndo={run.canUndo && state.commands.at(-1)?.type === 'featurePieces'} disabled={meta.readOnly || blocking || run.saved === 'stale'} />
            </>}
          </section>}
          {place === 'studio' && <section className="workspace-place studio-place" aria-label="Studio">
            <h2>Change the studio</h2>
            {(currentCustomer || pendingSketch) && <button type="button" className="btn return-customer" onClick={pendingSketch || windowView === 'commissions' ? openProjects : focusWindow}>Return to {pendingSketch || windowView === 'commissions' ? projectFor(state, projectSelection.id).name : castName(currentCustomer!.castId)}</button>}
            {blocking ? <p>Business changes reopen in the morning.</p> : <>
              <SignStrip menu={state.menu} disabled={false} locked={locked} onEdit={openWorkshop} onRemove={onRemove} compact={state.day > 0} rates={rates} />
              {(!opens || state.day >= opens.pace) && <PaceControl pace={paceOn(state, state.day)} disabled={false} onPace={onPace} />}
              {opening && <p className="new-today">New today: {opening}</p>}
              {!(opens && state.day < opens.studio) && <Planning panels={{ studio: <StudioPanel state={state} disabled={false} apply={doCommand} opens={opens} hint={morning.result?.studioHint ?? null} />, desk: <DeskPanel state={state} yesterday={yesterday} disabled={false} apply={doCommand} aiFrom={opens?.ai ?? null} />, street: opens && state.day < opens.street ? null : <StreetStrip state={state} />, promises: <PromisesList state={state} evening={false} /> }} />}
            </>}
            <CareerProgress state={state} />
          </section>}
        </main>
        <ActionBar planning={!blocking && !morning.result} proofDecision={proofDecision} place={place} onPlace={navigate} onReview={focusWindow} day={playedDay} finished={state.finished} play={blocking || readingEvening ? play : null} canUndo={run.canUndo && !blocking} onUndo={onUndo} onOpen={openDay} onNext={onNext} outlook={blocking || readingEvening ? null : outlook} newsWaiting={!blocking && !!news && news.choice === null} haggling={blocking ? 0 : haggling(state).length} />
        <LiveRegion text={spoken} />
        <Toast message={toast} onDone={clearToast} />
        <GameDialogs
          {...dialogs}
          state={state}
          booksState={play && !done ? play.before : state}
          prefs={prefs}
          onSaveOffer={onSaveOffer}
          onOpenKey={dialogs.showKey}
          onKeyClosed={() => setClaudeOn(aiAvailable())}
          onPrefs={onPrefs}
          onReplayGuide={guide.restart}
        />
      </div>
    </GuideContext.Provider>
  );
}
