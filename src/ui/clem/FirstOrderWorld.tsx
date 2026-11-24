import { Component, Suspense, lazy, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref, type PointerEvent } from 'react';
import { firstOrderBrief, type FirstOrder } from '../game/firstOrder';
import { firstOrderBayPoster, firstOrderRoom, type FirstOrderStage } from '../game/firstOrderScene';
import { CAMERA_MS, signaturePose, signatureTargets, type Shot } from '../game/signatureCamera';
import { signatureChannel, signatureTime, type SignatureState, type SignatureSurface } from '../game/signatureState';
import { leaverPose, type Bay } from '../game/signatureTargets';
import { hitTest, project, type TargetId } from '../game/worldProjection';
import type { PrintSource, PrintTextures, TextureOwner } from '../miniature/ArtworkTextures';
import { signatureSize } from '../miniature/signatureRig';
import { useRendererChoice } from '../miniature/useRendererChoice';
import { BEAT_MS, COMMIT_MS, PRESS_MS, REDUCED_BEAT_MS, SPRING_MS, worldTrackPx } from '../game/pressPull';
import { pressAudioFromGesture, playPressSounds } from '../pressSounds';
import { usePressGesture } from './usePressGesture';
import { haptic } from '../haptics';
import '../../styles/signature-stage.css';

const ArtworkTextures = lazy(() => import('../miniature/ArtworkTextures').then(module => ({ default: module.ArtworkTextures })));
const WorkerCanvas = lazy(() => import('../miniature/WorkerMiniatureCanvas'));
const MainCanvas = lazy(() => import('../miniature/MiniatureCanvas'));
const empty: PrintTextures = new Map();
const noTargets: ReturnType<typeof signatureTargets> = [];
const bays = ['room', 'band'] as const;
const tagWidth = 44;

class StageBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export interface WorldPressHandle {
  commitPress: (trusted: boolean) => boolean;
  focusEdition: (bay: Bay | null) => void;
  scrollToStage: () => void;
}
type Departures = { turnedAwayIds: string[]; turnedAway: string[] };
export type WorldComparison = {
  prints: Record<Bay, PrintSource>;
  departures: Departures;
  leaverBays: FirstOrderStage['leaverBays'];
};
const COMPARE_PAUSE_MS = 300;
type Beat = 'idle' | 'queued' | 'dragging' | 'committing' | 'moving' | 'leaving' | 'done';
type BayPress = { bay: Bay; pointer: number; x: number; y: number; at: number };
type Press = { departures: Departures; progress: number; audio: ReturnType<typeof pressAudioFromGesture> };

interface Props {
  draft: FirstOrder;
  reducedMotion: boolean;
  holdIllustration: boolean;
  children: ReactNode;
  delivered: PrintSource | null;
  otherDelivered: PrintSource | null;
  windowCloseup: boolean;
  compactRead: boolean;
  comparison: WorldComparison | null;
  renderWindow: (worldView: boolean) => ReactNode;
  renderStreet: (worldView: boolean) => ReactNode;
  onSelectEdition: (bay: Bay, trusted: boolean) => void;
  onWindowView: (worldView: boolean) => void;
  onIllustrated: (value: boolean) => void;
  onCompactLayout: (compact: boolean) => void;
  onPressStart: () => Departures | null;
  onPressEnd: () => void;
  onDepartures: (names: string[]) => void;
  ref?: Ref<WorldPressHandle>;
}
export default function FirstOrderWorld({
  draft, reducedMotion, holdIllustration, children, delivered, otherDelivered, windowCloseup, compactRead, comparison, renderWindow, renderStreet, onSelectEdition,
  onWindowView, onIllustrated, onCompactLayout, onPressStart, onPressEnd, onDepartures, ref,
}: Props) {
  const [failed, setFailed] = useState(false);
  const [painted, setPainted] = useState(false);
  const [warmup, setWarmup] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [textures, setTextures] = useState<PrintTextures>(empty);
  const [artworkDraft, setArtworkDraft] = useState(draft);
  const [committed, setCommitted] = useState<PrintTextures>(empty);
  const [signature] = useState(() => signatureChannel(reducedMotion));
  const [moving, setMoving] = useState(false);
  const [activeWalk, setActiveWalk] = useState<WorldComparison | null>(null);
  const [beat, setBeat] = useState<Beat>('idle');
  const [override, setOverride] = useState<Shot>();
  const [departures, setDepartures] = useState<Departures>();
  const timers = useRef<number[]>([]);
  const queued = useRef<Press | null>(null);
  const afterShot = useRef<(() => void) | null>(null);
  const tagNodes = useRef(new Map<string, HTMLSpanElement>());
  const finished = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0, overlay: 0 });
  const host = useRef<HTMLElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const owner = useRef<TextureOwner>(null);
  const hoverFrame = useRef(0);
  const bayPress = useRef<BayPress | null>(null);

  const fail = useCallback(() => setFailed(true), []);
  const reset = useCallback(() => {
    setPainted(false);
    setWarmup(0);
    setTextures(empty);
    setCommitted(empty);
  }, []);
  const { choice, workerFailed } = useRendererChoice(fail, reset);
  const miniature = choice === 'miniature' && !failed;
  const windowActive = draft.step === 'window';
  const comparing = windowActive && !!comparison;
  const comparisonKeys = useMemo(() => comparison && { room: comparison.prints.room.key, band: comparison.prints.band.key }, [comparison]);
  const compareWalk = comparison?.departures;
  const streetActive = draft.step === 'street';
  useEffect(() => {
    const delay = window.setTimeout(() => setArtworkDraft(previous => bays.every(bay =>
      firstOrderBayPoster(previous, bay).key === firstOrderBayPoster(draft, bay).key) ? previous : draft), 250);
    return () => clearTimeout(delay);
  }, [draft]);
  const renderedDraft = draft.step === 'design' ? artworkDraft : draft;
  const deliveredKey = delivered?.key;
  const windowKey = windowActive && painted && deliveredKey && textures.has(deliveredKey) && committed.get(deliveredKey) === textures.get(deliveredKey) ? deliveredKey : undefined;
  const windowShot = windowKey && windowCloseup && !comparing ? 'read' : 'street';
  const { scene, stage: originalStage } = useMemo(() => firstOrderRoom(draft, draft.step, {
    deliveredKey, ...(comparisonKeys && { compare: comparisonKeys, leavers: compareWalk?.turnedAwayIds, leaverBays: comparison?.leaverBays }),
  }), [draft, deliveredKey, comparisonKeys, compareWalk, comparison]);
  const stage = useMemo<FirstOrderStage>(() => {
    const visibleKey = (bay: Bay) => [...textures.keys()].find(key => key.startsWith(`edition:${bay}:`)) ?? originalStage.bayPosters![bay];
    const bayPosters = { room: visibleKey('room'), band: visibleKey('band') };
    if (windowActive) return { ...originalStage, bayPosters, shot: windowShot, compactRead };
    return {
      ...originalStage, bayPosters,
      shot: draft.step === 'lift' ? 'street' : override ?? originalStage.shot,
      leavers: departures?.turnedAwayIds ?? originalStage.leavers,
    };
  }, [originalStage, textures, windowActive, windowShot, compactRead, draft.step, override, departures]);
  const patch = useCallback((value: Partial<Omit<SignatureState, 'seq'>>) => {
    const input = signature.update(value);
    const root = host.current;
    if (!root) return;
    if (value.hover !== undefined) root.dataset.worldHover = input.hover ?? '';
    if (value.pressed !== undefined) root.dataset.worldPressed = input.pressed ?? '';
    if (value.focus !== undefined) root.dataset.worldFocus = input.focus ?? '';
    if (value.pull !== undefined) root.dataset.pull = input.pull.toFixed(2);
  }, [signature]);
  const previous = useRef(stage.shot);
  const choose = stage.shot === 'choose';
  const selectingBay = choose || comparing;
  const other = stage.selected === 'room' ? 'band' : 'room';

  useEffect(() => {
    const refresh = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  useLayoutEffect(() => {
    const narrow = window.matchMedia('(max-width: 700px)');
    const update = () => onCompactLayout(miniature && choose && narrow.matches);
    update();
    narrow.addEventListener('change', update);
    return () => narrow.removeEventListener('change', update);
  }, [miniature, choose, onCompactLayout]);

  useLayoutEffect(() => {
    if (!miniature || !canvasHost.current) return;
    const canvas = canvasHost.current;
    const overlay = host.current?.querySelector<HTMLElement>('.clem-proof');
    const measure = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const taken = choose && overlay && window.innerWidth > 700 ? overlay.getBoundingClientRect().width : 0;
      setSize(current => current.width === width && current.height === height && current.overlay === taken ? current : { width, height, overlay: taken });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    if (overlay) observer.observe(overlay);
    measure();
    return () => observer.disconnect();
  }, [miniature, choose]);

  useLayoutEffect(() => {
    const from = previous.current;
    const to = stage.shot;
    previous.current = to;
    const change = signature.read();
    const now = signatureTime();
    const needsHang = !comparing && windowKey !== undefined && change.hang?.key !== windowKey;
    if (from === to && change.reduced === reducedMotion && !needsHang && !change.move) return;
    const move: SignatureState['move'] = reducedMotion ? null : from !== to ? { from, to, at: now } : change.move;
    setMoving(!!move);
    patch({ reduced: reducedMotion, hover: null, pressed: null, move });
    const arrive = () => {
      const next = afterShot.current;
      afterShot.current = null;
      if (next) next();
      else patch({ move: null, ...(needsHang ? { hang: { key: windowKey, at: signatureTime() } } : {}) });
      setMoving(false);
    };
    if (move) {
      const clear = window.setTimeout(arrive, Math.max(0, CAMERA_MS - (now - move.at)));
      return () => clearTimeout(clear);
    }
    arrive();
  }, [reducedMotion, stage.shot, comparing, windowKey, patch, signature]);

  useLayoutEffect(() => {
    if (!comparing) return;
    patch({ leaveAt: null });
    return () => { patch({ leaveAt: null }); };
  }, [comparing, patch]);
  useEffect(() => {
    if (!comparing || moving || !compareWalk?.turnedAway.length) return;
    let finish: number | undefined;
    const start = window.setTimeout(() => {
      patch({ leaveAt: signatureTime() });
      setActiveWalk(comparison);
      const length = reducedMotion ? 1200 : BEAT_MS.walk + (compareWalk.turnedAwayIds.length - 1) * BEAT_MS.stagger;
      finish = window.setTimeout(() => setActiveWalk(null), length);
    }, reducedMotion ? 0 : COMPARE_PAUSE_MS);
    return () => { clearTimeout(start); clearTimeout(finish); };
  }, [comparison, comparing, moving, compareWalk, reducedMotion, patch]);

  const sources = useMemo<PrintSource[]>(() => {
    const copy = firstOrderBrief.pieces[0]!.copy;
    const label = firstOrderBrief.title;
    return [...bays.map(bay => ({
      ...firstOrderBayPoster(renderedDraft, bay), copy, label,
    })), ...(delivered ? [delivered] : []), ...(otherDelivered ? [otherDelivered] : [])];
  }, [renderedDraft, delivered, otherDelivered]);
  const publish = useCallback((value: PrintTextures) => {
    if (value.size === sources.length) setTextures(value);
  }, [sources]);
  const commit = useCallback((value: PrintTextures) => {
    owner.current?.committed(value);
    setCommitted(value);
  }, []);
  const paint = useCallback(() => setPainted(true), []);
  const acknowledge = useCallback((seq: number) => {
    if (!host.current) return;
    host.current.dataset.worldAck = String(seq);
    const input = signature.read();
    if (seq >= input.seq && input.hang) host.current.dataset.worldHung = input.hang.key;
  }, [signature]);
  const fit = useMemo(() => {
    if (!size.width || !size.height) return { targets: [], overlay: 0, degraded: false };
    const withOverlay = (overlay: number) => {
      const dimensions = signatureSize(size.width, size.height, overlay);
      return signatureTargets(stage.shot, signaturePose(stage.shot, dimensions, stage.selected), dimensions, comparing ? other : undefined);
    };
    let overlay = choose ? size.overlay : 0;
    let targets = withOverlay(overlay);
    if (choose && overlay && !targets.length) {
      overlay = 0;
      targets = withOverlay(overlay);
    }
    return { targets, overlay, degraded: choose && targets.length !== 2 };
  }, [choose, comparing, other, size.width, size.height, size.overlay, stage.shot, stage.selected]);
  const ready = miniature && !holdIllustration && painted && warmup > 0 && committed === textures && textures.size === sources.length && !moving;
  const framed = comparing && !ready ? noTargets : fit.targets;
  const Canvas = !workerFailed && typeof OffscreenCanvas !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype
    ? WorkerCanvas : MainCanvas;
  const hover = (id: SignatureSurface | null) => {
    cancelAnimationFrame(hoverFrame.current);
    if (signature.read().hover === id) return;
    hoverFrame.current = requestAnimationFrame(() => patch({ hover: id }));
  };
  useEffect(() => () => cancelAnimationFrame(hoverFrame.current), []);
  const show = miniature && !holdIllustration && painted;
  useLayoutEffect(() => { onIllustrated(choice === 'illustrated' || failed); }, [choice, failed, onIllustrated]);
  useLayoutEffect(() => { onWindowView(windowActive && show); }, [windowActive, show, onWindowView]);
  const pressShot = stage.shot === 'press';
  const track = framed[0]?.id === 'press' ? worldTrackPx(framed[0].h) : 120;

  const cancelTimers = useCallback(() => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
  }, []);
  useEffect(() => cancelTimers, [cancelTimers]);
  function later(run: () => void, ms: number) {
    timers.current.push(window.setTimeout(run, ms));
  }
  const complete = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    queued.current = null;
    afterShot.current = null;
    cancelTimers();
    setBeat('done');
    onPressEnd();
  }, [cancelTimers, onPressEnd]);
  const animate = useCallback(({ progress, departures: result, audio }: Press) => {
    playPressSounds(audio);
    const motion = signature.read().reduced;
    setBeat('committing');
    patch({ pull: progress, hover: null, pressed: null, springAt: null, commitAt: signatureTime() });
    const turnToStreet = () => {
      setDepartures(result);
      setOverride('street');
    };
    const leave = () => {
      setBeat('leaving');
      const elapsed = signature.read().reduced ? REDUCED_BEAT_MS - COMMIT_MS.bite
        : BEAT_MS.walk + (result.turnedAwayIds.length - 1) * BEAT_MS.stagger + BEAT_MS.settle;
      patch({ move: null, leaveAt: signatureTime(), pull: 0 });
      onDepartures(result.turnedAway);
      timers.current.push(window.setTimeout(complete, elapsed));
    };
    if (!result.turnedAwayIds.length) {
      timers.current.push(window.setTimeout(complete, motion ? COMMIT_MS.bite : PRESS_MS));
      return;
    }
    if (motion) {
      timers.current.push(window.setTimeout(() => { turnToStreet(); leave(); }, COMMIT_MS.bite));
      return;
    }
    timers.current.push(window.setTimeout(() => {
      afterShot.current = leave;
      setBeat('moving');
      turnToStreet();
    }, PRESS_MS));
  }, [complete, onDepartures, patch, signature]);
  useEffect(() => {
    if (!ready || !pressShot || !queued.current) return;
    const press = queued.current;
    queued.current = null;
    cancelTimers();
    animate(press);
  }, [ready, pressShot, cancelTimers, animate]);

  useEffect(() => {
    if (!ready || !pressShot || reducedMotion) return;
    const firstIdle = setTimeout(() => {
      if (signature.read().idleAt === null && signature.read().commitAt === null) patch({ idleAt: signatureTime() - 800 });
    }, 800);
    return () => clearTimeout(firstIdle);
  }, [ready, pressShot, reducedMotion, patch, signature]);

  function spring(progress: number) {
    if (signature.read().commitAt !== null) return;
    patch({ pull: progress, pressed: null, springAt: signatureTime() });
    setBeat('idle');
    later(() => patch({ pull: 0, springAt: null }), SPRING_MS);
  }
  function acceptPress(progress: number, trusted: boolean, pointer = false) {
    const result = onPressStart();
    if (!result) { spring(progress); return; }
    if (trusted && pointer) haptic('thud');
    cancelTimers();
    const press = { departures: result, progress, audio: pressAudioFromGesture(trusted) };
    if (ready) animate(press);
    else {
      queued.current = press;
      setBeat('queued');
      later(complete, 1500);
    }
  }
  useImperativeHandle(ref, () => ({
    commitPress(trusted) {
      if (!miniature || !pressShot) return false;
      if (beat === 'idle' || beat === 'dragging') acceptPress(signature.read().pull, trusted);
      return true;
    },
    focusEdition: focus => patch({ focus }),
    scrollToStage: () => canvasHost.current?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' }),
  }));

  function eventTarget(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return hitTest(framed, event.clientX - box.left, event.clientY - box.top);
  }
  function bayOf(id: TargetId | undefined): Bay | null {
    return id === 'bay:room' ? 'room' : id === 'bay:band' ? 'band' : null;
  }
  function cancelBay(event: PointerEvent<HTMLDivElement>) {
    if (bayPress.current?.pointer !== event.pointerId) return;
    bayPress.current = null;
    patch({ pressed: null });
  }
  function beginBay(event: PointerEvent<HTMLDivElement>) {
    if (!selectingBay || !ready || bayPress.current || !event.isPrimary || event.button !== 0) return;
    const bay = bayOf(eventTarget(event)?.id);
    if (!bay) return;
    bayPress.current = { bay, pointer: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp };
    if (event.pointerType !== 'mouse' && event.nativeEvent.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
    patch({ pressed: bay });
    if (event.pointerType === 'mouse') event.preventDefault();
  }
  function validBay(event: PointerEvent<HTMLDivElement>, initial: BayPress) {
    return event.pointerId === initial.pointer && bayOf(eventTarget(event)?.id) === initial.bay &&
      Math.hypot(event.clientX - initial.x, event.clientY - initial.y) < 10 && event.timeStamp - initial.at <= 600;
  }
  function finishBay(event: PointerEvent<HTMLDivElement>) {
    const initial = bayPress.current;
    if (!initial || initial.pointer !== event.pointerId) return;
    cancelBay(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (selectingBay && ready && validBay(event, initial) && draft.edition !== initial.bay) {
      if (event.nativeEvent.isTrusted) haptic('tick');
      onSelectEdition(initial.bay, event.nativeEvent.isTrusted);
    }
  }
  const drag = usePressGesture<HTMLDivElement>({
    canStart: event => ready && pressShot && beat === 'idle' && signature.read().springAt === null && eventTarget(event)?.id === 'press',
    track: () => track,
    onPull: progress => {
      if (beat !== 'dragging') setBeat('dragging');
      patch({ pull: progress, pressed: 'press', hover: null, springAt: null });
    },
    onSpring: spring,
    onCommit: (progress, trusted) => acceptPress(progress, trusted, true),
  });
  useEffect(() => {
    if (beat !== 'leaving') return;
    const skip = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); complete(); }
    };
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [beat, complete]);


  const walking = comparing ? activeWalk === comparison : beat === 'leaving';
  const walk = comparing ? compareWalk : departures;
  const lanes = comparison?.leaverBays;
  useEffect(() => {
    if (!walking || !size.width || !size.height || !walk) return;
    const dimensions = signatureSize(size.width, size.height, 0);
    const camera = signaturePose('street', dimensions, stage.selected);
    const crossedAt: (number | undefined)[] = [];
    const edge = tagWidth / 2 + 3;
    const draw = () => {
      const input = signature.read();
      const time = signatureTime() - (input.leaveAt ?? signatureTime());
      const placed: { x: number; y: number }[] = [];
      walk.turnedAwayIds.forEach((id, index) => {
        const tag = tagNodes.current.get(id);
        if (!tag) return;
        const elapsed = time - (input.reduced ? 0 : index * BEAT_MS.stagger);
        const pose = leaverPose(index, elapsed, input.reduced, lanes?.[id]);
        const point = project([pose.at[0], 1.95, pose.at[2]], camera, dimensions);
        if (point.x < 0 || point.x > size.width) crossedAt[index] ??= time;
        const x = Math.max(edge, Math.min(size.width - edge, point.x));
        const fadeIn = Math.min(1, Math.max(0, elapsed / 160));
        const fadeOut = Math.max(0, 1 - (time - (crossedAt[index] ?? time)) / 160);
        const opacity = pose.visible && elapsed >= 0 ? (input.reduced ? 1 : fadeIn * fadeOut) : 0;
        let y = point.y;
        if (opacity > 0) {
          for (const last of placed) {
            if (Math.abs(x - last.x) < 2 * edge && Math.abs(y - last.y) < 20) y = last.y - 20;
          }
          placed.push({ x, y });
          tag.style.transform = `translate3d(${x - tagWidth / 2}px, ${y}px, 0)`;
        }
        const alpha = String(opacity);
        if (tag.style.opacity !== alpha) tag.style.opacity = alpha;
      });
      if (time < BEAT_MS.walk + (walk.turnedAwayIds.length - 1) * BEAT_MS.stagger) frame = requestAnimationFrame(draw);
    };
    let frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [walking, walk, lanes, signature, size.width, size.height, stage.selected]);

  const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('worldDebug');
  return <section className="first-order-world" ref={host} data-renderer-choice={failed ? 'illustrated' : choice}
    data-fallback={!miniature} data-world-ready={ready} data-world-painted={show} data-world-shot={stage.shot}
    data-world-phase={walking ? 'leaving' : !windowActive && beat !== 'idle' ? beat : moving ? 'moving' : 'idle'}
    data-comparing={comparing || undefined} data-street={streetActive || undefined} data-world-degraded={fit.degraded ? 'small' : undefined}
    data-world-hover="" data-world-pressed="" data-world-focus="" data-world-selected={draft.edition} data-pull="0.00" data-pull-track={track}
    data-world-ack={-1} data-warmup-ms={warmup} data-world-targets={JSON.stringify(framed, (_, value) =>
      typeof value === 'number' ? Math.round(value * 10) / 10 : value)}>
    {miniature && <div ref={canvasHost} className="first-order-world__stage" aria-hidden="true"
      onPointerLeave={event => { cancelBay(event); if (beat === 'idle') hover(null); }}
      onContextMenu={event => { if (selectingBay) event.preventDefault(); }}
      onPointerDown={event => {
        if (selectingBay) { beginBay(event); return; }
        if (beat === 'leaving' && event.isPrimary) { event.preventDefault(); complete(); return; }
        if (drag.onPointerDown(event)) event.preventDefault();
      }}
      onPointerUp={event => { if (selectingBay) finishBay(event); else drag.onPointerUp(event); }}
      onPointerCancel={event => { cancelBay(event); drag.onPointerCancel(event); }}
      onLostPointerCapture={event => { cancelBay(event); drag.onPointerCancel(event); }}
      onPointerMove={event => {
        if (bayPress.current && !validBay(event, bayPress.current)) cancelBay(event);
        drag.onPointerMove(event);
        if (!ready || beat !== 'idle' || !event.isPrimary || event.pointerType === 'touch') return;
        const target = eventTarget(event);
        hover(target?.id === 'press' ? 'press' : bayOf(target?.id));
      }}>
      <StageBoundary onFailure={fail}><Suspense fallback={null}>
        <Canvas scene={scene} stage={stage} overlayWidth={fit.overlay} signature={signature}
          textures={textures} warmupReady={textures.size === sources.length} view="studio"
          phone={size.width < 540} visible={visible} reducedMotion={reducedMotion} pan={0} focusedJob={null} onContextLost={fail} onWorkerFailure={fail}
          onMetrics={paint} onWarmed={setWarmup} onSignatureAck={acknowledge} onTexturesCommitted={commit} />
      </Suspense></StageBoundary>
      {walking && walk?.turnedAway.map((name, index) => {
        const id = walk.turnedAwayIds[index]!;
        return <span className="first-order-world__tag" key={id}
          ref={node => { if (node) tagNodes.current.set(id, node); else tagNodes.current.delete(id); }}>{name}</span>;
      })}
      {debug && <div className="first-order-world__debug">{framed.map(({ id, x, y, w, h, visual }) => <div key={id}>
        <i style={{ left: x, top: y, width: w, height: h }} />
        <i style={{ left: visual.x, top: visual.y, width: visual.w, height: visual.h }} />
      </div>)}</div>}
    </div>}
    {streetActive && renderStreet(show)}
    {renderWindow(windowActive && show)}
    {!streetActive && !windowActive && (!show || choose) && children}
    {miniature && <Suspense fallback={null}><ArtworkTextures ref={owner} sources={sources} onReady={publish} onFailure={fail} active={visible} /></Suspense>}

  </section>;
}
