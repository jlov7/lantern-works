import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type TransitionEvent } from 'react';
import jazzWindow from '../neighbourhood/assets/jazz.webp';
import { framingTransform, type WindowFraming } from '../game/windowFraming';

interface Props {
  visible: boolean;
  children: ReactNode;
  framing?: WindowFraming;
  world?: boolean;
  animate?: boolean;
  hang?: 'waiting' | 'after-push' | 'cut';
  frozen?: boolean;
  onBackdropReady?: () => void;
}

export function JazzStorefront({ visible, children, framing = 'window', world, animate, hang, frozen, onBackdropReady }: Props) {
  const [ready, setReady] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const transform = framingTransform(framing);
  const style = { '--s': transform.scale, '--tx': `${transform.txPct}%`, '--ty': `${transform.tyPct}%` } as CSSProperties;
  useLayoutEffect(() => {
    if (!frozen || !stage.current) return;
    const active = stage.current.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running');
    for (const animation of active) {
      const time = animation.currentTime;
      animation.pause();
      // A pending pause can otherwise advance on the next compositor frame.
      if (time !== null) animation.currentTime = time;
    }
    return () => { for (const animation of active) animation.play(); };
  }, [frozen]);

  function motion(event: TransitionEvent<HTMLDivElement>, prewarm: boolean) {
    if (event.target === event.currentTarget && event.propertyName === 'transform') {
      event.currentTarget.style.willChange = prewarm ? 'transform' : '';
    }
  }

  return <figure className="clem-window" hidden={!visible} data-backdrop={ready ? 'ready' : 'pending'}
    data-world={world || undefined} data-animate={animate || undefined} data-hang={hang} style={style}
    aria-label="Your delivered print inside Clem Jazz Bar">
    <div ref={stage} className="clem-window__stage" data-framing={framing}
      onTransitionStart={event => motion(event, true)} onTransitionEnd={event => motion(event, false)}
      onTransitionCancel={event => motion(event, false)}>
      <img src={jazzWindow} alt="" width="1440" height="811" onLoad={event => {
        void event.currentTarget.decode().then(() => { setReady(true); onBackdropReady?.(); }, () => undefined);
      }} />
      {visible && children}
    </div>
  </figure>;
}
