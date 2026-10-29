// Two real builds replace each other on the server. Neither generation can fetch the other's removed chunks.
import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { GHOSTS, runPolicy } from '../src/engine/policies';
import { RULES } from '../src/engine/rules';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const config = { scenarioId: 'main-street', seed: 'offline-update' };
const saves = JSON.stringify([{ v: 1, rules: RULES.version, id: 'update-season', label: 'Update season', savedAt: new Date().toISOString(), config, commands: runPolicy(config, GHOSTS.bright).commands }]);

test('an update preserves old tabs, new offline chunks and other installation scopes', async ({ page, context }) => {
  await mkdir(join(ROOT, 'scratch'), { recursive: true });
  const nextDist = await mkdtemp(join(ROOT, 'scratch/offline-update-'));
  let dist = join(ROOT, 'dist');
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const prefix = ['/sub/', '/other/'].find((scope) => path.startsWith(scope));
    if (!prefix) return void res.writeHead(404).end();
    const rel = normalize(path.slice(prefix.length) || 'index.html');
    if (rel.startsWith('..')) return void res.writeHead(400).end();
    try {
      const body = await readFile(join(dist, rel));
      res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  try {
    await build({
      logLevel: 'silent',
      build: { outDir: nextDist },
      plugins: [{
        name: 'offline-update-fixture',
        enforce: 'pre',
        transform(source, id) {
          if (id.endsWith('/src/ui/Title.tsx')) return source.replace('Make something for your neighbours.', 'Make something for your street.');
          if (id.endsWith('/src/ui/EndScreen.tsx')) return source.replace('The regulars', 'The familiar faces');
        },
      }],
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const url = `${origin}/sub/`;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.addInitScript((runs) => {
      if (location.protocol !== 'http:') return;
      if (!localStorage.getItem('lantern.runs.v1')) localStorage.setItem('lantern.runs.v1', runs);
    }, saves);
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    const oldWorker = await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL);
    const other = await context.newPage();
    await other.goto(`${origin}/other/`);
    await other.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await other.reload();
    const initialCaches = await page.evaluate(() => caches.keys());
    const oldManifest = JSON.parse(await readFile(join(dist, 'asset-manifest.json'), 'utf8')) as { files: string[] };
    const oldEnd = oldManifest.files.find((file) => /EndScreen-.*\.js$/.test(file))!;

    dist = nextDist;
    // The deployment really removed the old lazy chunk; only a worker's version cache can supply it now.
    expect((await context.request.get(`${url}${oldEnd}`)).status()).toBe(404);
    const fresh = await context.newPage();
    fresh.on('pageerror', (error) => errors.push(error.message));
    await fresh.goto(url);
    await expect(fresh.getByRole('heading', { name: 'Make something for your street.' })).toBeVisible();
    await expect.poll(() => fresh.evaluate(async (previous) => {
      const registration = await navigator.serviceWorker.getRegistration();
      const waiting = registration?.waiting;
      const active = registration?.active;
      return !!((waiting?.state === 'installed' && waiting.scriptURL !== previous) || (active?.state === 'activated' && active.scriptURL !== previous));
    }, oldWorker)).toBe(true);
    // No EndScreen has been requested by either tab. The new one lives only in the waiting precache.
    await context.setOffline(true);
    await fresh.getByRole('button', { name: 'Look back at Update season', exact: true }).click();
    await expect(fresh.getByRole('heading', { name: 'The familiar faces' })).toBeVisible();
    await page.getByRole('button', { name: 'Look back at Update season', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'The regulars' })).toBeVisible();
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(saves);

    // Offline navigation still uses the controller's own shell, never the new network HTML.
    await fresh.reload();
    await expect(fresh.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
    await page.close();
    await fresh.close();
    // The other installation stays open while this scope finishes its update and removes old caches.
    await expect.poll(() => other.evaluate(async (scope) => {
      const registration = await navigator.serviceWorker.getRegistration(scope);
      return registration?.active?.scriptURL;
    }, url)).not.toBe(oldWorker);
    await expect.poll(() => other.evaluate(() => caches.keys())).toHaveLength(initialCaches.length);
    const latest = await context.newPage();
    latest.on('pageerror', (error) => errors.push(error.message));
    await latest.goto(url);
    await expect(latest.getByRole('heading', { name: 'Make something for your street.' })).toBeVisible();
    await latest.getByRole('button', { name: 'Look back at Update season', exact: true }).click();
    await expect(latest.getByRole('heading', { name: 'The familiar faces' })).toBeVisible();
    await other.reload();
    await expect(other.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
    expect(await latest.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(saves);
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(nextDist, { recursive: true, force: true });
  }
});
