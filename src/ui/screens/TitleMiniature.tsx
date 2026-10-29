import { useEffect, useState } from 'react';
import type { RunConfig } from '../../engine/types';

type Scene = typeof import('./TitleScene').TitleScene;
let ready: Scene | null = null;

/** The scene follows first paint; starting or restoring a season never waits for it. */
export function TitleMiniature(_props: { config: RunConfig; reducedMotion: boolean }) {
  const [Illustration, setIllustration] = useState<Scene | null>(() => ready);
  useEffect(() => {
    if (Illustration) return;
    let live = true;
    void import('./TitleScene').then(module => {
      ready = module.TitleScene;
      if (live) setIllustration(() => module.TitleScene);
    }, () => { /* The entry remains usable if the optional scene cannot load. */ });
    return () => { live = false; };
  }, [Illustration]);
  return <div className="title-miniature">{Illustration ? <Illustration /> : <div className="title-illustration-placeholder" aria-hidden="true"><span>Lantern Works</span><small>Before the doors open</small></div>}</div>;
}
