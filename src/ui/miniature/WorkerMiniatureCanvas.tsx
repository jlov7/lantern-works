import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { CanvasTexture } from 'three';
import type { MiniatureCanvasProps } from './MiniatureCanvas';

type Props = MiniatureCanvasProps & { onWorkerFailure: () => void };

export default memo(function WorkerMiniatureCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const ready = useRef(false);
  const current = useRef(props);
  const uploaded = useRef(new Map<string, CanvasTexture>());
  const pending = useRef(new Map<number, MiniatureCanvasProps['textures']>());
  const generation = useRef(0);
  const serial = useRef(0);
  useLayoutEffect(() => { current.current = props; });

  const sendFrame = useCallback(async (roomWorker: Worker) => {
    const revision = ++generation.current;
    const snapshot = current.current;
    if (!snapshot.visible) return;
    const images: { key: string; bitmap: ImageBitmap }[] = [];
    try {
      for (const [key, texture] of snapshot.textures) {
        if (uploaded.current.get(key) === texture) continue;
        images.push({ key, bitmap: await createImageBitmap(texture.image, { imageOrientation: 'flipY' }) });
      }
      if (revision !== generation.current || worker.current !== roomWorker) {
        images.forEach(item => item.bitmap.close());
        return;
      }
      for (const [key, texture] of snapshot.textures) uploaded.current.set(key, texture);
      for (const key of uploaded.current.keys()) if (!snapshot.textures.has(key)) uploaded.current.delete(key);
      const frameSerial = ++serial.current;
      pending.current.clear();
      pending.current.set(frameSerial, snapshot.textures);
      roomWorker.postMessage({
        type: 'frame', serial: frameSerial, scene: snapshot.scene, view: snapshot.view,
        phone: snapshot.phone, pan: snapshot.pan, focusedJob: snapshot.focusedJob,
        keys: [...snapshot.textures.keys()], images,
      }, images.map(item => item.bitmap));
    } catch {
      images.forEach(item => item.bitmap.close());
      if (worker.current === roomWorker) current.current.onWorkerFailure();
    }
  }, []);

  useEffect(() => {
    const mount = host.current!;
    const canvas = document.createElement('canvas');
    canvas.dataset.miniatureRenderer = 'true';
    canvas.dataset.rendererThread = 'worker';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    mount.append(canvas);
    let roomWorker: Worker;
    try {
      const offscreen = canvas.transferControlToOffscreen();
      roomWorker = new Worker(new URL('./room.worker.tsx', import.meta.url), { type: 'module' });
      worker.current = roomWorker;
      try {
        roomWorker.postMessage({ type: 'start', canvas: offscreen, width: mount.clientWidth, height: mount.clientHeight, dpr: Math.min(devicePixelRatio, 1.5) }, [offscreen]);
      } catch (error) {
        roomWorker.terminate();
        throw error;
      }
    } catch {
      worker.current = null;
      current.current.onWorkerFailure();
      canvas.remove();
      return;
    }
    const resize = new ResizeObserver(() => {
      const bounds = mount.getBoundingClientRect();
      roomWorker.postMessage({ type: 'resize', width: bounds.width, height: bounds.height, dpr: Math.min(devicePixelRatio, 1.5) });
    });
    let closing = false;
    let closeTimeout: ReturnType<typeof setTimeout> | undefined;
    resize.observe(mount);
    roomWorker.onmessage = event => {
      const message = event.data as { type: string; reason?: string; serial?: number; metrics?: Parameters<MiniatureCanvasProps['onMetrics']>[0]; contextLost?: boolean; geometries?: number; textures?: number; value?: boolean };
      if (message.type === 'closed') {
        canvas.dataset.contextLost = String(message.contextLost);
        canvas.dataset.disposedGeometries = String(message.geometries);
        canvas.dataset.disposedTextures = String(message.textures);
        if (closeTimeout) clearTimeout(closeTimeout);
        roomWorker.terminate();
        return;
      }
      if (closing) return;
      if (message.type === 'started') {
        ready.current = true;
        roomWorker.postMessage({ type: 'visible', value: current.current.visible });
        void sendFrame(roomWorker);
      }
      if (message.type === 'painted') canvas.dataset.painted = 'true';
      if (message.type === 'metrics' && message.metrics) current.current.onMetrics(message.metrics);
      if (message.type === 'suspended') canvas.dataset.suspended = String(message.value);
      if (message.type === 'committed' && message.serial !== undefined) {
        const textures = pending.current.get(message.serial);
        if (textures) current.current.onTexturesCommitted(textures);
        for (const key of pending.current.keys()) if (key <= message.serial) pending.current.delete(key);
      }
      if (message.type === 'failure') {
        if (message.reason === 'WebGL context lost' || canvas.dataset.painted) current.current.onContextLost();
        else current.current.onWorkerFailure();
      }
    };
    roomWorker.onerror = () => { if (!closing) current.current.onWorkerFailure(); else roomWorker.terminate(); };
    const generationRef = generation;
    const uploadedRef = uploaded;
    const pendingRef = pending;
    return () => {
      closing = true;
      ++generationRef.current;
      resize.disconnect();
      roomWorker.postMessage({ type: 'close' });
      closeTimeout = setTimeout(() => roomWorker.terminate(), 2000);
      worker.current = null;
      ready.current = false;
      uploadedRef.current.clear();
      pendingRef.current.clear();
      canvas.remove();
    };
  }, [sendFrame]);

  useEffect(() => {
    if (!props.visible) { ++generation.current; pending.current.clear(); }
    if (ready.current) worker.current?.postMessage({ type: 'visible', value: props.visible });
  }, [props.visible]);
  useEffect(() => { if (ready.current && worker.current) void sendFrame(worker.current); }, [props.scene, props.textures, props.view, props.phone, props.pan, props.focusedJob, props.visible, sendFrame]);
  return <div ref={host} className="worker-miniature-canvas" aria-hidden="true" />;
});
