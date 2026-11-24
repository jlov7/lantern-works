import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type Ref } from 'react';
import { CanvasTexture, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, type Group, type Mesh, type Texture } from 'three';
import { useFrame } from '@react-three/fiber';
import { bayAppearance } from '../game/bayChoice';
import { BEAT_MS, pressEase, pressFrame } from '../game/pressPull';
import { signatureTime, type SignatureState } from '../game/signatureState';
import { BAYS, PRESS_ORIGIN, PLATEN, SIGNATURE_SHADOWS, WHEEL, leaverPose, type Bay } from '../game/signatureTargets';
import type { FirstOrderStage } from '../game/firstOrderScene';
import { customerLook } from './appearance';
import type { PrintTextures } from './ArtworkTextures';
import { useMaterials } from './material-context';
import { Person, type PersonParts } from './Studio';
import { Solid } from './materials';

const PI = Math.PI;
const bays = ['room', 'band'] as const;
type ReadSignature = () => SignatureState | undefined;
const noSignature = () => undefined;

function makePlaceholder() {
  const canvas = typeof document === 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const painter = canvas.getContext('2d')!;
  painter.fillStyle = '#e7d5b3';
  painter.fillRect(0, 0, 1, 1);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function InteractivePress({ ink, texture, read }: { ink: MeshStandardMaterial; texture: Texture; read: ReadSignature }) {
  const platen = useRef<Mesh>(null);
  const wheel = useRef<Group>(null);
  const glow = useRef(0);
  const wheelScale = useRef(1);
  const resources = useMaterials();
  const live = useMemo(() => {
    const brass = resources.materials.brass.clone();
    const iron = resources.materials.iron.clone();
    brass.emissive.set('#f3c578');
    iron.emissive.set('#f3c578');
    brass.emissiveIntensity = 0;
    iron.emissiveIntensity = 0;
    return { brass, iron };
  }, [resources]);
  useEffect(() => () => { live.brass.dispose(); live.iron.dispose(); }, [live]);
  // oxlint-disable-next-line react/immutability -- This material is owned and used only by Three.
  useEffect(() => { ink.map = texture; }, [ink, texture]);
  useFrame(({ gl, invalidate }, delta) => {
    const state = read();
    if (!state || !platen.current || !wheel.current) return;
    const now = signatureTime();
    const face = pressFrame(state, now);
    const idleTime = state.idleAt === null ? -1 : now - state.idleAt - 800;
    const nudge = !state.reduced && state.commitAt === null && state.pull === 0 && idleTime >= 0 && idleTime < 2400;
    const turn = face.wheelTurn - (nudge ? .04 * (1 - Math.cos(idleTime / 1200 * 2 * PI)) : 0);
    const intensity = state.pressed === 'press' ? .10 : state.hover === 'press' ? .18 : 0;
    const scale = state.hover === 'press' && state.pressed !== 'press' ? 1.03 : 1;
    const rate = state.reduced ? 1 : 1 - Math.exp(-delta / .06);
    glow.current += (intensity - glow.current) * rate;
    if (Math.abs(intensity - glow.current) < .003) glow.current = intensity;
    const changed = platen.current.position.y !== face.platenY || wheel.current.rotation.x !== turn;
    platen.current.position.y = face.platenY;
    wheel.current.rotation.x = turn;
    wheelScale.current += (scale - wheelScale.current) * rate;
    if (Math.abs(scale - wheelScale.current) < .0005) wheelScale.current = scale;
    wheel.current.scale.setScalar(wheelScale.current);
    // oxlint-disable-next-line react/immutability -- The shader uniform belongs to the live Three material.
    live.brass.emissiveIntensity = glow.current;
    live.iron.emissiveIntensity = glow.current;
    // oxlint-disable-next-line react/immutability -- Three applies this property directly in the render pass.
    ink.opacity = face.inkOpacity;
    // oxlint-disable-next-line react/immutability -- Three updates the depth pass when the moving parts move.
    if (SIGNATURE_SHADOWS && changed) gl.shadowMap.needsUpdate = true;
    if (face.animating || nudge || glow.current !== intensity || wheelScale.current !== scale) invalidate();
  });
  return <group position={PRESS_ORIGIN}>
    <mesh ref={platen} geometry={resources.box} material={live.brass} position={[0, PLATEN.restY, PLATEN.local[2]]} scale={[1.2, .12, .65]} castShadow={SIGNATURE_SHADOWS} receiveShadow dispose={null} />
    <group ref={wheel} position={WHEEL.local}>
      <mesh geometry={resources.torus} material={live.iron} rotation={[0, PI / 2, 0]} scale={WHEEL.radius} castShadow={SIGNATURE_SHADOWS} receiveShadow dispose={null} />
      {[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} geometry={resources.cylinder} material={live.iron} scale={[.023, 1.08, .023]} rotation={[i * PI / 3, 0, 0]} castShadow={SIGNATURE_SHADOWS} receiveShadow dispose={null} />)}
      <mesh geometry={resources.sphere} material={live.brass} position={[.02, 0, 0]} scale={[.14, .14, .14]} castShadow={SIGNATURE_SHADOWS} receiveShadow dispose={null} />
    </group>
    <Solid at={[-.012, 1.04, .3]} size={[.75, .014, .55]} material="cream" rotation={[0, -.018, 0]} />
    <Solid at={[0, 1.058, .31]} size={[.75, .014, .55]} material="paper" />
    <mesh position={[0, 1.068, .3]} rotation={[-PI / 2, 0, 0]} material={ink} receiveShadow>
      <planeGeometry args={[.62, .62]} />
    </mesh>
  </group>;
}

function BayPrint({ texture, delivered, read, ref }: {
  texture?: Texture;
  delivered: { key: string; texture: Texture } | null;
  read: ReadSignature;
  ref: Ref<Group>;
}) {
  const original = useRef<Mesh>(null);
  const finished = useRef<Mesh>(null);

  useFrame(({ invalidate }) => {
    if (!original.current) return;
    if (!finished.current || !delivered) {
      original.current.visible = !!texture;
      return;
    }
    const input = read();
    const hang = input?.hang;
    const visible = hang?.key === delivered.key;
    original.current.visible = !!texture && !visible;
    finished.current.visible = visible;
    if (!visible) return;
    const progress = input?.reduced ? 1 : Math.min(1, Math.max(0, (signatureTime() - hang.at) / 480));
    const ease = pressEase(progress, 0, 0, .58, 1);
    finished.current.scale.setScalar(.90 + .10 * ease);
    finished.current.position.y = .06 * (1 - ease);
    if (progress < 1) invalidate();
  });

  return <group ref={ref}>
    <mesh ref={original} position={[0, 0, .035]} visible={!!texture} receiveShadow>
      <planeGeometry args={[.72, .72]} />
      <meshStandardMaterial map={texture} roughness={.96} />
    </mesh>
    {delivered && <mesh ref={finished} position={[0, .06, .035]} scale={.90} visible={false} receiveShadow>
      <planeGeometry args={[.72, .72]} />
      <meshStandardMaterial map={delivered.texture} roughness={.96} />
    </mesh>}
  </group>;
}

function ClemJazzBay({ bay, stage, textures, read }: { bay: Bay; stage: FirstOrderStage; textures: PrintTextures; read: ReadSignature }) {
  const resources = useMaterials();
  const group = useRef<Group>(null);
  const posterGroup = useRef<Group>(null);
  const values = useRef({ frame: 0, glass: .30, outline: 0, scale: 1, poster: 1 });
  const materials = useMemo(() => ({
    frame: new MeshStandardMaterial({ color: '#503a2b', roughness: .92, emissive: '#f3c578', emissiveIntensity: 0 }),
    glass: new MeshStandardMaterial({ color: '#97683c', roughness: .68, emissive: '#ab6830', emissiveIntensity: .30 }),
    outline: new MeshBasicMaterial({ color: '#f3c578', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  }), []);
  useEffect(() => () => { materials.frame.dispose(); materials.glass.dispose(); materials.outline.dispose(); }, [materials]);
  const key = stage.compare?.[bay] ?? stage.bayPosters?.[bay];
  const texture = key ? textures.get(key) : undefined;
  const hung = !stage.compare && stage.hung?.bay === bay ? stage.hung.key : undefined;
  const delivered = hung ? textures.get(hung) : undefined;

  useFrame(({ invalidate }, delta) => {
    if (!group.current || !posterGroup.current) return;
    const input = read();
    const choosing = stage.shot === 'choose' || !!stage.compare;
    const hover = choosing && input?.hover !== 'press' ? input?.hover ?? null : null;
    const pressed = choosing && input?.pressed !== 'press' ? input?.pressed ?? null : null;
    const target = bayAppearance(bay, choosing ? stage.selected : null, hover, pressed, choosing ? input?.focus ?? null : null);
    if (stage.compare && stage.selected !== bay && hover !== bay && pressed !== bay) target.glass = .70;
    if (hung && !choosing) target.glass = .95;
    const rate = input?.reduced ? 1 : 1 - Math.exp(-delta / .06);
    const current = values.current;
    let moving = false;
    for (const prop of ['frame', 'glass', 'outline', 'scale', 'poster'] as const) {
      const next = current[prop] + (target[prop] - current[prop]) * rate;
      current[prop] = Math.abs(next - target[prop]) < .002 ? target[prop] : next;
      moving ||= current[prop] !== target[prop];
    }
    group.current.scale.setScalar(current.scale);
    posterGroup.current.scale.setScalar(current.poster);
    // oxlint-disable-next-line react/immutability -- This shader uniform belongs to the live bay material.
    materials.frame.emissiveIntensity = current.frame;
    // oxlint-disable-next-line react/immutability -- This shader uniform belongs to the live bay material.
    materials.glass.emissiveIntensity = current.glass;
    // oxlint-disable-next-line react/immutability -- The always-mounted outline fades through its material.
    materials.outline.opacity = current.outline;
    if (moving) invalidate();
  });

  return <group ref={group} position={BAYS[bay].centre} rotation={[0, PI, 0]}>
    {[-1, 1].map(side => <group key={side}>
      <mesh geometry={resources.box} scale={[1.2, .08, .06]} position={[0, side * .61, .03]} material={materials.frame} castShadow receiveShadow dispose={null} />
      <mesh geometry={resources.box} scale={[.08, 1.3, .06]} position={[side * .56, 0, .03]} material={materials.frame} castShadow receiveShadow dispose={null} />
    </group>)}
    <mesh material={materials.glass} position={[0, 0, .01]} receiveShadow>
      <planeGeometry args={[1.04, 1.14]} />
    </mesh>
    <BayPrint ref={posterGroup} texture={texture} delivered={hung && delivered ? { key: hung, texture: delivered } : null} read={read} />
    <mesh position={[0, 0, -.005]} material={materials.outline}>
      <planeGeometry args={[1.34, 1.44]} />
    </mesh>
  </group>;
}

function ClemJazzBays({ stage, textures, read }: { stage: FirstOrderStage; textures: PrintTextures; read: ReadSignature }) {
  return <>{bays.map(bay => <ClemJazzBay key={bay} bay={bay} stage={stage} textures={textures} read={read} />)}</>;
}
function Walker({ person, index, bay, read }: { person: FirstOrderStage['queue'][number]; index: number; bay?: Bay; read: ReadSignature }) {
  const figure = useRef<Group>(null);
  const parts = useRef<PersonParts | null>(null);
  const lastSwing = useRef(0);
  const takeParts = useCallback((body: PersonParts) => { parts.current = body; }, []);
  useLayoutEffect(() => {
    if (!SIGNATURE_SHADOWS) figure.current?.traverse(node => { node.castShadow = false; });
  }, []);
  useFrame(({ gl, invalidate }) => {
    const state = read();
    const node = figure.current;
    if (!node || !state || state.leaveAt === null || index < 0) return;
    const elapsed = signatureTime() - state.leaveAt - (state.reduced ? 0 : index * BEAT_MS.stagger);
    const pose = leaverPose(index, elapsed, state.reduced, bay);
    node.position.set(...pose.at);
    node.rotation.y = pose.turn;
    node.visible = pose.visible;
    const swing = !state.reduced && elapsed > 0 && pose.visible ? Math.sin(elapsed / 1000 * 1.8 * 2 * PI) : 0;
    if (parts.current && swing !== lastSwing.current) {
      parts.current.legs.forEach((leg, side) => { leg.rotation.x = swing * (side ? -.35 : .35); });
      parts.current.arms.forEach((arm, side) => { arm.rotation.x = swing * (side ? .25 : -.25); });
      parts.current.update();
      lastSwing.current = swing;
    }
    // oxlint-disable-next-line react/immutability -- The renderer owns the moving figure’s shadows.
    if (SIGNATURE_SHADOWS) gl.shadowMap.needsUpdate = true;
    if (pose.visible) invalidate();
  });
  return <group ref={figure} position={person.at}>
    <Person at={[0, 0, 0]} look={customerLook(person.castId)} customer parts={takeParts} />
  </group>;
}

function StreetCast({ stage, read }: { stage: FirstOrderStage; read: ReadSignature }) {
  return <>
    {stage.queue.map(person => <Walker key={person.requestId} person={person} index={stage.leavers.indexOf(person.requestId)} bay={stage.leaverBays?.[person.requestId]} read={read} />)}
    <Person at={[...stage.clem]} turn={0} look={customerLook('clem')} clem />
  </>;
}

export function SignatureLayer({ stage, textures, read = noSignature }: { stage: FirstOrderStage; textures: PrintTextures; read?: ReadSignature }) {
  const placeholder = useMemo(() => makePlaceholder(), []);
  const ink = useMemo(() => new MeshStandardMaterial({ map: placeholder, transparent: true, opacity: 0, roughness: .96 }), [placeholder]);
  useEffect(() => () => { ink.dispose(); placeholder.dispose(); }, [ink, placeholder]);
  const key = stage.bayPosters?.[stage.selected];
  const proof = key && textures.get(key);
  return <>
    <ClemJazzBays stage={stage} textures={textures} read={read} />
    <InteractivePress ink={ink} texture={proof || placeholder} read={read} />
    <StreetCast stage={stage} read={read} />
  </>;
}
