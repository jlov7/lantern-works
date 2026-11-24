import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { COMMIT_MS, PULL, SPRING_MS, trackPx } from '../game/pressPull';
import { usePressGesture } from './usePressGesture';
import { haptic } from '../haptics';
import '../../styles/press-pull.css';

export interface PressPullHandle {
  commit: (trusted: boolean) => void;
}
interface Props {
  reducedMotion: boolean;
  disabled?: boolean;
  onStart: (trusted: boolean) => boolean;
  onCommit: () => void;
  children: ReactNode;
  ref?: Ref<PressPullHandle>;
}
type Phase = 'idle' | 'drag' | 'spring' | 'bite' | 'release';

export function PressPull({ reducedMotion, disabled, onStart, onCommit, children, ref }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const progress = useRef(0);
  const committed = useRef(false);
  const worked = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function later(run: () => void, ms: number) {
    timers.current.push(window.setTimeout(run, ms));
  }
  const track = () => trackPx(root.current?.clientHeight ?? 0);
  function paint(progressValue: number) {
    progress.current = progressValue;
    if (!root.current) return;
    root.current.dataset.pull = progressValue.toFixed(2);
    root.current.style.setProperty('--press-pull-offset', `${(progressValue - 1) * 104}%`);
    root.current.style.setProperty('--press-handle-travel', `${progressValue * track()}px`);
    root.current.style.setProperty('--press-proof-light', String(1 - .25 * progressValue));
  }
  function changeMotion(next: Phase) {
    if (root.current) {
      root.current.dataset.pressPhase = next;
      root.current.getBoundingClientRect();
    }
    setPhase(next);
  }
  function finish() {
    if (!committed.current || worked.current) return;
    worked.current = true;
    onCommit();
  }
  function commit(trusted: boolean, pointer = false) {
    if (disabled || committed.current || !onStart(trusted)) return;
    committed.current = true;
    if (trusted && pointer) haptic('thud');
    changeMotion('bite');
    paint(1);
    if (reducedMotion) return;
    later(() => {
      changeMotion('release');
      paint(0);
    }, COMMIT_MS.bite + COMMIT_MS.hold);
  }
  useImperativeHandle(ref, () => ({ commit }));

  const gesture = usePressGesture<HTMLButtonElement>({
    canStart: () => !disabled && !committed.current && phase !== 'spring',
    track,
    onPull: value => {
      if (phase !== 'drag') setPhase('drag');
      paint(value);
    },
    onSpring: () => {
      changeMotion('spring');
      paint(0);
      later(() => setPhase('idle'), SPRING_MS);
    },
    onCommit: (_, trusted) => commit(trusted, true),
  });
  return <div className="press-pull" ref={root} data-press-phase={phase} data-reduced-motion={reducedMotion}>
    {children}
    <div className="press-pull__tympan" aria-hidden="true" onTransitionEnd={event => {
      if (phase === 'release' && event.target === event.currentTarget && event.propertyName === 'transform') finish();
    }} />
    <button {...gesture} className="press-pull__handle" type="button" aria-label="Pull the press handle"
      aria-disabled={disabled || phase === 'bite' || phase === 'release' || undefined}
      onClick={event => { if (event.detail === 0) commit(event.nativeEvent.isTrusted); }}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' || disabled || committed.current) return;
        event.preventDefault();
        const next = Math.min(1, progress.current + .25);
        paint(next);
        if (next >= PULL.commitAt) commit(event.nativeEvent.isTrusted);
      }}>
      <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
    </button>
  </div>;
}
