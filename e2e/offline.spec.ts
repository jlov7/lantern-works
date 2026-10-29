// Serves the production build from a subpath with a throwaway static server, so the suite can check that
// relative asset URLs work there and that the service worker keeps the game playable once the server is gone.
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../src/engine/rules';
import { replay } from '../src/engine/sim';
import type { Command } from '../src/engine/types';
import { decodeShare } from '../src/ui/persist';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function serveDistAt(prefix: string, varyOrigin = false): Promise<{ server: Server; url: string }> {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (!path.startsWith(prefix)) return void res.writeHead(404).end();
    const rel = normalize(path.slice(prefix.length) || 'index.html');
    if (rel.startsWith('..')) return void res.writeHead(400).end();
    if (varyOrigin) {
      res.setHeader('vary', 'Origin');
      res.setHeader('cache-control', 'no-store');
      if (req.headers.origin) res.setHeader('access-control-allow-origin', req.headers.origin);
      if (rel === 'runtime-probe.json') return void res.writeHead(200, { 'content-type': 'application/json', vary: 'X-Lantern-Probe' }).end(JSON.stringify({ variant: req.headers['x-lantern-probe'] }));
    }
    try {
      const body = await readFile(join(DIST, rel));
      res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}` })));
}

test('the build plays from a subpath, and offline after the first visit', async ({ page, context }) => {
  const { server, url } = await serveDistAt('/sub/');
  try {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
    // ready resolves once the worker has installed, which includes the full precache.
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toBe(url);
    const illustration = await page.evaluate(async () => {
      const { files } = await fetch('asset-manifest.json').then(response => response.json()) as { files: string[] };
      const deferred = files.filter(file => /\/(TitleScene|MiniatureWorld|MiniatureCanvas|StudioHandbook|ReplayBackup)-.*\.js$/.test(file));
      return { files: deferred, cached: await Promise.all(deferred.map(async file => !!await caches.match(new URL(file, location.href).href))) };
    });
    for (const name of ['TitleScene', 'MiniatureWorld', 'MiniatureCanvas', 'StudioHandbook', 'ReplayBackup']) expect(illustration.files.some(file => file.includes(`/${name}-`))).toBe(true);
    expect(illustration.cached.every(Boolean)).toBe(true);

    await context.setOffline(true);
    server.closeAllConnections();
    await new Promise((r) => server.close(r));

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
    await expect(page.locator('.title-scene__proof > svg')).toBeVisible();
    await page.locator('.how > summary').click();
    await page.getByRole('button', { name: 'Studio handbook', exact: true }).click();
    const handbook = page.getByRole('dialog', { name: 'Studio handbook', exact: true });
    await expect(handbook).toBeVisible();
    await handbook.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'First season: Main Street (guided)', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'At the window' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Game places' }).getByRole('button', { name: 'Work', exact: true }).click();
    await expect(page.locator('.miniature-world')).toBeVisible();
    await expect(page.locator('.miniature-world')).not.toHaveAttribute('data-renderer-choice', 'checking');
    const tryMiniature = page.getByRole('button', { name: 'Try miniature room', exact: true });
    if (await tryMiniature.isVisible()) await tryMiniature.click();
    await expect(page.locator('.work-place .miniature-world')).toHaveAttribute('data-fallback', 'false');
    await expect(page.locator('.work-place canvas[data-miniature-renderer]')).toBeVisible();
    await expect(page.locator('[data-art-ready=true]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1') ?? '[]').length)).toBe(1);
    const run = await page.evaluate(() => JSON.parse(localStorage.getItem('lantern.runs.v1')!)[0]);
    await page.getByRole('button', { name: 'Lantern Works: back to the street map', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Make something for your neighbours.', exact: true })).toBeVisible();
    const beforeBackup = await page.evaluate(() => localStorage.getItem('lantern.runs.v1'));
    await page.getByRole('button', { name: `Keep replay of ${run.label}`, exact: true }).click();
    const backup = page.getByRole('dialog', { name: 'Keep a replay', exact: true });
    const link = backup.getByRole('textbox', { name: 'Complete replay link' });
    await expect(link).toHaveValue(/^http.*#s=/);
    const decoded = await decodeShare((await link.inputValue()).split('#s=')[1]!);
    expect(decoded.ok && decoded.payload.commands).toEqual(run.commands);
    expect(await page.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(beforeBackup);
    await backup.getByRole('button', { name: 'Close', exact: true }).click();
    const commands: Command[] = Array.from({ length: RULES.days }, () => ({ type: 'runDay' }));
    const finished = replay(run.config, commands, run.rules);
    expect(finished.errors).toEqual([]);
    expect(finished.state.finished).toBe(true);
    await page.evaluate(saved => localStorage.setItem('lantern.runs.v1', JSON.stringify([saved])), { ...run, id: 'offline-finished', label: 'Offline finished season', commands });
    await page.reload();
    await page.getByRole('button', { name: 'Look back at Offline finished season', exact: true }).click();
    await expect(page.locator('[data-hero="end"] svg')).toBeVisible();
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    server.close();
  }
});

test('Vary Origin build assets open in a new offline tab without widening runtime cache matches', async ({ page, context, browserName }) => {
  const { server, url } = await serveDistAt('/vary/', true);
  const saved = { v: 1, rules: RULES.version, id: 'offline-backup', label: 'Offline saved morning', savedAt: '2026-10-29T12:00:00Z', config: { scenarioId: 'main-street', seed: 'offline-vary' }, commands: [{ type: 'pace', pace: 'careful' }] };
  try {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
    await page.evaluate(saved => localStorage.setItem('lantern.runs.v1', JSON.stringify([saved])), saved);
    const cached = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      const { files } = await fetch('asset-manifest.json').then(response => response.json()) as { files: string[] };
      const responses = await Promise.all(files.map(file => caches.match(new URL(file, location.href).href)));
      const unloaded = files.filter(file => /\/(StudioHandbook|ReplayBackup)-.*\.js$/.test(file));
      const loaded = performance.getEntriesByType('resource').map(entry => entry.name);
      return { allCached: responses.every(Boolean), allVary: responses.every(response => response?.headers.get('vary') === 'Origin'), unloaded, loaded, entry: files.find(file => /^assets\/index-.*\.js$/.test(file))! };
    });
    expect(cached.allCached).toBe(true);
    expect(cached.allVary).toBe(true);
    expect(cached.unloaded).toHaveLength(2);
    for (const file of cached.unloaded) expect(cached.loaded).not.toContain(new URL(file, url).href);
    expect(await page.evaluate(async () => (await fetch('runtime-probe.json', { headers: { 'X-Lantern-Probe': 'one' } })).json())).toEqual({ variant: 'one' });
    await expect.poll(() => page.evaluate(async () => !!await caches.match(new Request(new URL('runtime-probe.json', location.href), { headers: { 'X-Lantern-Probe': 'one' } })))).toBe(true);

    await context.setOffline(true);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    const offline = await context.newPage();
    const entry = offline.waitForResponse(response => response.url() === new URL(cached.entry, url).href && response.status() === 200);
    await offline.goto(url);
    await expect(offline.getByRole('heading', { name: 'Make something for your neighbours.' })).toBeVisible();
    const response = await entry;
    expect(response.headers()['cache-control']).toBe('no-store');
    if (browserName === 'chromium') expect(response.fromServiceWorker()).toBe(true);
    const stored = await offline.evaluate(() => localStorage.getItem('lantern.runs.v1'));
    await offline.locator('.how > summary').click();
    const handbookResponse = offline.waitForResponse(response => /\/StudioHandbook-.*\.js$/.test(response.url()) && response.status() === 200);
    await offline.getByRole('button', { name: 'Studio handbook', exact: true }).click();
    const handbook = offline.getByRole('dialog', { name: 'Studio handbook', exact: true });
    await expect(handbook).toBeVisible();
    await handbookResponse;
    await handbook.getByRole('button', { name: 'Close', exact: true }).click();
    const backupResponse = offline.waitForResponse(response => /\/ReplayBackup-.*\.js$/.test(response.url()) && response.status() === 200);
    await offline.getByRole('button', { name: `Keep replay of ${saved.label}`, exact: true }).click();
    const link = offline.getByRole('dialog', { name: 'Keep a replay', exact: true }).getByRole('textbox', { name: 'Complete replay link' });
    await expect(link).toHaveValue(/^http.*#s=/);
    await backupResponse;
    const decoded = await decodeShare((await link.inputValue()).split('#s=')[1]!);
    expect(decoded.ok && decoded.payload.commands).toEqual(saved.commands);
    expect(await offline.evaluate(() => localStorage.getItem('lantern.runs.v1'))).toBe(stored);
    expect(await offline.evaluate(async () => (await fetch('runtime-probe.json', { headers: { 'X-Lantern-Probe': 'one' } })).json())).toEqual({ variant: 'one' });
    expect(await offline.evaluate(async () => {
      try { await fetch('runtime-probe.json', { headers: { 'X-Lantern-Probe': 'two' } }); return true; }
      catch { return false; }
    })).toBe(false);
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    server.close();
  }
});
