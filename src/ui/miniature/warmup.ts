import type { Camera, Scene, WebGLRenderer } from 'three';

export async function warmRoom(gl: WebGLRenderer, scene: Scene, camera: Camera): Promise<number> {
  const started = performance.now();
  await gl.compileAsync(scene, camera);
  if (gl.getContext().isContextLost()) throw new Error('WebGL context lost');
  gl.shadowMap.needsUpdate = true;
  gl.render(scene, camera);
  return performance.now() - started;
}
