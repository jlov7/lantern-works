import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
import { MaterialProvider, BatchedStudio } from './materials';
import { Studio } from './Studio';
import type { CameraView, miniatureScene } from './adapter';
import { cameraPose, RoomLights } from './RoomScene';
import type { PrintTextures } from './ArtworkTextures';

export interface RendererMetrics { drawCalls: number; triangles: number; geometries: number; textures: number; frames: number; lastFrameMs: number }
export interface MiniatureCanvasProps {
  scene: ReturnType<typeof miniatureScene>;
  textures: PrintTextures;
  view: CameraView;
  phone: boolean;
  pan: number;
  visible: boolean;
  focusedJob: string | null;
  onContextLost: () => void;
  onMetrics: (metrics: RendererMetrics) => void;
  onTexturesCommitted: (textures: PrintTextures) => void;
}
function CameraRig({ view, phone, pan, scene, focusedJob, textures, onMetrics }: MiniatureCanvasProps) {
  const { camera, invalidate, gl, size } = useThree();
  const frames = useRef(0);
  useEffect(() => {
    const { target, offset } = cameraPose(view, phone, pan, scene, focusedJob, size.width, size.height);
    camera.position.copy(target).add(offset); camera.lookAt(target); camera.updateProjectionMatrix(); invalidate();
  }, [camera, invalidate, view, phone, pan, scene, focusedJob, size.width, size.height]);
  const shadows = JSON.stringify([view === 'work', scene.people, scene.neighbours, scene.desks.map(desk => desk.id), scene.surfaces.filter(art => art.visible).map(art => [art.key, art.at]), scene.wall.map(piece => piece.jobId), scene.kit, scene.scenarioId, scene.learning?.label, [...textures.keys()]]);
  // oxlint-disable-next-line react/immutability -- Three owns this mutable renderer API.
  useEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; invalidate(); }, [shadows, invalidate, gl]);
  useFrame(() => {
    const start = performance.now();
    frames.current++;
    queueMicrotask(() => onMetrics({ drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, frames: frames.current, lastFrameMs: Math.round((performance.now() - start) * 100) / 100 }));
  });
  return null;
}
export default memo(function MiniatureCanvas(props: MiniatureCanvasProps) {
  return <Canvas frameloop={props.visible ? 'demand' : 'never'} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ fov: 35, near: .1, far: 100, position: [11.5, 10, 14] }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} onCreated={({ gl }) => {
    gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.28;
    gl.domElement.dataset.miniatureRenderer = 'true';
  }} fallback={<span>Opening the illustrated studio.</span>}>
    <RoomLights scene={props.scene} />
    <MaterialProvider><BatchedStudio><Studio scene={props.scene} textures={props.textures} cutaway={props.view === 'work'} /></BatchedStudio></MaterialProvider>
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
