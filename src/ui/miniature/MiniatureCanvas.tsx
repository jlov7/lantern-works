import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import { MaterialProvider, BatchedStudio } from './materials';
import { Studio } from './Studio';
import type { CameraView, miniatureScene } from './adapter';
import { cameraPose, RoomLights } from './RoomScene';
import type { PrintTextures } from './ArtworkTextures';
import { warmRoom } from './warmup';
import { SignatureLayer } from './SignatureLayer';
import { renderSignatureCamera, signatureSize } from './signatureRig';
import type { FirstOrderStage } from '../game/firstOrderScene';
import type { SignatureChannel } from '../game/signatureState';

export interface RendererMetrics { drawCalls: number; triangles: number; geometries: number; textures: number; frames: number; lastFrameMs: number }
export interface MiniatureCanvasProps {
  scene: ReturnType<typeof miniatureScene>;
  textures: PrintTextures;
  warmupReady: boolean;
  view: CameraView;
  phone: boolean;
  pan: number;
  visible: boolean;
  focusedJob: string | null;
  reducedMotion?: boolean;
  onContextLost: () => void;
  onWarmed?: (ms: number) => void;
  stage?: FirstOrderStage;
  overlayWidth?: number;
  signature?: SignatureChannel;
  onSignatureAck?: (seq: number) => void;
  onMetrics: (metrics: RendererMetrics) => void;
  onTexturesCommitted: (textures: PrintTextures) => void;
}
function CameraRig({ view, phone, pan, scene, focusedJob, textures, warmupReady, onContextLost, onWarmed, onMetrics, stage, overlayWidth, signature, onSignatureAck }: MiniatureCanvasProps) {
  const { camera, invalidate, gl, size } = useThree();
  const frames = useRef(0);
  const acknowledged = useRef(-1);
  const warm = useRef<'pending' | 'warming' | 'ready'>('pending');
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (stage) { invalidate(); return; }
    const { target, offset } = cameraPose(view, phone, pan, scene, focusedJob, size.width, size.height);
    camera.position.copy(target).add(offset); camera.lookAt(target); camera.updateProjectionMatrix(); invalidate();
  }, [camera, invalidate, view, phone, pan, scene, focusedJob, size.width, size.height, stage, signature, overlayWidth]);
  useEffect(() => signature?.listen(invalidate), [signature, invalidate]);
  const shadows = JSON.stringify([view === 'work', scene.people, scene.neighbours, scene.desks.map(desk => desk.id), scene.surfaces.filter(art => art.visible).map(art => [art.key, art.at]), scene.wall.map(piece => piece.jobId), scene.kit, scene.scenarioId, scene.learning?.label, [...textures.keys()]]);
  // oxlint-disable-next-line react/immutability -- Three owns this mutable renderer API.
  useEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; invalidate(); }, [shadows, warmupReady, invalidate, gl]);
  useFrame(({ scene: room }) => {
    const input = signature?.read();
    if (stage && renderSignatureCamera(camera, stage, signatureSize(size.width, size.height, overlayWidth ?? 0), input)) invalidate();
    if (warm.current !== 'ready') {
      if (warm.current === 'warming' || !warmupReady) return;
      warm.current = 'warming';
      void warmRoom(gl, room, camera).then(ms => {
        if (!mounted.current) return;
        warm.current = 'ready';
        gl.domElement.dataset.warmupMs = String(ms);
        onWarmed?.(ms);
        invalidate();
      }).catch(() => { if (mounted.current) onContextLost(); });
      return;
    }
    const start = performance.now();
    gl.render(room, camera);
    frames.current++;
    if (input && input.seq > acknowledged.current) {
      acknowledged.current = input.seq;
      queueMicrotask(() => onSignatureAck?.(input.seq));
    }
    if (frames.current === 1 || !stage) queueMicrotask(() => onMetrics({ drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, frames: frames.current, lastFrameMs: Math.round((performance.now() - start) * 100) / 100 }));
  }, 1);
  return null;
}
export default memo(function MiniatureCanvas(props: MiniatureCanvasProps) {
  return <Canvas frameloop={props.visible ? 'demand' : 'never'} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ fov: 35, near: .1, far: 100, position: [11.5, 10, 14] }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} onCreated={({ gl }) => {
    gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.28;
    gl.domElement.dataset.miniatureRenderer = 'true';
  }} fallback={<span>Opening the illustrated studio.</span>}>
    <RoomLights scene={props.scene} />
    <MaterialProvider>
      <BatchedStudio><Studio scene={props.scene} textures={props.textures} cutaway={props.view === 'work'} firstOrder={!!props.stage} reducedMotion={props.reducedMotion} /></BatchedStudio>
      {props.stage && <SignatureLayer stage={props.stage} textures={props.textures} read={props.signature?.read} />}
    </MaterialProvider>
    <ContextGuard onLost={props.onContextLost} /><CameraRig {...props} />
    <TextureCommit textures={props.textures} onCommitted={props.onTexturesCommitted} />
  </Canvas>;
});

function TextureCommit({ textures, onCommitted }: { textures: PrintTextures; onCommitted: MiniatureCanvasProps['onTexturesCommitted'] }) {
  useLayoutEffect(() => onCommitted(textures), [textures, onCommitted]);
  return null;
}
function ContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl, onLost]);
  return null;
}
