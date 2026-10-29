import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, CapsuleGeometry, CircleGeometry, CylinderGeometry, LatheGeometry, Vector2, MeshStandardMaterial, RepeatWrapping, SphereGeometry, SRGBColorSpace, TorusGeometry, Group, InstancedMesh, Mesh, Matrix4 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ReactNode } from 'react';
import type { Point } from './adapter';
import { Materials, useMaterials } from './material-context';

const COLORS = { timber: '#89613f', edge: '#503a2b', plank: '#a47d53', plaster: '#bfb29a', green: '#254139', greenLight: '#416050', iron: '#292e2c', brass: '#a28a50', paper: '#e9d9b8', dark: '#162824', cobble: '#596469', rug: '#783d32', skin: '#a77750', skinLight: '#c99c78', skinDark: '#76513d', silver: '#b5b3a6', cream: '#c3af8f', hair: '#302b24', leaf: '#506148', blue: '#303b4b', terra: '#885941' };
export type MaterialName = keyof typeof COLORS;
function grainTexture(wood: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
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
  return { materials, box: new RoundedBoxGeometry(1, 1, 1, 2, .035), cylinder: new CylinderGeometry(1, 1, 1, 14), sphere: new SphereGeometry(1, 16, 12), torso: new LatheGeometry([[.16, .72], [.195, .77], [.205, .95], [.245, 1.17], [.205, 1.26], [.09, 1.3]].map(([x, y]) => new Vector2(x, y)), 14), head: new LatheGeometry([[0, -.17], [.06, -.15], [.105, -.09], [.127, .015], [.12, .095], [.08, .15], [0, .17]].map(([x, y]) => new Vector2(x, y)), 14), hair: new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * .48), limb: new CapsuleGeometry(1, 1, 3, 10), torus: new TorusGeometry(1, .07, 8, 32), pennant: new CircleGeometry(1, 3), wood, plaster };
}
export type Resources = ReturnType<typeof makeResources>;
export function MaterialProvider({ children }: { children: ReactNode }) {
  const resources = useMemo(() => makeResources(), []);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Compare the generation after the Strict Mode effect replay.
    return () => { queueMicrotask(() => { if (generation.current !== current) return; Object.values(resources.materials).forEach(m => m.dispose()); resources.box.dispose(); resources.cylinder.dispose(); resources.sphere.dispose(); resources.torus.dispose(); resources.torso.dispose(); resources.head.dispose(); resources.hair.dispose(); resources.limb.dispose(); resources.pennant.dispose(); resources.wood.dispose(); resources.plaster.dispose(); }); };
  }, [resources]);
  return <Materials.Provider value={resources}>{children}</Materials.Provider>;
}
export function Solid({ at, size, material = 'timber', shape = 'box', rotation, shadow = true }: { at: Point; size: Point; material?: MaterialName; shape?: 'box' | 'cylinder' | 'sphere' | 'torus' | 'torso' | 'head' | 'hair' | 'limb' | 'pennant'; rotation?: Point; shadow?: boolean }) {
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
    const shared = new Set([resources.box, resources.cylinder, resources.sphere, resources.torus, resources.torso, resources.head, resources.hair, resources.limb, resources.pennant]);
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
