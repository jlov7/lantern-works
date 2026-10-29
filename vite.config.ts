/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { claudeBridge } from './dev/claude-bridge';

/** Writes asset-manifest.json next to index.html so public/sw.js knows what to precache for offline play. */
function assetManifest(): Plugin {
  return {
    name: 'lantern-asset-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      // .woff is skipped: every browser that runs service workers also reads .woff2.
      const files = Object.keys(bundle)
        .filter((f) => /\.(js|css|woff2|svg|webp|png|jpe?g|avif)$/.test(f))
        .sort();
      this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: JSON.stringify({ files }, null, 2) });
    },
  };
}

export default defineConfig({
  // Relative URLs so the build also works when served from a subpath.
  base: './',
  plugins: [react(), claudeBridge(), assetManifest()],
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
      exclude: ['src/engine/**/*.test.ts'],
      reporter: ['text-summary', 'html'],
      // Measured 2026-10-11: lines 92.05, branches 76.1. Branches sit below the 80 target; raise as tests land.
      thresholds: { lines: 90, branches: 76 },
    },
  },
});
