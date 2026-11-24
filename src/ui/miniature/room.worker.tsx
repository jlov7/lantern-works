import { createRoot, extend, unmountComponentAtNode, useFrame, useThree } from '@react-three/fiber';
import { createElement, useEffect, useLayoutEffect, useRef } from 'react';
import { ACESFilmicToneMapping, BoxGeometry, CanvasTexture, CircleGeometry, ConeGeometry, DirectionalLight, Fog, Group, HemisphereLight, InstancedMesh, Mesh, MeshStandardMaterial, PCFShadowMap, PlaneGeometry, PointLight, SpotLight, SRGBColorSpace, type WebGLRenderer } from 'three';
import { MaterialProvider, BatchedStudio } from './materials';
import { Studio, loadWorkerSignFont } from './Studio';
import type { CameraView, miniatureScene } from './adapter';
import { cameraPose, RoomLights } from './RoomScene';
import type { RendererMetrics } from './MiniatureCanvas';
import { warmRoom } from './warmup';
import { SignatureLayer } from './SignatureLayer';
import { renderSignatureCamera, signatureSize } from './signatureRig';
import type { FirstOrderStage } from '../game/firstOrderScene';
import type { SignatureState } from '../game/signatureState';

type Scene = ReturnType<typeof miniatureScene>;
type Image = { key: string; bitmap: ImageBitmap };
type Frame = { type: 'frame'; serial: number; scene: Scene; view: CameraView; phone: boolean; pan: number; focusedJob: string | null; images: Image[]; keys: string[]; warmupReady: boolean; stage?: FirstOrderStage; overlayWidth?: number; reducedMotion?: boolean };
type Message = { type: 'start'; canvas: OffscreenCanvas; width: number; height: number; dpr: number } | Frame | { type: 'resize'; width: number; height: number; dpr: number } | { type: 'visible'; value: boolean } | { type: 'close' } | { type: 'signature'; value: SignatureState };
const scope = self as unknown as {
  postMessage: (message: unknown) => void;
  close: () => void;
  onmessage: ((event: MessageEvent<Message>) => void) | null;
};
extend({ BoxGeometry, CircleGeometry, ConeGeometry, DirectionalLight, Fog, Group, HemisphereLight, InstancedMesh, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, SpotLight });
let root: ReturnType<typeof createRoot> | undefined;
let canvas: OffscreenCanvas | undefined;
let renderer: WebGLRenderer | undefined;
let dimensions = { width: 1, height: 1, dpr: 1 };
let closing = false;
let textures = new Map<string, CanvasTexture>();
let lastFrame: Frame | undefined;
let rendered = false;
let visible = true;
let warming = false;
let warmed = false;
let signature: SignatureState | undefined;
const readSignature = () => signature;
let requestSignatureFrame: (() => void) | undefined;
let acknowledged = -1;
let pendingCommit: { serial: number; keys: string[] } | undefined;
const retired: CanvasTexture[] = [];
function configuration() {
  return {
    size: { width: dimensions.width, height: dimensions.height, top: 0, left: 0 },
    dpr: dimensions.dpr,
    frameloop: visible ? 'demand' as const : 'never' as const,
    shadows: { type: PCFShadowMap },
    camera: { fov: 35, near: .1, far: 100, position: [11.5, 10, 14] as [number, number, number] },
    gl: { antialias: true, alpha: true, powerPreference: 'low-power' as const },
    onCreated({ gl }: { gl: WebGLRenderer }) { renderer = gl; gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.28; },
  };
}
// oxlint-disable-next-line react/only-export-components -- This module is a worker entry, not a fast-refresh boundary.
function Rig({ data }: { data: Frame }) {
  const { camera, invalidate, gl, size } = useThree();
  const frames = useRef(0);
  const scene = data.scene;
  useEffect(() => {
    requestSignatureFrame = invalidate;
    return () => { requestSignatureFrame = undefined; };
  }, [invalidate]);
  useEffect(() => {
    if (data.stage) return;
    const { target, offset } = cameraPose(data.view, data.phone, data.pan, scene, data.focusedJob, size.width, size.height);
    camera.position.copy(target).add(offset); camera.lookAt(target); camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, data, scene, size.width, size.height]);
  const shadows = JSON.stringify([data.view === 'work', scene.people, scene.neighbours, scene.desks.map(desk => desk.id), scene.surfaces.filter(art => art.visible).map(art => [art.key, art.at]), scene.wall.map(piece => piece.jobId), scene.kit, scene.scenarioId, scene.learning?.label, data.keys]);
  // oxlint-disable-next-line react/immutability -- Three owns this mutable renderer API.
  useEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; invalidate(); }, [shadows, invalidate, gl]);
  useFrame(({ scene: room }) => {
    // A draw invalidated before suspension can still reach Fiber's callback.
    if (!visible) return;
    const renderedSignature = data.stage ? signature : undefined;
    if (data.stage && renderSignatureCamera(camera, data.stage, signatureSize(size.width, size.height, data.overlayWidth ?? 0), renderedSignature)) invalidate();
    if (!warmed) {
      if (warming || !data.warmupReady) return;
      warming = true;
      void warmRoom(gl, room, camera).then(ms => {
        if (closing) return;
        warmed = true;
        scope.postMessage({ type: 'warmed', ms });
        invalidate();
      }).catch(error => {
        if (!closing) scope.postMessage({ type: 'failure', reason: error instanceof Error ? error.message : String(error) });
      });
      return;
    }
    const start = performance.now();
    gl.render(room, camera);
    frames.current++;
    queueMicrotask(() => {
      const firstFrame = !rendered;
      if (firstFrame) {
        rendered = true;
        scope.postMessage({ type: 'painted' });
      }
      if (renderedSignature && renderedSignature.seq > acknowledged) {
        acknowledged = renderedSignature.seq;
        scope.postMessage({ type: 'signature-ack', seq: acknowledged });
      }
      if (firstFrame || !data.stage) {
        const metrics: RendererMetrics = { drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, frames: frames.current, lastFrameMs: Math.round((performance.now() - start) * 100) / 100 };
        scope.postMessage({ type: 'metrics', metrics });
      }
      if (pendingCommit) {
        const { serial, keys } = pendingCommit;
        pendingCommit = undefined;
        const keep = new Set(keys);
        for (const [key, texture] of textures) {
          if (keep.has(key)) continue;
          texture.dispose();
          (texture.image as unknown as ImageBitmap).close();
          textures.delete(key);
        }
        for (const texture of retired.splice(0)) {
          texture.dispose();
          (texture.image as unknown as ImageBitmap).close();
        }
        scope.postMessage({ type: 'committed', serial, keys });
      }
    });
  }, 1);
  return null;
}

// oxlint-disable-next-line react/only-export-components -- This module is a worker entry, not a fast-refresh boundary.
function TextureCommit({ serial, keys }: { serial: number; keys: string[] }) {
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    pendingCommit = { serial, keys };
    invalidate();
  }, [serial, keys, invalidate]);
  return null;
}

// oxlint-disable-next-line react/only-export-components -- This module is a worker entry, not a fast-refresh boundary.
function Room({ data }: { data: Frame }) {
  return <>
    <RoomLights scene={data.scene} />
    <MaterialProvider>
      <BatchedStudio><Studio scene={data.scene} textures={textures} cutaway={data.view === 'work'} firstOrder={!!data.stage} reducedMotion={data.reducedMotion} /></BatchedStudio>
      {data.stage && <SignatureLayer stage={data.stage} textures={textures} read={readSignature} />}
    </MaterialProvider>
    <Rig data={data} />
    <TextureCommit serial={data.serial} keys={data.keys} />
  </>;
}

async function process(message: Message) {
  if (message.type === 'start') {
    canvas = message.canvas;
    dimensions = { width: message.width, height: message.height, dpr: message.dpr };
    await loadWorkerSignFont();
    message.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      if (!closing) scope.postMessage({ type: 'failure', reason: 'WebGL context lost' });
    });
    root = createRoot(message.canvas);
    await root.configure(configuration());
    scope.postMessage({ type: 'started' });
  }
  if (message.type === 'frame') {
    lastFrame = message;
    const incoming = new Set(message.keys);
    for (const [key, texture] of textures) {
      if (incoming.has(key)) continue;
      textures.delete(key);
      retired.push(texture);
    }
    for (const { key, bitmap } of message.images) {
      const previous = textures.get(key);
      if (previous) retired.push(previous);
      const texture = new CanvasTexture(bitmap) as unknown as CanvasTexture;
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 4;
      textures.set(key, texture);
    }
    root?.render(createElement(Room, { data: message }));
  }
  if (message.type === 'resize') {
    dimensions = { width: message.width, height: message.height, dpr: message.dpr };
    await root?.configure(configuration());
  }
  if (message.type === 'visible') {
    visible = message.value;
    await root?.configure(configuration());
    scope.postMessage({ type: 'suspended', value: !visible });
    if (visible && lastFrame) root?.render(createElement(Room, { data: lastFrame }));
  }
  if (message.type === 'close') {
    closing = true;
    if (!canvas) { scope.close(); return; }
    unmountComponentAtNode(canvas, () => {
      for (const texture of textures.values()) { (texture.image as unknown as ImageBitmap).close(); texture.dispose(); }
      for (const texture of retired) { (texture.image as unknown as ImageBitmap).close(); texture.dispose(); }
      textures.clear();
      scope.postMessage({ type: 'closed', contextLost: renderer?.getContext().isContextLost() ?? false, geometries: renderer?.info.memory.geometries ?? -1, textures: renderer?.info.memory.textures ?? -1 });
      scope.close();
    });
  }
}
let queue = Promise.resolve();
scope.onmessage = event => {
  const message = event.data;
  if (message.type === 'signature') {
    signature = message.value;
    requestSignatureFrame?.();
    return;
  }
  queue = queue.then(() => process(message)).catch(error => {
    scope.postMessage({ type: 'failure', reason: error instanceof Error ? error.message : String(error) });
  });
};
