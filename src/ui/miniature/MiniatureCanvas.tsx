import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, PCFShadowMap, Object3D, Vector3 } from 'three';
import { MaterialProvider, BatchedStudio } from './materials';
import { Studio } from './Studio';
import type { CameraView, miniatureScene, Point } from './adapter';
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
    const active = scene.surfaces.find(art => art.key === focusedJob) ?? scene.surfaces.find(art => scene.people.some(person => person.worker.working && person.worker.jobId === art.key)) ?? scene.surfaces[0];
    const work: Point = focusedJob === 'studio-pattern' ? [-3.05, 1.05, 1.15] : active?.at ?? [0, 1, -.8];
    const target = view === 'window' ? new Vector3(-2.6, 1.22, 2.65) : view === 'work' ? new Vector3(work[0], 1.05, work[2] + .1) : new Vector3(-.55, .85, .65);
    const offset = view === 'window' ? new Vector3(phone ? 3.7 : 4.8, phone ? 1.45 : 2.0, phone ? -.85 : -.95) : view === 'work' ? active?.stage === 'brief' || focusedJob === 'studio-pattern' ? new Vector3(1.2, 4.8, 2.6) : new Vector3(phone ? 1.7 : 1.6, phone ? 3.5 : 2.6, phone ? 4.5 : 3.0) : new Vector3(phone ? 12 : 10.4, phone ? 10 : 8.5, phone ? 14 : 12.6);
    if (view === 'studio' && phone) offset.multiplyScalar(Math.max(1, 1.15 / (size.width / size.height)));
    offset.applyAxisAngle(new Vector3(0, 1, 0), pan);
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
  const light = props.scene.light;
  return <Canvas frameloop={props.visible ? 'demand' : 'never'} shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ fov: 35, near: .1, far: 100, position: [11.5, 10, 14] }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} onCreated={({ gl }) => {
    gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.28;
    gl.domElement.dataset.miniatureRenderer = 'true';
  }} fallback={<span>Opening the illustrated studio.</span>}>
    <fog attach="fog" args={['#233735', 25, 49]} />
    <hemisphereLight args={[light.skyMid, '#5d503c', light.closing > .5 ? 1.4 : 2.0]} />
    <directionalLight position={[-6, 11, 6]} intensity={light.closing > .5 ? 1.3 : 2.8} color={light.closing > .5 ? '#97b4d2' : '#ffe5b5'} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-normalBias={.035} shadow-bias={-.0001} />
    <directionalLight position={[7, 6, -4]} intensity={1.1} color="#a9c9cc" />
    <BenchLight scene={props.scene} />
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

function BenchLight({ scene }: { scene: MiniatureCanvasProps['scene'] }) {
  const target = useMemo(() => new Object3D(), []);
  const active = scene.surfaces.find(art => scene.people.some(person => person.worker.working && person.worker.jobId === art.key));
  const point = active?.at ?? [-2.55, 1.04, 1.15];
  return <><primitive object={target} position={point} /><spotLight position={[point[0] - 1.3, 5, point[2] + .7]} target={target} angle={.65} penumbra={.7} intensity={active ? 40 : 24} color="#ffd297" castShadow shadow-mapSize={[1024, 1024]} /></>;
}
