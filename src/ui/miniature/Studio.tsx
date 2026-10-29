import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, InstancedMesh, Object3D, SRGBColorSpace } from 'three';
import { Solid, type MaterialName } from './materials';
import { useMaterials } from './material-context';
import type { miniatureScene, Point } from './adapter';
import type { PrintTextures } from './ArtworkTextures';
import type { PersonLook } from './appearance';

type Scene = ReturnType<typeof miniatureScene>;
const PI = Math.PI;
function Timber({ at, size }: { at: Point; size: Point }) { return <Solid at={at} size={size} material="edge" />; }
function Repeated({ items, material }: { items: { at: Point; size: Point; turn?: number }[]; material: MaterialName }) {
  const ref = useRef<InstancedMesh>(null); const resources = useMaterials();
  useLayoutEffect(() => {
    const object = new Object3D();
    items.forEach((item, i) => { object.position.set(...item.at); object.scale.set(...item.size); object.rotation.set(0, item.turn ?? 0, 0); object.updateMatrix(); ref.current!.setMatrixAt(i, object.matrix); });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[resources.box, resources.materials[material], items.length]} castShadow receiveShadow dispose={null} />;
}
const PLANKS = Array.from({ length: 31 }, (_, i) => ({ at: [0, -.035, -3.05 + i * .2] as Point, size: [9.8, .12, .192] as Point }));
const COBBLES = Array.from({ length: 170 }, (_, i) => {
  const row = Math.floor(i / 34); const column = i % 34;
  return { at: [-5.8 + column * .35 + row % 2 * .17, -.11 + (i % 5) * .003, 3.4 + row * .35] as Point, size: [.33, .14, .32] as Point };
});
function Table({ at, width = 1.55, depth = .95, height = 1 }: { at: [number, number]; width?: number; depth?: number; height?: number }) {
  return <group position={[at[0], 0, at[1]]}>
    <Solid at={[0, height - .045, 0]} size={[width, .12, depth]} material="plank" />
    <Solid at={[0, height - .17, 0]} size={[width - .14, .15, depth - .1]} />
    {[-1, 1].flatMap(x => [-1, 1].map(z => <Timber key={`${x}${z}`} at={[x * (width / 2 - .13), height / 2 - .1, z * (depth / 2 - .12)]} size={[.095, height - .12, .095]} />))}
    <Timber at={[0, .25, 0]} size={[width - .24, .08, .09]} />
    <Solid at={[0, height - .2, depth / 2 + .015]} size={[width * .45, .15, .04]} material="timber" />
    <Solid shape="sphere" at={[0, height - .2, depth / 2 + .05]} size={[.035, .025, .025]} material="brass" />
  </group>;
}
function PaperStack({ at, count = 6, width = .58, depth = .42 }: { at: Point; count?: number; width?: number; depth?: number }) {
  return <group position={at}>{Array.from({ length: count }, (_, i) => <Solid key={i} at={[(i % 3 - 1) * .012, i * .018, (i % 2) * .01]} size={[width, .014, depth]} material={i % 3 === 0 ? 'cream' : 'paper'} rotation={[0, (i % 3 - 1) * .018, 0]} />)}</group>;
}
function Ink({ at }: { at: Point }) {
  return <group position={at}><Solid shape="cylinder" at={[0, .07, 0]} size={[.065, .14, .065]} material="iron" /><Solid shape="cylinder" at={[0, .15, 0]} size={[.058, .03, .058]} material="brass" /><Solid at={[.14, .025, .05]} size={[.17, .04, .1]} material="terra" /><Solid shape="cylinder" at={[.21, .09, -.15]} size={[.07, .18, .07]} material="green" />{[0, 1, 2].map(i => <Solid key={i} shape="cylinder" at={[.2 + i * .025, .27, -.16]} size={[.008, .3, .008]} material={i === 1 ? 'brass' : 'timber'} rotation={[0, 0, -.2 + i * .2]} />)}</group>;
}
function Lamp({ at, pendant = false, cutaway = false }: { at: Point; pendant?: boolean; cutaway?: boolean }) {
  return <group position={at}>
    {!cutaway && <>{pendant ? <Solid shape="cylinder" at={[0, .55, 0]} size={[.018, 1.05, .018]} material="iron" /> : <><Solid shape="cylinder" at={[.22, -.81, 0]} size={[.16, .05, .16]} material="iron" /><Solid shape="cylinder" at={[.22, -.48, 0]} size={[.023, .64, .023]} material="brass" /><Solid shape="cylinder" at={[.1, -.12, 0]} size={[.018, .36, .018]} material="iron" rotation={[0, 0, -.6]} /></>}
    <mesh position={[0, 0, 0]} castShadow><coneGeometry args={[.27, .2, 24, 1, true]} /><meshStandardMaterial color="#234638" side={2} roughness={.5} /></mesh>
    <mesh position={[0, -.08, 0]} rotation={[-PI / 2, 0, 0]}><circleGeometry args={[.24, 24]} /><meshStandardMaterial color="#ffdb8b" emissive="#ffc574" emissiveIntensity={1.6} /></mesh></>}
    <pointLight position={[0, -.19, 0]} color="#ffcb82" intensity={7} distance={4.3} decay={2} />
  </group>;
}
function Plant({ at, scale = 1 }: { at: Point; scale?: number }) {
  return <group position={at} scale={scale}><Solid shape="cylinder" at={[0, .21, 0]} size={[.2, .42, .2]} material="terra" /><Solid shape="cylinder" at={[0, .42, 0]} size={[.23, .07, .23]} material="edge" />{Array.from({ length: 9 }, (_, i) => <group key={i} rotation={[0, i * 2.4, 0]}><Solid shape="cylinder" at={[.07, .69 + i % 3 * .1, 0]} size={[.013, .55 + i % 3 * .14, .013]} material="edge" rotation={[0, 0, -.22]} /><Solid shape="sphere" at={[.19, .78 + i % 3 * .17, 0]} size={[.23, .065, .1]} material={i % 2 ? 'leaf' : 'greenLight'} rotation={[0, 0, .6]} /></group>)}</group>;
}
function PrintingPress() {
  return <group position={[1.45, 0, -2.2]}>
    <Solid at={[0, .15, 0]} size={[1.45, .23, .8]} material="iron" />
    {[-.52, .52].map(x => <group key={x}><Solid at={[x, .64, 0]} size={[.14, 1.0, .16]} material="iron" rotation={[0, 0, x * .1]} /><Solid at={[x, 1.3, -.22]} size={[.13, 1.05, .15]} material="iron" /><Solid at={[x, 1.81, -.2]} size={[.27, .1, .25]} material="brass" /></group>)}
    <Solid at={[0, .96, .13]} size={[1.65, .12, .95]} material="iron" />
    <Solid at={[0, 1.18, -.12]} size={[1.2, .12, .65]} material="brass" />
    <Solid at={[0, 1.72, -.2]} size={[1.2, .18, .22]} material="iron" />
    <Solid shape="cylinder" at={[0, 1.55, -.2]} size={[.07, .8, .07]} material="brass" />
    <Solid shape="torus" at={[.84, 1.12, -.05]} size={[.6, .6, .6]} material="iron" rotation={[0, PI / 2, 0]} />
    {[0, 1, 2, 3, 4, 5].map(i => <Solid key={i} shape="cylinder" at={[.84, 1.12, -.05]} size={[.023, 1.08, .023]} material="iron" rotation={[i * PI / 3, 0, 0]} />)}
    <Solid shape="sphere" at={[.86, 1.12, -.05]} size={[.14, .14, .14]} material="brass" />
    <Solid shape="cylinder" at={[0, 1.96, -.2]} size={[.027, .85, .027]} material="iron" rotation={[0, 0, PI / 2]} />
    <PaperStack at={[0, 1.04, .3]} count={2} width={.75} depth={.55} />
  </group>;
}
function DryingRack() {
  return <group position={[4.35, 0, -2.1]}>{[-.37, .37].flatMap(x => [-.42, .42].map(z => <Solid key={`${x}${z}`} at={[x, 1.03, z]} size={[.045, 2.06, .045]} material="iron" />))}{Array.from({ length: 9 }, (_, i) => <group key={i}><Solid at={[0, .24 + i * .2, 0]} size={[.8, .025, .9]} material="edge" />{i % 2 === 0 && <PaperStack at={[.02, .265 + i * .2, 0]} count={1} width={.64} depth={.77} />}</group>)}</group>;
}
function Cabinet() {
  return <group position={[-2.55, 0, -2.8]}><Solid at={[0, .6, 0]} size={[2.8, 1.2, .55]} material="green" /><Solid at={[0, 1.22, 0]} size={[2.95, .12, .68]} material="plank" />{Array.from({ length: 8 }, (_, i) => <group key={i}><Solid at={[-.7 + i % 2 * 1.4, .22 + Math.floor(i / 2) * .26, .3]} size={[1.32, .23, .04]} material="greenLight" /><Solid at={[-.7 + i % 2 * 1.4, .22 + Math.floor(i / 2) * .26, .335]} size={[.13, .026, .04]} material="brass" /></group>)}<PaperStack at={[-.6, 1.32, 0]} count={7} width={.85} /><Ink at={[.7, 1.31, 0]} /><Plant at={[-1.1, 1.3, 0]} scale={.6} /></group>;
}
export function Print({ texture, at, width = .66, height = .87, rotation = [-PI / 2, 0, -.12], framed = false }: { texture?: PrintTextures extends ReadonlyMap<string, infer T> ? T : never; at: Point; width?: number; height?: number; rotation?: Point; framed?: boolean }) {
  if (!texture) return null;
  return <group position={at} rotation={rotation}>
    {framed && <Solid at={[0, 0, -.055]} size={[width + .09, height + .09, .055]} material="edge" />}
    <mesh receiveShadow><planeGeometry args={[width, height]} /><meshStandardMaterial map={texture} roughness={.96} metalness={0} side={2} /></mesh>
    <mesh position={[0, 0, -.008]}><boxGeometry args={[width, height, .012]} /><meshStandardMaterial color="#e7d5b3" roughness={1} /></mesh>
  </group>;
}
function Counter({ cutaway }: { cutaway: boolean }) {
  return <group position={[-2.65, 0, 2.8]}>
    <Solid at={[0, .52, 0]} size={[3.3, 1.04, .25]} material="green" /><Solid at={[0, .11, .16]} size={[3.4, .1, .045]} material="edge" /><Solid at={[0, 1.0, .15]} size={[3.4, .06, .045]} material="brass" />
    {[-1.07, 0, 1.07].map(x => <group key={x}><Solid at={[x, .52, .14]} size={[.97, .85, .045]} material="edge" /><Solid at={[x, .52, .17]} size={[.86, .73, .02]} material="greenLight" /></group>)}
    <Solid at={[0, 1.12, 0]} size={[3.65, .15, .78]} material="plank" />
    {!cutaway && <>{[-1.75, 1.75].map(x => <group key={x}><Timber at={[x, 1.65, -.08]} size={[.16, 3.3, .18]} /><Solid at={[x, 1.68, .025]} size={[.065, 3.22, .025]} material="greenLight" /></group>)}
    <Timber at={[0, 3.14, -.08]} size={[3.8, .33, .25]} /><Sign text="LANTERN WORKS" at={[0, 3.14, .06]} width={2.85} height={.23} /><Solid at={[0, 2.975, .06]} size={[3.65, .024, .026]} material="brass" />
    <Solid at={[0, 2.9, -.08]} size={[3.5, .18, .15]} material="green" /></>}
    <Lamp at={[.8, 2.6, -.2]} pendant cutaway={cutaway} />
    <Ink at={[-1.3, 1.22, 0]} /><PaperStack at={[1.25, 1.22, 0]} count={6} width={.45} depth={.5} />
  </group>;
}
export const Studio = memo(function Studio({ scene, textures, cutaway }: { scene: Scene; textures: PrintTextures; cutaway: boolean }) {
  const wallPieces = scene.wall;
  const nailItems = useMemo(() => Array.from({ length: 42 }, (_, i) => ({ at: [-4.6 + i % 7 * 1.5, .032, -2.9 + Math.floor(i / 7) * 1.02] as Point, size: [.027, .008, .027] as Point })), []);
  return <>
    <Solid at={[-.65, -.45, .8]} size={[13.8, .58, 9.3]} material="edge" />
    <Solid at={[0, -.13, 0]} size={[9.95, .3, 6.6]} material="timber" />
    <Repeated items={PLANKS} material="plank" /><Repeated items={COBBLES} material="cobble" /><Repeated items={nailItems} material="iron" />
    <Solid at={[0, 1.55, -3.3]} size={[9.95, 3.15, .18]} material="plaster" />
    <Solid at={[-4.9, 1.55, -1.5]} size={[.18, 3.15, 3.6]} material="plaster" />
    <Timber at={[0, 3.12, -3.2]} size={[10.12, .23, .24]} /><Timber at={[-4.8, 3.12, -1.5]} size={[.25, .23, 3.6]} />
    {[-4.75, -.9, 4.8].map(x => <Timber key={x} at={[x, 1.5, -3.14]} size={[.16, 3.02, .18]} />)}
    <Timber at={[0, .13, -3.12]} size={[9.8, .21, .1]} />
    <Solid at={[0, .036, .9]} size={[3.3, .018, 1.25]} material="rug" />
    {Array.from({ length: 13 }, (_, i) => <Solid key={i} at={[-1.5 + i * .25, .05, .9]} size={[.045, .008, 1.15]} material={i % 2 ? 'cream' : 'edge'} />)}
    <Cabinet /><Counter cutaway={cutaway} /><PrintingPress /><DryingRack /><NeighbourFront /><KitBoard status={scene.kit} /><StreetDressing scenario={scene.scenarioId} />
    <Table at={[-2.55, 1.15]} width={1.8} depth={1.05} /><Table at={[-.45, -.8]} /><Table at={[1.15, -.8]} /><Table at={[3.2, -.8]} />
    <Table at={[-.8, 1.55]} width={.9} depth={.68} height={.8} />
    <PaperStack at={[-.82, .88, 1.55]} count={5} />
    <BenchDressing />
    {scene.desks.map((desk, i) => <AIDesk key={desk.id} index={i} working={desk.working} outage={scene.outage} />)}
    <Ink at={[-1.05, 1.04, -.9]} /><Ink at={[2.7, 1.04, -.85]} />
    <PaperStack at={[-2.95, 1.05, .9]} count={5} width={.45} depth={.6} />
    <Lamp at={[-.9, 1.9, -1.12]} /><Lamp at={[3.6, 1.9, -1.1]} />
    <Lamp at={[-2.7, 2.65, -2.65]} pendant />
    <Plant at={[-4.35, 0, 2.85]} /><Plant at={[4.7, 0, 2.8]} scale={1.15} /><Plant at={[-4.3, 1.3, -2.75]} scale={.7} />
    <Solid at={[-3.9, 1.62, -3.13]} size={[.1, .04, .04]} material="brass" />
    {wallPieces.map((piece, i) => <Print key={piece.jobId} at={[-3.9 + i * .76, 2.22, -3.175]} width={.57} height={piece.brief.proof ? .57 : .76} rotation={[0, 0, (i % 2 ? 1 : -1) * .025]} framed texture={textures.get(piece.jobId)} />)}
    {scene.keepsakes.map((piece, i) => <Print key={piece.id} at={[-4.785, 2.18, -2.55 + i * .9]} width={.66} height={.66} rotation={[0, PI / 2, (i % 2 ? 1 : -1) * .018]} framed texture={textures.get(`keepsake:${piece.id}`)} />)}
    {scene.surfaces.filter(art => art.visible).map(art => <Print key={art.key} at={art.at} texture={textures.get(art.key)} width={.72} height={art.piece.brief.proof ? .72 : .96} rotation={art.standing ? [-.35, 0, 0] : [-PI / 2, 0, -.12]} />)}
    {scene.preview && <Print at={[-2.65, 1.215, 2.73]} width={.65} height={.87} texture={textures.get('preview')} />}
    {scene.learning && <><PaperStack at={[-3.05, 1.05, 1.15]} count={2} width={.7} depth={.7} /><Print at={[-3.05, 1.09, 1.15]} width={.66} height={.66} texture={textures.get('studio-pattern')} /><Solid shape="cylinder" at={[-3.43, 1.08, 1.15]} size={[.012, .4, .012]} material="brass" rotation={[0, .2, PI / 2]} /></>}
    {scene.people.map(person => <Person key={person.worker.id} at={person.at} working={person.worker.working} look={person.look} />)}
    {scene.neighbours.map(person => <Person key={person.n.requestId} at={person.at} customer look={person.look} clem={person.n.castId === 'clem'} />)}
    <StreetLamp at={[-5.1, 0, 4.3]} /><StreetLamp at={[5.2, 0, 4.3]} />
    <Solid at={[-3.9, .17, 4.9]} size={[.09, .35, .09]} material="iron" /><Solid at={[3.9, .17, 4.9]} size={[.09, .35, .09]} material="iron" />
  </>;
});
function StreetLamp({ at }: { at: Point }) {
  return <group position={at}><Solid shape="cylinder" at={[0, .08, 0]} size={[.18, .16, .18]} material="iron" /><Solid shape="cylinder" at={[0, 1.18, 0]} size={[.035, 2.3, .035]} material="iron" /><Solid at={[0, 2.42, 0]} size={[.3, .4, .3]} material="brass" /><mesh position={[0, 2.43, 0]}><boxGeometry args={[.22, .32, .22]} /><meshStandardMaterial color="#ffc46c" emissive="#ffb351" emissiveIntensity={1.3} /></mesh><mesh position={[0, 2.7, 0]}><coneGeometry args={[.26, .21, 4]} /><meshStandardMaterial color="#263b33" /></mesh><pointLight position={[0, 2.3, .2]} color="#ffbd6e" intensity={4} distance={3.8} /></group>;
}

/** Adult proportions and quiet, legible gestures. The pose changes only with the recorded activity. */
function Person({ at, look, working = false, customer = false, clem = false }: { at: Point; look: PersonLook; working?: boolean; customer?: boolean; clem?: boolean }) {
  const { shirt, skin } = look;
  const turn = customer ? 0 : working ? 0 : PI;
  return <group position={at} rotation={[0, turn, 0]}>
    {[-1, 1].map(side => <group key={side}><Solid shape="cylinder" at={[side * .115, .37, .015]} size={[.085, .68, .085]} material="blue" rotation={[0, 0, side * -.025]} /><Solid shape="sphere" at={[side * .12, .055, -.045]} size={[.105, .07, .19]} material="edge" /></group>)}
    <Solid shape="torso" at={[0, 0, working ? -.04 : 0]} size={[look.broad ? 1.12 : 1, 1, .7]} material={shirt} /><Solid shape="sphere" at={[0, .77, 0]} size={[.18, .14, .13]} material="blue" />
    {look.apron && <><Solid at={[0, .98, -.151]} size={[.34, .56, .025]} material={customer && shirt === 'cream' ? 'green' : 'cream'} rotation={[working ? -.13 : 0, 0, 0]} /><Solid at={[0, .94, -.17]} size={[.24, .15, .025]} material={customer && shirt === 'cream' ? 'greenLight' : 'timber'} /></>}
    {look.scarf && <Solid at={[0, 1.29, -.12]} size={[.26, .12, .075]} material="terra" />}
    <Solid shape="cylinder" at={[0, 1.37, -.02]} size={[.075, .12, .075]} material={skin} />
    <group position={[0, 1.55, working ? -.065 : 0]} rotation={[working ? -.21 : .04, 0, 0]}>
      <Solid shape="head" at={[0, 0, 0]} size={[1, 1, .91]} material={skin} />
      <Solid shape="hair" at={[0, .01, .015]} size={[.133, .17, .128]} material={look.hair} />
      <Solid shape="sphere" at={[0, -.02, -.116]} size={[.022, .033, .029]} material={skin} />
      <Solid at={[0, -.072, -.12]} size={[.04, .007, .01]} material="edge" />
      {[-.13, .13].map(x => <Solid key={x} shape="sphere" at={[x, -.02, 0]} size={[.018, .033, .025]} material={skin} />)}
      {[-.055, .055].map(x => <Solid key={x} shape="sphere" at={[x, .015, -.118]} size={[.012, .009, .008]} material="iron" />)}
      {look.style === 'long' && <Solid shape="sphere" at={[0, -.045, .08]} size={[.14, .23, .08]} material={look.hair} />}
      {look.style === 'bun' && <Solid shape="sphere" at={[0, .15, .1]} size={[.09, .08, .09]} material={look.hair} />}
      {look.beard && <Solid shape="sphere" at={[0, -.1, -.05]} size={[.103, .085, .085]} material={look.beard} />}
      {look.style === 'cap' && <><Solid shape="cylinder" at={[0, .17, 0]} size={[.23, .035, .21]} material="edge" /><Solid shape="cylinder" at={[0, .25, 0]} size={[.145, .16, .135]} material="timber" /><Solid shape="cylinder" at={[0, .2, 0]} size={[.15, .045, .14]} material="blue" /></>}
      {look.glasses && <>{[-.057, .057].map(x => <Solid key={x} shape="torus" at={[x, .015, -.132]} size={[.046, .042, .046]} material="brass" shadow={false} />)}<Solid at={[0, .015, -.135]} size={[.025, .008, .008]} material="brass" shadow={false} /></>}
    </group>
    {[-1, 1].map(side => <group key={side}>
      <Solid shape="limb" at={[side * .245, working || clem ? 1.17 : 1.08, working || clem ? -.08 : 0]} size={[.078, .14, .078]} material={shirt} rotation={[working || clem ? -.65 : -.12, 0, side * -.2]} />
      <Solid shape="limb" at={[side * .24, clem ? 1.19 : working ? 1.08 : .94, working || clem ? -.3 : -.015]} size={[.06, .118, .06]} material={shirt} rotation={[working || clem ? -1.45 : -.18, 0, side * .13]} />
      <Solid shape="sphere" at={[side * .23, clem ? 1.18 : working ? 1.06 : .94, working || clem ? -.48 : -.04]} size={[.064, .04, .08]} material={skin} />
    </group>)}
    {clem && <><Solid at={[-.08, 1.05, -.16]} size={[.065, .4, .025]} material="edge" rotation={[0, 0, -.22]} /><Solid at={[.08, 1.05, -.16]} size={[.065, .4, .025]} material="edge" rotation={[0, 0, .22]} /></>}
    {customer && clem && <Solid at={[.18, 1.16, -.43]} size={[.4, .04, .3]} material="edge" rotation={[.3, 0, .1]} />}
  </group>;
}

function Sign({ text, at, width, height }: { text: string; at: Point; width: number; height: number }) {
  const [texture, setTexture] = useState<CanvasTexture>();
  useEffect(() => {
    let cancelled = false;
    let owned: CanvasTexture | undefined;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#243c31'; context.fillRect(0, 0, 1024, 128);
      context.fillStyle = '#d6b879'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = '52px "Young Serif"'; context.fillText(text, 512, 69);
      owned = new CanvasTexture(canvas); owned.colorSpace = SRGBColorSpace; setTexture(owned);
    });
    return () => { cancelled = true; owned?.dispose(); };
  }, [text]);
  return texture ? <mesh position={at}><planeGeometry args={[width, height]} /><meshStandardMaterial map={texture} roughness={1} /></mesh> : null;
}
function NeighbourFront() {
  return <group position={[-6.05, 0, .5]}>
    <Solid at={[0, 1.5, 0]} size={[1.9, 3, 3.5]} material="plaster" />
    <Solid at={[0, 1.3, 1.8]} size={[1.85, 2.6, .14]} material="green" />
    <Solid at={[0, 1.15, 1.9]} size={[1.52, 1.65, .03]} material="edge" />
    <mesh position={[0, 1.2, 1.93]}><planeGeometry args={[1.3, 1.45]} /><meshStandardMaterial color="#97683c" emissive="#ab6830" emissiveIntensity={.45} /></mesh>
    {[-.43, 0, .43].map(x => <Solid key={x} at={[x, 1.2, 1.96]} size={[.035, 1.5, .04]} material="brass" />)}
    <Solid at={[0, 1.1, 1.97]} size={[1.4, .045, .04]} material="brass" />
    <Solid at={[0, 2.3, 1.92]} size={[1.95, .42, .14]} material="edge" />
    <Sign text="MOONRISE" at={[0, 2.3, 2]} width={1.8} height={.25} />
    <Solid at={[0, .38, 1.97]} size={[1.45, .16, .23]} material="plank" />
    {[-.44, 0, .44].map(x => <Solid key={x} shape="sphere" at={[x, .84, 1.99]} size={[.18, .12, .1]} material="cream" />)}
    <Solid at={[0, 2.65, 1.8]} size={[2.1, .14, .5]} material="green" />
    <Plant at={[-.65, 0, 2.2]} scale={.8} />
  </group>;
}

function BenchDressing() {
  return <>
    {[-.45, 1.15, 3.2].map(x => <group key={x}>
      <PaperStack at={[x + .5, 1.04, -.9]} count={4} width={.35} depth={.52} />
      <Solid at={[x - .2, 1.04, -1.13]} size={[.7, .018, .045]} material="brass" rotation={[0, .07, 0]} />
      <Solid shape="cylinder" at={[x + .42, 1.06, -.5]} size={[.012, .42, .012]} material="edge" rotation={[0, .25, PI / 2]} />
      <Solid at={[x - .48, 1.05, -.55]} size={[.24, .025, .12]} material="terra" rotation={[0, -.2, 0]} />
      <Solid shape="cylinder" at={[x - .2, .51, .25]} size={[.22, .06, .22]} material="edge" />
      <Solid shape="cylinder" at={[x - .2, .25, .25]} size={[.035, .5, .035]} material="iron" />
      <Solid shape="sphere" at={[x + .43, 1.018, -.51]} size={[.08, .002, .025]} material="iron" shadow={false} rotation={[0, .4, 0]} />
      <Solid shape="sphere" at={[x + .36, 1.019, -.49]} size={[.027, .002, .035]} material="iron" shadow={false} />
    </group>)}
    <group position={[-3.35, 1.31, -2.65]} rotation={[0, -.15, 0]}>
      <Solid at={[0, .012, 0]} size={[.55, .025, .4]} material="blue" />
      <Solid at={[.03, .03, .02]} size={[.48, .018, .36]} material="paper" />
      <Solid at={[-.13, .041, .02]} size={[.014, .006, .31]} material="edge" />
      <Solid shape="cylinder" at={[.5, .09, .04]} size={[.085, .18, .085]} material="cream" />
      <Solid shape="cylinder" at={[.5, .183, .04]} size={[.066, .006, .066]} material="edge" shadow={false} />
      <Solid shape="torus" at={[.6, .09, .04]} size={[.07, .07, .07]} material="cream" />
    </group>
    <Solid at={[.45, 1.025, -1.16]} size={[.45, .016, .28]} material="blue" rotation={[0, -.23, 0]} />
    <Solid at={[.52, .91, -1.3]} size={[.24, .23, .015]} material="blue" rotation={[.12, .1, -.1]} />
    <Solid at={[1.75, 2.49, -3.04]} size={[2.45, .09, .4]} material="edge" />
    {Array.from({ length: 7 }, (_, i) => <group key={i} position={[.8 + i * .31, 2.54, -2.98]}>
      <Solid shape="cylinder" at={[0, .12, 0]} size={[.065, .24, .065]} material={i % 3 === 0 ? 'terra' : i % 3 === 1 ? 'green' : 'iron'} />
      <Solid shape="cylinder" at={[0, .26, 0]} size={[.043, .06, .043]} material="brass" />
    </group>)}
    <PaperStack at={[4.05, .14, .25]} width={.8} depth={.65} count={11} />
    <PaperStack at={[4.05, .36, .25]} width={.74} depth={.6} count={7} />
  </>;
}

function KitBoard({ status }: { status: Scene['kit'] }) {
  const pages = status === 'ready' ? 6 : status === 'building' ? 3 : 0;
  return <group position={[3.7, 2.52, -3.08]}>
    <Solid at={[0, 0, 0]} size={[1.08, .83, .04]} material="edge" />
    <Solid at={[0, 0, .025]} size={[.98, .73, .025]} material="timber" />
    {Array.from({ length: pages }, (_, i) => <group key={i} position={[-.32 + i % 3 * .32, .17 - Math.floor(i / 3) * .33, .06]}>
      <Solid at={[0, 0, 0]} size={[.24, .28, .01]} material="paper" />
      <Solid at={[0, .07, .01]} size={[.19, .06, .008]} material={status === 'ready' ? 'green' : 'terra'} />
      <Solid at={[0, -.02, .01]} size={[.17, .012, .008]} material="edge" />
      <Solid shape="sphere" at={[0, .14, .014]} size={[.02, .02, .014]} material="brass" />
    </group>)}
  </group>;
}

function StreetDressing({ scenario }: { scenario?: string }) {
  if (scenario === 'festival-week') return <group>
    <Solid shape="cylinder" at={[-.85, 2.98, -3.0]} size={[.009, 7.3, .009]} rotation={[0, 0, PI / 2]} material="iron" shadow={false} />
    {Array.from({ length: 15 }, (_, i) => <Solid key={i} shape="pennant" at={[-4.25 + i * .48, 2.87, -2.99]} size={[.17, .2, 1]} material={(['rug', 'brass', 'paper'] as const)[i % 3]} rotation={[0, 0, -PI / 2]} shadow={false} />)}
  </group>;
  if (scenario === 'bespoke-rush') return <group>
    {[3.28, 4.13].map(x => <group key={x}><Solid at={[x, 1.88, -3.02]} size={[.09, .45, .015]} material="blue" rotation={[0, 0, .08]} /><Solid at={[x + .07, 1.88, -3.0]} size={[.07, .4, .012]} material="paper" rotation={[0, 0, -.12]} /></group>)}
  </group>;
  return null;
}
function AIDesk({ index, working, outage }: { index: number; working: boolean; outage: boolean }) {
  const x = 2.8 + index * 1.2;
  return <group><Table at={[x, 1.6]} width={1.05} depth={.7} height={.93} />
    <Solid at={[x, 1.2, 1.35]} size={[.62, .42, .065]} material="iron" />
    <Solid at={[x, 1.02, 1.35]} size={[.045, .22, .08]} material="brass" />
    <mesh position={[x, 1.2, 1.39]}><planeGeometry args={[.53, .33]} /><meshStandardMaterial color={outage ? '#5b342b' : '#274840'} emissive={working && !outage ? '#62ab8c' : '#102922'} emissiveIntensity={working ? .65 : .15} /></mesh>
    <Solid at={[x, .98, 1.58]} size={[.45, .025, .18]} material="green" />
    <Sign text={`AI ${index + 1}`} at={[x, .78, 1.98]} width={.32} height={.08} />
  </group>;
}
