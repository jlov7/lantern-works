import { useState, type ReactNode } from 'react';
import jazzWindow from '../neighbourhood/assets/jazz.webp';

export function JazzStorefront({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  return (
    <figure className="clem-window" hidden={!visible} data-backdrop={ready ? 'ready' : 'pending'} aria-label="Your delivered print inside Clem Jazz Bar">
      <img src={jazzWindow} alt="" width="1440" height="811" onLoad={event => {
        void event.currentTarget.decode().then(() => setReady(true), () => undefined);
      }} />
      {visible && children}
    </figure>
  );
}
