import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import { flushSync } from 'react-dom';
import { RULES, scenarioById } from './engine/rules';
import { supportsRulesVersion } from './engine/versions';
import type { CompanyState, RunConfig } from './engine/types';
import { connectBridge } from './ui/advisor';
import { decodeShare, loadRuns } from './ui/persist';
import { replayFingerprint, resumeRun } from './ui/resume';
import type { SavedRun } from './ui/schema';
import { Title } from './ui/Title';
import { branchFrom, startRun, type RunInitial, type RunMeta } from './ui/useRun';
import './styles/screens.css';

/** RunMeta plus a hint for the game screen: start the guided first day. */
export type GameMeta = RunMeta & { guided?: boolean };

// The end-of-season screen (chart, postcard, ghosts, endings) is loaded only when a season ends, and warmed in
// the background while one is being played, so it stays out of the first load.
let endModule: typeof import('./ui/EndScreen') | null = null;
// The game screen is loaded once the title has painted (or as soon as a season starts), so the first load is the title.
let gameModule: typeof import('./ui/Game') | null = null;
const loadGame = () => import('./ui/Game').then((m) => (gameModule = m));
const loadEnd = () => import('./ui/EndScreen').then((m) => (endModule = m));
/** Bumped on every navigation, so an end screen that finishes loading after the player went elsewhere is dropped. */
let navSeq = 0;

type Screen = { kind: 'title'; notice: string | null } | { kind: 'resuming'; run: SavedRun } | { kind: 'game'; run: RunInitial } | { kind: 'end'; state: CompanyState; meta: RunMeta };

function clearHash(): void {
  const url = new URL(location.href);
  url.hash = '';
  history.replaceState(history.state, '', url.href);
}

const reduceMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The document title for a screen. The game screen keeps it current as days pass; this is its first value. */
function screenTitle(screen: Screen): string {
  if (screen.kind === 'title') return 'Lantern Works';
  if (screen.kind === 'resuming') return 'Reading your season - Lantern Works';
  if (screen.kind === 'end') return 'Season over - Lantern Works';
  const s = screen.run.state;
  const street = scenarioById(s.config.scenarioId)?.name ?? 'The street';
  return `Day ${Math.min(s.day, RULES.days - 1) + 1} of ${RULES.days}, ${street} - Lantern Works`;
}

export function App(): JSX.Element | null {
  const [screen, setScreenNow] = useState<Screen>({ kind: 'title', notice: null });
  const mounted = useRef(true);
  const pendingResume = useRef<(() => void) | null>(null);
  const cancelNavigation = useCallback(() => {
    ++navSeq;
    pendingResume.current?.();
    pendingResume.current = null;
  }, []);

  // Screen changes cross-fade where the browser supports view transitions, and never under reduced motion.
  const setScreen = useCallback(function go(next: Screen): void {
    if (!mounted.current) return;
    cancelNavigation();
    const seq = navSeq;
    if (next.kind === 'end' && !endModule) return void loadEnd().then(() => seq === navSeq && go(next));
    if (next.kind === 'game' && !gameModule) return void loadGame().then(() => seq === navSeq && go(next));
    // A prefetch only: if it fails (offline), the real load on reaching the end screen tries again.
    if (next.kind === 'game') setTimeout(() => void loadEnd().catch(() => undefined), 4000);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
    if (typeof doc.startViewTransition !== 'function' || reduceMotion()) return setScreenNow(next);
    // The browser skips the animation (and rejects these) when the tab is hidden or another transition starts.
    // The screen still changes, so the rejection is not an error.
    const t = doc.startViewTransition(() => {
      if (mounted.current && seq === navSeq) flushSync(() => setScreenNow(next));
    });
    t.ready.catch(() => undefined);
    t.finished.catch(() => undefined);
  }, [cancelNavigation]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingResume.current?.();
      pendingResume.current = null;
    };
  }, []);

  // Dev server only: route AI requests through the developer's subscription if the bridge answers.
  useEffect(() => {
    void connectBridge();
  }, []);

  // Warm the game screen once the title has painted. A prefetch only: starting a season loads it again if this fails.
  useEffect(() => {
    const t = setTimeout(() => void loadGame().catch(() => undefined), 300);
    return () => clearTimeout(t);
  }, []);

  // Replays carry moves; #start carries a continuing studio's exact opening state.
  // Handled on load and whenever the hash changes, so a link followed inside an open tab still works.
  useEffect(() => {
    const handle = () => {
      const h = location.hash;
      cancelNavigation();
      const seq = navSeq;
      if (h.startsWith('#s=') || h.startsWith('#start=')) {
        const challenge = h.startsWith('#start=');
        void decodeShare(h.slice(challenge ? 7 : 3))
          .then((r) => {
            if (!mounted.current || seq !== navSeq) return;
            clearHash();
            if (!r.ok) return setScreen({ kind: 'title', notice: r.reason });
            if (challenge) {
              if (r.payload.commands.length) return setScreen({ kind: 'title', notice: 'A studio challenge must start before any moves have been made.' });
              return setScreen({ kind: 'game', run: startRun(r.payload.config, `Challenge: ${r.payload.name ?? 'a studio'}`, r.payload.rules) });
            }
            const meta: RunMeta = { id: `shared-${Date.now()}`, label: `Shared: ${r.payload.name ?? 'a season'}`, readOnly: true };
            setScreen(r.state.finished ? { kind: 'end', state: r.state, meta } : { kind: 'game', run: { state: r.state, meta } });
          })
          .catch(() => {
            if (!mounted.current || seq !== navSeq) return;
            clearHash();
            setScreen({ kind: 'title', notice: 'This link could not be opened in this browser.' });
          });
      } else if (h.startsWith('#play=')) {
        let scen: string | undefined;
        let seed: string | undefined;
        let rulesVersion: string | undefined;
        try {
          [scen, seed, rulesVersion] = h.slice(6).split(':').map(decodeURIComponent);
        } catch {
          scen = undefined;
        }
        clearHash();
        if (scen && seed && scenarioById(scen) && seed.length <= 40 && (!rulesVersion || supportsRulesVersion(rulesVersion))) setScreen({ kind: 'game', run: startRun({ scenarioId: scen, seed }, `Challenge: ${scenarioById(scen)!.name}`, rulesVersion) });
        else setScreen({ kind: 'title', notice: 'That challenge link is not a street this build knows.' });
      } else {
        setScreen({ kind: 'title', notice: null });
      }
    };
    if (location.hash) handle();
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, [setScreen, cancelNavigation]);

  const start = useCallback(
    (config: RunConfig, label: string, opts?: { guided?: boolean; rulesVersion?: string }) => {
      const run = startRun(config, label, opts?.rulesVersion);
      setScreen({ kind: 'game', run: opts?.guided ? { ...run, meta: { ...run.meta, guided: true } } : run });
    },
    [setScreen],
  );
  const resume = useCallback(
    (r: SavedRun) => {
      setScreen({ kind: 'resuming', run: structuredClone(r) });
    },
    [setScreen],
  );

  useEffect(() => {
    if (screen.kind !== 'resuming') return;
    const r = screen.run;
    const fingerprint = replayFingerprint(r);
    const seq = navSeq;
    let live = true;
    let cancel = () => {};
    let secondFrame = 0;
    // Let the loading screen paint before even starting the no-Worker fallback.
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (!live || seq !== navSeq) return;
        const task = resumeRun(r);
        cancel = task.cancel;
        pendingResume.current = cancel;
        void task.promise.then(async (rebuilt) => {
          if (!live || seq !== navSeq) return;
          if (!rebuilt) return setScreen({ kind: 'title', notice: 'That save no longer replays on this version, so it was left untouched.' });
          await (rebuilt.state.finished ? loadEnd() : loadGame());
          if (!live || seq !== navSeq) return;
          const current = loadRuns().find((saved) => saved.id === r.id);
          if (!current || replayFingerprint(current) !== fingerprint) return setScreen({ kind: 'title', notice: 'That season changed or was removed while it was being read. Please open it again.' });
          const meta: RunMeta = { id: current.id, label: current.label, ...(current.parentId ? { parentId: current.parentId } : {}), ...(current.branchDay !== undefined ? { branchDay: current.branchDay } : {}) };
          const { state, history } = rebuilt;
          setScreen(state.finished ? { kind: 'end', state, meta } : { kind: 'game', run: { state, meta, history } });
        }).catch((error: unknown) => {
          if (!live || seq !== navSeq || (error instanceof DOMException && error.name === 'AbortError')) return;
          setScreen({ kind: 'title', notice: error instanceof Error ? error.message : 'This season could not be read. Please try again.' });
        });
      });
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      cancel();
      if (pendingResume.current === cancel) pendingResume.current = null;
    };
  }, [screen, setScreen]);

  // Back returns to the title instead of leaving the game; successfully saved moves remain available.
  // Entering a run from the title pushes one history entry; moving between run screens replaces it.
  const kind = screen.kind;
  const prevKind = useRef<Screen['kind']>('title');
  useEffect(() => {
    const was = prevKind.current;
    prevKind.current = kind;
    if (kind === 'title' || kind === was) return;
    if (was === 'title') history.pushState({ lantern: kind }, '');
    else history.replaceState({ lantern: kind }, '');
  }, [kind]);
  useEffect(() => {
    const onPop = () => setScreen({ kind: 'title', notice: null });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setScreen]);

  const home = useCallback(() => {
    cancelNavigation();
    // Leave through history so a later Back press does not land on a stale run entry.
    if ((history.state as { lantern?: string } | null)?.lantern) history.back();
    else setScreen({ kind: 'title', notice: null });
  }, [setScreen, cancelNavigation]);

  // The title is set before the game screen's own effects run, so the game can keep it current from there.
  useLayoutEffect(() => {
    document.title = screenTitle(screen);
  }, [screen]);

  // Each screen starts at the top, and focus moves to its heading so keyboard and screen reader users land on it.
  // The first screen after load keeps the browser's own starting focus.
  const first = useRef(true);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (first.current) {
      first.current = false;
      return;
    }
    const h = document.querySelector<HTMLElement>('[data-screen-heading]') ?? document.querySelector<HTMLElement>('main h1, h1, main h2');
    if (!h) return;
    if (!h.hasAttribute('tabindex')) h.tabIndex = -1;
    h.focus({ preventScroll: true });
  }, [screen]);

  if (screen.kind === 'resuming') return (
    <main className="title" id="main" aria-busy="true">
      <h1 tabIndex={-1} data-screen-heading>Reading your season</h1>
      <p role="status">Opening {screen.run.label}.</p>
      <button type="button" className="btn" onClick={home}>Cancel</button>
    </main>
  );
  if (screen.kind === 'game') return !gameModule ? null : <gameModule.Game key={screen.run.meta.id} initial={screen.run} onExit={home} onSeasonEnd={(state, meta) => setScreen({ kind: 'end', state, meta })} />;
  if (screen.kind === 'end')
    return !endModule ? null : (
      <endModule.EndScreen
        key={screen.meta.id}
        state={screen.state}
        meta={screen.meta}
        onBranch={(day, state, meta) => setScreen({ kind: 'game', run: branchFrom(state, meta, day) })}
        onNewSeason={() => start(screen.state.config, screen.meta.label.replace(/ \(branch.*\)$/, '').replace(/^Shared: .*/, scenarioById(screen.state.config.scenarioId)?.name ?? 'Season'), { rulesVersion: screen.state.rulesVersion })}
        onContinue={(config, rulesVersion) => start(config, `Lantern Works · Season ${config.continuation!.season}`, { rulesVersion })}
        onHome={home}
      />
    );
  return <Title onStart={start} onResume={resume} notice={screen.notice} onDismissNotice={() => setScreen({ kind: 'title', notice: null })} />;
}
