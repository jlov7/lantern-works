import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, Float32BufferAttribute, LatheGeometry, Vector2, MeshStandardMaterial, Object3D, RepeatWrapping, SphereGeometry, SRGBColorSpace, TorusGeometry, Group, InstancedMesh, Mesh, Matrix4, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ReactNode } from 'react';
import type { Point } from './adapter';
import type { PersonLook } from './appearance';
import { Materials, useMaterials } from './material-context';

const COLORS = { timber: '#89613f', edge: '#503a2b', plank: '#a47d53', plaster: '#bfb29a', green: '#254139', greenLight: '#416050', iron: '#292e2c', brass: '#a28a50', paper: '#e9d9b8', dark: '#162824', cobble: '#596469', rug: '#783d32', skin: '#a77750', skinLight: '#c99c78', skinDark: '#76513d', silver: '#b5b3a6', cream: '#c3af8f', hair: '#302b24', leaf: '#506148', blue: '#303b4b', terra: '#885941' };
export type MaterialName = keyof typeof COLORS;
function grainTexture(wood: boolean) {
  const canvas = typeof document === 'undefined' ? new OffscreenCanvas(256, 256) : document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#aaa18c'; ctx.fillRect(0, 0, 256, 256);
  let seed = 71;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = `rgba(${rand() > .5 ? '255,244,215' : '35,26,15'},${rand() * .19})`;
    ctx.fillRect(rand() * 256, rand() * 256, wood ? 1 + rand() * 70 : 1 + rand() * 3, .5 + rand() * 1.6);
  }
  const texture = new CanvasTexture(canvas); texture.wrapS = texture.wrapT = RepeatWrapping; texture.repeat.set(2, 2); texture.colorSpace = SRGBColorSpace;
  return texture;
}
function makeResources() {
  const wood = grainTexture(true); const plaster = grainTexture(false);
  const materials = Object.fromEntries(Object.entries(COLORS).map(([key, color]) => [key, new MeshStandardMaterial({ color, roughness: key === 'brass' ? .45 : .92, metalness: key === 'iron' || key === 'brass' ? .45 : 0, map: ['timber', 'plank', 'edge'].includes(key) ? wood : plaster, ...(['timber', 'plank', 'plaster', 'cobble'].includes(key) ? { bumpMap: plaster } : {}), bumpScale: .022 })])) as Record<MaterialName, MeshStandardMaterial>;
  const figureMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: .92, map: plaster });
  const figures = new Map<string, FigureGeometry>();
  const getFigure = (look: PersonLook, working: boolean, customer: boolean, clem: boolean) => figureGeometry(figures, look, working, customer, clem);
  return { materials, box: new RoundedBoxGeometry(1, 1, 1, 2, .035), cylinder: new CylinderGeometry(1, 1, 1, 14), sphere: new SphereGeometry(1, 16, 12), torus: new TorusGeometry(1, .07, 8, 32), pennant: new CircleGeometry(1, 3), wood, plaster, figureMaterial, figureTrouser: makeTrouser(), figures, getFigure };
}
export type Resources = ReturnType<typeof makeResources>;

type FigureGeometry = { core: BufferGeometry; sleeve: BufferGeometry };
export const FIGURE_HIP = .83;
const FIGURE_HEIGHT = 1.68;
const HEAD_HEIGHT = FIGURE_HEIGHT / 7;
const HEAD_Y = FIGURE_HEIGHT - HEAD_HEIGHT / 2 - FIGURE_HIP;

function profile(points: [number, number][], segments = 10) {
  return new LatheGeometry(points.map(([radius, height]) => new Vector2(radius, height)), segments);
}

/** Indexed pieces with baked colours keep the sculpted details in one draw per batch. */
function figureBuilder() {
  const pieces: BufferGeometry[] = [];
  const transform = new Object3D();
  const add = (shape: BufferGeometry, colour: MaterialName, at: Point, size: Point, rotation: Point = [0, 0, 0]) => {
    transform.position.set(...at);
    transform.scale.set(...size);
    transform.rotation.set(...rotation);
    transform.updateMatrix();
    shape.applyMatrix4(transform.matrix);
    const count = shape.getAttribute('position').count;
    const { r, g, b } = new Color(COLORS[colour]);
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < colours.length; i += 3) {
      colours[i] = r; colours[i + 1] = g; colours[i + 2] = b;
    }
    shape.setAttribute('color', new Float32BufferAttribute(colours, 3));
    pieces.push(shape);
  };
  return {
    add,
    oval: (colour: MaterialName, at: Point, size: Point, rotation?: Point) =>
      add(new SphereGeometry(1, 8, 3), colour, at, size, rotation),
    block: (colour: MaterialName, at: Point, size: Point, rotation?: Point) =>
      add(new BoxGeometry(), colour, at, size, rotation),
    finish: () => {
      const merged = mergeGeometries(pieces)!;
      pieces.forEach(piece => piece.dispose());
      return merged;
    },
  };
}

function figureGeometry(figures: Map<string, FigureGeometry>, look: PersonLook, working: boolean, customer: boolean, clem: boolean) {
  const { shirt, skin, hair, style, broad, apron, beard, scarf, glasses } = look;
  const key = JSON.stringify([shirt, skin, hair, style, broad, apron, beard, scarf, glasses, working, customer, clem]);
  const cached = figures.get(key);
  if (cached) return cached;

  const core = figureBuilder();
  const { add, oval, block } = core;
  const waist = .18;
  // A closed, flared coat with a narrower waist, square shoulder and sloping collar.
  add(profile([[0, -.185], [waist * 1.15, -.185], [.20, -.13], [waist, .11], [.21, .32], [.226, .42], [.207, .47], [.074, .53], [0, .53]]),
    shirt, [0, 0, 0], [broad ? 1.12 : 1, 1, .69]);
  if (apron) {
    block(customer && shirt === 'cream' ? 'green' : 'cream', [0, .098, -.137], [.30, .52, .025], [.035, 0, 0]);
    block(customer && shirt === 'cream' ? 'greenLight' : 'timber', [0, .042, -.155], [.22, .12, .019]);
  }
  if (scarf) oval('terra', [0, .49, -.098], [.138, .062, .082]);
  add(new CylinderGeometry(.044, .06, .13, 8), skin, [0, .568, -.013], [1, 1, 1]);

  const head = (y: number, z: number): Point => [0, HEAD_Y + y, z];
  add(profile([[0, -.118], [.052, -.112], [.080, -.076], [.099, -.014], [.097, .042], [.08, .088], [.043, .109], [0, .113]]),
    skin, head(0, 0), [1, 1, .91]);
  add(new SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI * .52),
    hair, head(.008, .01), [.104, .112, .093], [.18, 0, 0]);
  oval(skin, head(-.018, -.088), [.021, .025, .030]);
  block('edge', head(-.061, -.077), [.035, .007, .012]);
  for (const side of [-1, 1]) {
    oval(skin, [side * .095, HEAD_Y - .017, .003], [.018, .027, .021]);
    block('iron', [side * .04, HEAD_Y + .011, -.082], [.014, .011, .009], [0, side * -.26, 0]);
    if (glasses) add(new TorusGeometry(.034, .004, 4, 8), 'brass', [side * .04, HEAD_Y + .011, -.09], [1, .82, 1]);
    if (clem) block('edge', [side * .084, .235, -.149], [.046, .37, .022], [0, 0, side * .16]);
  }
  if (glasses) block('brass', head(.014, -.098), [.024, .007, .009]);
  if (style === 'long') oval(hair, head(-.061, .07), [.102, .162, .059]);
  if (style === 'bun') oval(hair, head(.075, .104), [.063, .060, .064]);
  if (style === 'cap') {
    oval('edge', head(.084, -.036), [.147, .015, .124]);
    oval('timber', head(.085, .016), [.112, .056, .098]);
    block('blue', head(.087, -.085), [.113, .018, .014]);
  }
  if (beard) oval(beard, head(-.072, -.049), [.077, .066, .072]);
  if (customer && clem) block('edge', [.18, .33, -.43], [.4, .04, .3], [.3, 0, .1]);

  const sleeve = figureBuilder();
  const reaching = working || clem;
  const elbow: Point = reaching ? [0, -.247, -.098] : [0, -.267, 0];
  const bend = clem ? 1.38 : working ? 1.13 : .11;
  sleeve.add(profile([[0, -.286], [.057, -.286], [.073, -.155], [.076, -.061], [.06, .012], [0, .035]], 8),
    shirt, [0, 0, 0], [1, 1, .92], [reaching ? .38 : 0, 0, 0]);
  sleeve.add(profile([[0, -.235], [.047, -.235], [.054, -.16], [.06, -.035], [.057, .021], [0, .028]], 8),
    shirt, elbow, [1, 1, .9], [bend, 0, 0]);
  const hand: Point = [0, elbow[1] - .274 * Math.cos(bend), elbow[2] - .274 * Math.sin(bend)];
  sleeve.oval(skin, hand, [.044, .066, .037], [bend, 0, 0]);
  sleeve.oval(skin, [0, hand[1] + .022, hand[2] - .024], [.026, .039, .028], [bend + .36, 0, 0]);

  const figure = { core: core.finish(), sleeve: sleeve.finish() };
  figures.set(key, figure);
  return figure;
}

function makeTrouser() {
  const trouser = figureBuilder();
  trouser.add(profile([[0, -.78], [.061, -.78], [.068, -.56], [.081, -.33], [.095, -.09], [.093, .043], [0, .043]], 8),
    'blue', [0, 0, 0], [1, 1, .92]);
  trouser.oval('edge', [0, .065 - FIGURE_HIP, -.045], [.08, .065, .131]);
  return trouser.finish();
}

export function MaterialProvider({ children }: { children: ReactNode }) {
  const resources = useMemo(() => makeResources(), []);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Compare the generation after the Strict Mode effect replay.
    return () => { queueMicrotask(() => { if (generation.current !== current) return; Object.values(resources.materials).forEach(m => m.dispose()); resources.box.dispose(); resources.cylinder.dispose(); resources.sphere.dispose(); resources.torus.dispose(); resources.figures.forEach(figure => Object.values(figure).forEach(shape => shape.dispose())); resources.figureMaterial.dispose(); resources.figureTrouser.dispose(); resources.pennant.dispose(); resources.wood.dispose(); resources.plaster.dispose(); }); };
  }, [resources]);
  return <Materials.Provider value={resources}>{children}</Materials.Provider>;
}
export function Solid({ at, size, material = 'timber', shape = 'box', rotation, shadow = true }: { at: Point; size: Point; material?: MaterialName; shape?: 'box' | 'cylinder' | 'sphere' | 'torus' | 'pennant'; rotation?: Point; shadow?: boolean }) {
  const resources = useMaterials();
  return <mesh geometry={resources[shape]} material={resources.materials[material]} position={at} scale={size} rotation={rotation} castShadow={shadow} receiveShadow dispose={null} />;
}

/** Shared shapes are submitted once per geometry/material pair, including their shadow pass. */
export function BatchedStudio({ children }: { children: ReactNode }) {
  const root = useRef<Group>(null);
  const resources = useMaterials();
  const batches = useRef(new Map<string, InstancedMesh>());
  useLayoutEffect(() => {
    const group = root.current!;
    group.updateWorldMatrix(true, true);
    const inverse = new Matrix4().copy(group.matrixWorld).invert();
    const shared = new Set([resources.box, resources.cylinder, resources.sphere, resources.torus, resources.pennant]);
    const buckets = new Map<string, Mesh[]>();
    group.traverse(object => {
      if (!(object instanceof Mesh) || object instanceof InstancedMesh || !shared.has(object.geometry) || Array.isArray(object.material)) return;
      const key = `${object.geometry.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      buckets.set(key, [...(buckets.get(key) ?? []), object]);
    });
    const matrix = new Matrix4();
    for (const [key, meshes] of buckets) {
      const first = meshes[0]!;
      let batch = batches.current.get(key);
      if (batch && batch.count !== meshes.length) { group.remove(batch); batch.dispose(); batches.current.delete(key); batch = undefined; }
      if (!batch) {
        batch = new InstancedMesh(first.geometry, first.material, meshes.length);
        batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow; batch.frustumCulled = false;
        group.add(batch); batches.current.set(key, batch);
      }
      const instance = batch;
      let changed = false;
      meshes.forEach((mesh, index) => {
        matrix.copy(mesh.matrixWorld).premultiply(inverse);
        if (matrix.elements.some((value, entry) => Math.abs(instance.instanceMatrix.array[index * 16 + entry]! - value) > 1e-6)) {
          instance.setMatrixAt(index, matrix); changed = true;
        }
        mesh.visible = false;
      });
      if (changed) instance.instanceMatrix.needsUpdate = true;
    }
    for (const [key, batch] of batches.current) if (!buckets.has(key)) { group.remove(batch); batch.dispose(); batches.current.delete(key); }
  }, [children, resources]);
  useLayoutEffect(() => {
    const owned = batches.current;
    return () => { owned.forEach(batch => { batch.removeFromParent(); batch.dispose(); }); owned.clear(); };
  }, []);
  return <group ref={root}>{children}</group>;
}
