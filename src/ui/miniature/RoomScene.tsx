import { useMemo } from 'react';
import { Object3D, Vector3 } from 'three';
import type { CameraView, miniatureScene, Point } from './adapter';

type Scene = ReturnType<typeof miniatureScene>;

// oxlint-disable-next-line react/only-export-components -- Both renderers share this camera calculation.
export function cameraPose(view: CameraView, phone: boolean, pan: number, scene: Scene, focusedJob: string | null, width: number, height: number) {
  const active = scene.surfaces.find(art => art.key === focusedJob) ?? scene.surfaces.find(art => scene.people.some(person => person.worker.working && person.worker.jobId === art.key)) ?? scene.surfaces[0];
  const work: Point = focusedJob === 'studio-pattern' ? [-3.05, 1.05, 1.15] : active?.at ?? [0, 1, -.8];
  const target = view === 'window' ? new Vector3(-2.6, 1.22, 2.65) : view === 'work' ? new Vector3(work[0], 1.05, work[2] + .1) : new Vector3(-.55, .85, .65);
  const offset = view === 'window' ? new Vector3(phone ? 3.7 : 4.8, phone ? 1.45 : 2.0, phone ? -.85 : -.95) : view === 'work' ? active?.stage === 'brief' || focusedJob === 'studio-pattern' ? new Vector3(1.2, 4.8, 2.6) : new Vector3(phone ? 1.7 : 1.6, phone ? 3.5 : 2.6, phone ? 4.5 : 3.0) : new Vector3(phone ? 12 : 10.4, phone ? 10 : 8.5, phone ? 14 : 12.6);
  if (view === 'studio' && phone) offset.multiplyScalar(Math.max(1, 1.15 / (width / height)));
  offset.applyAxisAngle(new Vector3(0, 1, 0), pan);
  return { target, offset };
}

export function RoomLights({ scene }: { scene: Scene }) {
  const light = scene.light;
  const target = useMemo(() => new Object3D(), []);
  const active = scene.surfaces.find(art => scene.people.some(person => person.worker.working && person.worker.jobId === art.key));
  const point = active?.at ?? [-2.55, 1.04, 1.15];
  return <>
    <fog attach="fog" args={['#233735', 25, 49]} />
    <hemisphereLight args={[light.skyMid, '#5d503c', light.closing > .5 ? 1.4 : 2.0]} />
    <directionalLight position={[-6, 11, 6]} intensity={light.closing > .5 ? 1.3 : 2.8} color={light.closing > .5 ? '#97b4d2' : '#ffe5b5'} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-normalBias={.035} shadow-bias={-.0001} />
    <directionalLight position={[7, 6, -4]} intensity={1.1} color="#a9c9cc" />
    <primitive object={target} position={point} />
    <spotLight position={[point[0] - 1.3, 5, point[2] + .7]} target={target} angle={.65} penumbra={.7} intensity={active ? 40 : 24} color="#ffd297" castShadow shadow-mapSize={[1024, 1024]} />
  </>;
}
