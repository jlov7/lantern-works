// Bundle budget: gzip every built JS chunk and fail when what the first load needs grows past the budget.
// Run after `pnpm build`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// The budget covers everything the page loads before it can render: the entry chunk plus every chunk it
// imports statically or preloads. Lazily loaded chunks (end screen, workshop, Claude SDK, ghost worker) are
// listed but not counted. React DOM and the Zod core that validates saves and share links account
// for much of the initial load. Keep the budget fixed when adding screens or optional features.
const EAGER_BUDGET_KB = 150;

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = html.match(/<script type="module"[^>]*src="\.?\/?(assets\/[^"]+\.js)"/)?.[1];
if (!entry) {
  console.error('size: no entry script found in dist/index.html. Run `pnpm build` first.');
  process.exit(1);
}

const rows = readdirSync(join(dist, 'assets'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => {
    const raw = readFileSync(join(dist, 'assets', f));
    return { file: `assets/${f}`, raw: raw.length / 1000, gzip: gzipSync(raw, { level: 9 }).length / 1000 };
  })
  .sort((a, b) => b.gzip - a.gzip);

// Eager chunks: the entry, its static imports (recursively), and anything index.html preloads.
const eager = new Set([entry, ...[...html.matchAll(/rel="modulepreload"[^>]*href="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1])]);
for (const queue = [...eager]; queue.length; ) {
  const f = queue.pop();
  const code = readFileSync(join(dist, f), 'utf8');
  for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) {
    const dep = `assets/${m[1]}`;
    if (!eager.has(dep)) {
      eager.add(dep);
      queue.push(dep);
    }
  }
}

for (const r of rows) console.log(`${r.file === entry ? '*' : eager.has(r.file) ? '+' : ' '} ${r.file.padEnd(40)} ${r.raw.toFixed(1).padStart(8)} kB  ${r.gzip.toFixed(1).padStart(7)} kB gzip`);
const total = rows.filter((r) => eager.has(r.file)).reduce((a, r) => a + r.gzip, 0);
if (!rows.some((r) => r.file === entry)) {
  console.error(`size: entry ${entry} is missing from dist/assets.`);
  process.exit(1);
}
if (total > EAGER_BUDGET_KB) {
  console.error(`size: the first load needs ${total.toFixed(1)} kB gzip (* entry, + eager), over the ${EAGER_BUDGET_KB} kB budget.`);
  process.exit(1);
}
console.log(`size: the first load needs ${total.toFixed(1)} kB gzip (* entry, + eager), within the ${EAGER_BUDGET_KB} kB budget.`);
