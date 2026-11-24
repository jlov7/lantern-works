import { useEffect, useState } from 'react';
import { loadPrefs, PREFS_EVENT } from '../persist';

export function useRendererChoice(onFail: () => void, onIllustrated: () => void) {
  const [choice, setChoice] = useState<'checking' | 'miniature' | 'illustrated'>('checking');
  const [workerFailed, setWorkerFailed] = useState(false);
  useEffect(() => {
    let probe: Worker | undefined;
    let generation = 0;
    const choose = (view: 'miniature' | 'illustrated') => {
      setChoice(view);
      if (view === 'illustrated') onIllustrated();
    };
    const chooseMain = () => {
      setWorkerFailed(true);
      const context = document.createElement('canvas').getContext('webgl2');
      if (!context) { choose('illustrated'); onFail(); return; }
      const info = context.getExtension('WEBGL_debug_renderer_info');
      const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      context.getExtension('WEBGL_lose_context')?.loseContext();
      choose(/SwiftShader|llvmpipe|softpipe|Software Rasterizer/i.test(renderer) ? 'illustrated' : 'miniature');
    };
    const update = () => {
      generation++;
      probe?.terminate();
      probe = undefined;
      const saved = loadPrefs().studioView;
      if (saved) { choose(saved); return; }
      if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype) {
        const current = generation;
        try {
          probe = new Worker(new URL('./renderer-probe.worker.ts', import.meta.url), { type: 'module' });
          probe.onmessage = event => {
            if (current !== generation) return;
            const result = event.data as { view: 'miniature' | 'illustrated'; unavailable?: boolean };
            if (result.unavailable) chooseMain();
            else choose(result.view);
            probe?.terminate();
            probe = undefined;
          };
          probe.onerror = () => { if (current === generation) chooseMain(); probe?.terminate(); probe = undefined; };
          return;
        } catch { /* Fall through to the original capability check. */ }
      }
      chooseMain();
    };
    window.addEventListener(PREFS_EVENT, update);
    update();
    return () => { generation++; probe?.terminate(); window.removeEventListener(PREFS_EVENT, update); };
  }, [onFail, onIllustrated]);
  return { choice, workerFailed, setChoice, setWorkerFailed };
}
