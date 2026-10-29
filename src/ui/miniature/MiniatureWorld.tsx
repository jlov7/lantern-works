import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { World, type WorldProps } from '../world/World';
import { CampaignArtwork } from '../portfolio/Artwork';
import { DesignedPrint } from '../creative/DesignedArtwork';
import { artifactLabel } from '../game/portfolio';
import { CAST_BY_ID } from '../../engine/rules';
import { miniatureFrameKey, miniatureScene, type CameraView } from './adapter';
import { describeFrame } from '../world/place';
import { ArtworkTextures, type PrintSource, type PrintTextures, type TextureOwner } from './ArtworkTextures';
import type { RendererMetrics } from './MiniatureCanvas';
import { loadPrefs, savePrefs, PREFS_EVENT } from '../persist';
import '../../styles/miniature.css';
const EMPTY_TEXTURES: PrintTextures = new Map();
const MiniatureCanvas = lazy(() => import('./MiniatureCanvas'));
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export interface MiniatureWorldProps extends WorldProps {
  /** Current frame is supplied by the existing clock. No activity is invented while this is false. */
  playbackRunning?: boolean;
  initialView?: CameraView;
  onRendererMetrics?: (metrics: RendererMetrics) => void;
  onInspect?: () => void;
}
export function MiniatureWorld({ playbackRunning = false, initialView = 'studio', onRendererMetrics, onInspect, ...props }: MiniatureWorldProps) {
  const root = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState(false);
  const [rendererChoice, setRendererChoice] = useState<'checking' | 'miniature' | 'illustrated'>('checking');
  const [painted, setPainted] = useState(false);
  const [textureSet, setTextureSet] = useState<{ key: string; sources: PrintSource[]; textures: PrintTextures }>();
  const textureOwner = useRef<TextureOwner>(null);
  const inspection = useRef<HTMLElement>(null);
  const [focusedJob, setFocusedJob] = useState<string | null>(null);
  const [view, setView] = useState<CameraView>(initialView);
  const cameraChosen = useRef(false);
  const [pan, setPan] = useState(0);
  const [phone, setPhone] = useState(false);
  const [visible, setVisible] = useState(true);
  const fail = useCallback(() => setFailed(true), []);
  useEffect(() => {
    const choose = (view: 'miniature' | 'illustrated') => {
      setRendererChoice(view);
      if (view === 'illustrated') { setTextureSet(undefined); setPainted(false); }
    };
    const update = () => {
      const saved = loadPrefs().studioView;
      if (saved) { choose(saved); return; }
      const context = document.createElement('canvas').getContext('webgl2');
      if (!context) { choose('illustrated'); fail(); return; }
      const info = context.getExtension('WEBGL_debug_renderer_info');
      const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      context.getExtension('WEBGL_lose_context')?.loseContext();
      choose(/SwiftShader|llvmpipe|softpipe|Software Rasterizer/i.test(renderer) ? 'illustrated' : 'miniature');
    };
    window.addEventListener(PREFS_EVENT, update);
    update();
    return () => window.removeEventListener(PREFS_EVENT, update);
  }, [fail]);
  const frameKey = miniatureFrameKey(props.frame);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- The projection key includes every work transition; clock text stays outside the renderer.
  const scene = useMemo(() => miniatureScene(props.frame, props.state, props.selectedRequestId, focusedJob), [frameKey, props.state, props.selectedRequestId, focusedJob]);
  const activeJob = scene.people.find(person => person.worker.working && person.worker.jobId)?.worker.jobId;
  useEffect(() => {
    if (initialView === 'studio' && !cameraChosen.current && (activeJob || scene.learning)) setView('work');
  }, [initialView, activeJob, scene.learning]);
  const proposedSources = useMemo<PrintSource[]>(() => {
    const pieces = [...scene.wall, ...scene.surfaces.filter(s => s.visible).map(s => s.piece)];
    return [...new Map(pieces.map(piece => [piece.jobId, { key: piece.jobId, brief: piece.brief, launch: piece.launch, launches: piece.launches }])).values(), ...scene.keepsakes.map(carried => ({ key: `keepsake:${carried.id}`, carried })), ...(scene.learning?.source ? [{ key: 'studio-pattern', carried: scene.learning.source }] : []), ...(scene.preview ? [{ key: 'preview', brief: scene.preview }] : [])];
  }, [scene.wall, scene.surfaces, scene.keepsakes, scene.learning, scene.preview]);
  const sourceKey = JSON.stringify(proposedSources);
  const focused = scene.surfaces.find(art => art.key === focusedJob);
  const pattern = focusedJob === 'studio-pattern' ? scene.learning?.source : undefined;
  const assigned = (job: string) => props.frame.workers.find(worker => worker.jobId === job);
  const sources = useMemo(() => JSON.parse(sourceKey) as PrintSource[], [sourceKey]);
  const ready = useCallback((value: PrintTextures) => setTextureSet({ key: sourceKey, sources, textures: value }), [sourceKey, sources]);
  const committed = useCallback((value: PrintTextures) => {
    textureOwner.current?.committed(value);
    if (root.current) root.current.dataset.printTextures = JSON.stringify([...value.keys()]);
  }, []);
  const textures = useMemo(() => {
    if (!textureSet) return EMPTY_TEXTURES;
    if (textureSet.key === sourceKey) return textureSet.textures;
    const prior = new Map(textureSet.sources.map(source => [source.key, JSON.stringify(source)]));
    return new Map(sources.flatMap(source => {
      const texture = textureSet.textures.get(source.key);
      return texture && prior.get(source.key) === JSON.stringify(source) ? [[source.key, texture] as const] : [];
    }));
  }, [textureSet, sourceKey, sources]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const size = new ResizeObserver(entries => setPhone(entries[0]!.contentRect.width < 640)); size.observe(element);
    let intersecting = true;
    const update = () => setVisible(intersecting && !document.hidden);
    const intersection = new IntersectionObserver(entries => { intersecting = entries[0]!.isIntersecting; update(); }); intersection.observe(element);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { size.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const metrics = useCallback((value: RendererMetrics) => {
    setPainted(true);
    if (root.current) {
      root.current.dataset.rendererMetrics = JSON.stringify(value);
      root.current.dataset.rendered = 'true';
    }
    onRendererMetrics?.(value);
  }, [onRendererMetrics]);
  const drag = useRef<{ x: number; y: number; pan: number; moved: boolean } | null>(null);
  const fallback = <div className="miniature-fallback"><World {...props} /><p>The illustrated studio is ready.</p></div>;
  const illustrated = failed || rendererChoice !== 'miniature';
  const camera = (next: CameraView) => { cameraChosen.current = true; setView(next); setPan(0); };
  const inspect = (jobId: string) => {
    onInspect?.(); setFocusedJob(jobId); camera('work');
    requestAnimationFrame(() => { inspection.current?.scrollIntoView({ block: 'start' }); inspection.current?.focus({ preventScroll: true }); });
  };
  const closePrint = () => {
    const jobId = focusedJob; setFocusedJob(null);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(jobId === 'studio-pattern' ? 'button[data-inspect-pattern]' : `button[data-inspect-job="${CSS.escape(jobId ?? '')}"]`)?.focus());
  };
  return <section ref={root} className="miniature-world" data-view={view} data-camera-pan={pan} data-fallback={failed || rendererChoice === 'illustrated'} data-renderer-choice={rendererChoice} data-playback-running={playbackRunning} data-visible={visible} data-reduced-motion={props.reducedMotion === true} aria-label={describeFrame(props.frame)}>
    <div className="miniature-world__stage" onPointerDown={event => { if (event.isPrimary && event.button === 0) drag.current = { x: event.clientX, y: event.clientY, pan, moved: false }; }} onPointerMove={event => {
      const held = drag.current; if (!held) return;
      const dx = event.clientX - held.x; const dy = event.clientY - held.y;
      if (!held.moved && Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }
      if (Math.abs(dx) < 8 && !held.moved) return;
      held.moved = true; setPan(Math.max(-.36, Math.min(.36, held.pan - dx / 700)));
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
      {illustrated ? fallback : <><SceneBoundary fallback={null} onFailure={fail}><Suspense fallback={null}><MiniatureCanvas scene={scene} textures={textures} view={view} phone={phone} pan={pan} visible={visible} focusedJob={focusedJob} onContextLost={fail} onMetrics={metrics} onTexturesCommitted={committed} /></Suspense></SceneBoundary>{!painted && fallback}</>}
      {!illustrated && <ArtworkTextures ref={textureOwner} sources={sources} onReady={ready} onFailure={fail} active={visible} />}
      <div className="miniature-world__time" aria-hidden="true"><span>Day {props.frame.day + 1}</span><span>{props.frame.clock}</span></div>
    </div>
    {!failed && rendererChoice !== 'checking' && <nav className="miniature-world__cameras" aria-label="Studio camera">
      {rendererChoice === 'illustrated' ? <button type="button" onClick={() => { savePrefs({ ...loadPrefs(), studioView: 'miniature' }); setPainted(false); setRendererChoice('miniature'); }}>Try miniature room</button> : <>
      {initialView === 'window' && <button type="button" aria-pressed={view === 'window'} onClick={() => camera('window')}>At the window</button>}
      <button type="button" aria-pressed={view === 'work'} onClick={() => camera('work')}>On the bench</button>
      <button type="button" aria-pressed={view === 'studio'} onClick={() => camera('studio')}>The studio</button>
      <button type="button" onClick={() => { savePrefs({ ...loadPrefs(), studioView: 'illustrated' }); setRendererChoice('illustrated'); setTextureSet(undefined); setPainted(false); }}>Use illustrated studio</button>
      </>}
    </nav>}
    <div className="miniature-world__status">
      {rendererChoice === 'illustrated' && !failed && <p>Keep the illustrated studio for a lighter view. You can try the miniature room above.</p>}
      {scene.learning && <>{scene.learning.otherLabel && <p>{scene.learning.otherLabel}</p>}<p>{scene.learning.label}{scene.learning.source && <button type="button" data-inspect-pattern onClick={() => inspect('studio-pattern')}>Inspect the pattern</button>}</p>{!playbackRunning && <p>The day is paused. Resume when you’re ready.</p>}</>}
      <p>{props.frame.packagesToday.length} delivered today{props.frame.missedToday.length > 0 ? ` · ${props.frame.missedToday.length} missed promises` : ''}{scene.kit !== 'none' ? ` · Kit ${scene.kit === 'ready' ? 'ready' : 'in progress'}` : ''}{scene.outage ? ' · AI desks are offline' : ''}</p>
    </div>
    {scene.surfaces.length > 0 && <div className="miniature-world__work" role="group" aria-label="Work on the benches">{scene.surfaces.map(art => <button key={art.key} type="button" data-inspect-job={art.key} aria-pressed={focusedJob === art.key} onClick={() => inspect(art.key)}>Inspect {assigned(art.key)?.name ?? CAST_BY_ID[art.piece.castId]?.name}’s work<span>{stageLabel(art.stage, art.waiting)}</span></button>)}</div>}
    {(focused || pattern) && <section ref={inspection} tabIndex={-1} className="miniature-work-inspection" aria-label="Current work inspection" data-work-job={focused?.key} data-work-stage={focused?.stage} data-pattern-source={pattern?.id}>
      <figure>{pattern ? <DesignedPrint piece={pattern.design} copy={pattern.copy} label={pattern.title} /> : focused && <CampaignArtwork brief={focused.piece.brief} launch={focused.piece.launch} launches={focused.piece.launches} />}</figure>
      <div><p className="miniature-work-inspection__stage">{focused ? `${stageLabel(focused.stage, focused.waiting)}${assigned(focused.key) ? ` · ${assigned(focused.key)!.name}` : ''}` : scene.learning?.label}</p><h3>{pattern?.title ?? (focused && artifactLabel(focused.piece.brief, focused.piece.launch))}</h3><p>{pattern ? `The composition kept from Season ${pattern.sourceSeason}.` : focused?.piece.brief.detail}</p><button type="button" onClick={closePrint}>Close print</button></div>
    </section>}
    {props.onSelectNeighbour && scene.neighbours.length > 0 && <div className="miniature-world__neighbours" role="group" aria-label="Focus a neighbour">{scene.neighbours.map(person => <button key={person.n.requestId} type="button" aria-pressed={props.selectedRequestId === person.n.requestId} onClick={() => props.onSelectNeighbour?.(person.n.requestId)}>{CAST_BY_ID[person.n.castId]?.name ?? person.n.castId}</button>)}</div>}
  </section>;
}

function stageLabel(stage: string, waiting: boolean): string {
  if (waiting) return stage === 'produce' ? 'Waiting to be made' : stage === 'brief' ? 'Waiting for a brief' : stage === 'rework' ? 'Waiting for rework' : 'Waiting for finishing';
  return stage === 'produce' ? 'Making' : stage === 'brief' ? 'Briefing' : stage === 'rework' ? 'Reworking' : 'Finishing';
}
