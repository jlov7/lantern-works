import { Component, Suspense, lazy, memo, useCallback, useEffect, useState, type JSX, type ReactNode } from 'react';
import type { CompanyState } from '../../engine/types';
import { hasAuthorshipRules } from '../../engine/versions';
import { frameAt } from '../timeline';
import { World } from '../world/World';
import { useClock, type Playback } from './clock';

const miniatureModule = () => import('../miniature/MiniatureWorld');
const loadMiniature = () => miniatureModule().then(module => ({ default: module.MiniatureWorld }));
const MiniatureWorld = lazy(loadMiniature);
let preparedWorld: typeof import('../miniature/MiniatureWorld').MiniatureWorld | undefined;

export function prepareMiniatureWorld() {
  void miniatureModule().then(module => {
    preparedWorld = module.MiniatureWorld;
    module.prepareRoomRenderer();
  }).catch(() => { /* A requested room still uses the illustrated fallback on failure. */ });
}
class IllustrationBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

interface Props {
  state: CompanyState;
  play: Playback | null;
  selected: string | null;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
  illustrated?: boolean;
}

/** The miniature, following the playback clock. The only part of the stage that renders every frame. */
export const WorldView = memo(function WorldView({ state, play, selected, onSelect, reducedMotion, illustrated = false }: Props): JSX.Element {
  const [Room] = useState(() => preparedWorld ?? MiniatureWorld);
  const [showRoom, setShowRoom] = useState(Room === MiniatureWorld);
  useEffect(() => {
    if (showRoom || illustrated || !hasAuthorshipRules(state.rulesVersion)) return;
    // Give the illustrated response a paint before mounting a prepared room.
    let afterPaint = 0;
    const beforePaint = requestAnimationFrame(() => {
      afterPaint = requestAnimationFrame(() => setShowRoom(true));
    });
    return () => { cancelAnimationFrame(beforePaint); cancelAnimationFrame(afterPaint); };
  }, [showRoom, illustrated, state.rulesVersion]);
  const t = useClock(play?.clock ?? null, (c) => Math.floor(c.t));
  const running = useClock(play?.clock ?? null, c => !c.done && !c.paused && !c.held);
  const inspect = useCallback(() => play?.clock.pause(true), [play]);
  const frame = play ? frameAt(play.before, play.after, t) : frameAt(state, state, state.minute);
  const props = { state: play?.after ?? state, frame, selectedRequestId: selected, onSelectNeighbour: onSelect, reducedMotion, scenarioId: state.config.scenarioId };
  const fallback = <World {...props} />;
  return hasAuthorshipRules(state.rulesVersion) && !illustrated && showRoom ? <IllustrationBoundary fallback={fallback}><Suspense fallback={fallback}><Room {...props} playbackRunning={!!play && running} onInspect={inspect} /></Suspense></IllustrationBoundary> : fallback;
});
