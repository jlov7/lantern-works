const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext('webgl2');
if (!context) {
  self.postMessage({ view: 'illustrated', unavailable: true });
} else {
  const info = context.getExtension('WEBGL_debug_renderer_info');
  const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  context.getExtension('WEBGL_lose_context')?.loseContext();
  self.postMessage({ view: /SwiftShader|llvmpipe|softpipe|Software Rasterizer/i.test(renderer) ? 'illustrated' : 'miniature' });
}
