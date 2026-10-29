// Fast balance smoke for CI: a handful of scripted managers on every street, checked against the design targets.
// The deep search (passive vs active, derived medal thresholds) is `pnpm metrics`. Usage: pnpm balance [seeds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { GHOSTS, runPolicy, type Policy } from '../src/engine/policies';
import { PRESETS, SCENARIOS } from '../src/engine/rules';
import { PAR, summarize, type Summary } from '../src/engine/selectors';

const SEEDS = Number(process.argv[2] ?? 4);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const solo = { aiTier: 'solo', routing: 'all' } as const;

const managers: Policy[] = [
  GHOSTS.old,
  GHOSTS.faster,
  GHOSTS.bright,
  { id: 'preset', label: 'Presets B+L, one AI desk, passive', menu: [PRESETS.bespoke, PRESETS.launchlet], staffing: solo, accept: 'forecast', news: 'default' },
  { id: 'greedy', label: 'Bespoke + Club, accept everyone', menu: [PRESETS.bespoke, PRESETS.club], staffing: solo, accept: 'all', news: 'default' },
  {
    id: 'active',
    label: 'Active: least work first, overtime, junior, style guide',
    menu: [{ ...PRESETS.bespoke, price: 800 }, { ...PRESETS.launchlet, price: 290 }],
    staffing: solo,
    accept: 'cheapest',
    news: 'sensible',
    overtime: true,
    plan: [{ day: 1, buy: ['styleGuide'] }, { day: 3, hire: true, buy: ['library'] }],
  },
  { id: 'noai', label: 'No AI: Bespoke + Launchlet, junior and brief library from day 1, active', menu: [PRESETS.bespoke, PRESETS.launchlet], staffing: { aiTier: 'none', routing: 'human' }, accept: 'forecast', news: 'sensible', overtime: true, plan: [{ day: 0, hire: true, buy: ['library'] }] },
  { ...GHOSTS.bright, id: 'counters', label: 'Bright Lantern, also taking every counter-offer that fits', counters: true },
  { id: 'idle', label: 'Doing nothing (prices nobody pays)', menu: [{ ...PRESETS.bespoke, price: 5000 }], staffing: { aiTier: 'none', routing: 'human' }, accept: 'forecast', news: 'default' },
];

const t0 = performance.now();
const res = new Map<string, Summary[]>();
for (const sc of SCENARIOS) for (const p of managers) res.set(`${sc.id}/${p.id}`, Array.from({ length: SEEDS }, (_, i) => summarize(runPolicy({ scenarioId: sc.id, seed: `b${i + 1}` }, p))));
const ms = performance.now() - t0;
const get = (sc: string, id: string) => res.get(`${sc}/${id}`)!;
const served = (sc: string, id: string) => mean(get(sc, id).map((x) => x.served));

const checks: [string, boolean, string][] = [];
for (const sc of SCENARIOS.map((x) => x.id)) {
  const par = PAR[sc]!;
  checks.push([`T1 ${sc}: Old Lantern stays solvent and serves fewer than the preset redesign`, get(sc, 'old').every((x) => x.cash >= 0) && served(sc, 'old') < served(sc, 'preset'), `old ${served(sc, 'old').toFixed(1)} vs preset ${served(sc, 'preset').toFixed(1)}`]);
  checks.push([`T2 ${sc}: AI alone serves fewer than the preset redesign`, served(sc, 'faster') < served(sc, 'preset'), `faster ${served(sc, 'faster').toFixed(1)}`]);
  checks.push([`T6 ${sc}: doing nothing goes insolvent`, get(sc, 'idle').every((x) => x.cash < 0), get(sc, 'idle').map((x) => x.cash).join(', ')]);
  checks.push([`P1 ${sc}: the passive preset lands between bronze and gold`, served(sc, 'preset') >= par.bronze && served(sc, 'preset') < par.gold, `${served(sc, 'preset').toFixed(1)} in [${par.bronze}, ${par.gold})`]);
  checks.push([`P3 ${sc}: a no-AI studio that grows reaches silver`, served(sc, 'noai') >= par.silver, `${served(sc, 'noai').toFixed(1)} vs silver ${par.silver}`]);
  checks.push([`P2 ${sc}: the active manager reaches silver`, served(sc, 'active') >= par.silver, `${served(sc, 'active').toFixed(1)} vs silver ${par.silver}`]);
}
// GD-11: counter-offers are a judgement call, not a free win: taking every one that fits must lose somewhere.
const counterLoses = SCENARIOS.filter((sc) => mean(get(sc.id, 'counters').map((x) => x.operatingResult)) < mean(get(sc.id, 'bright').map((x) => x.operatingResult))).map((s) => s.id);
checks.push(['C1 taking every counter-offer that fits earns less somewhere', counterLoses.length > 0, counterLoses.join(', ') || 'nowhere']);
const greedyMisses = SCENARIOS.filter((sc) => mean(get(sc.id, 'greedy').map((x) => x.promisesKept ?? 1)) < 0.9).map((s) => s.id);
checks.push(['T5 accepting everyone misses promises somewhere', greedyMisses.length > 0, greedyMisses.join(', ') || 'nowhere']);

const table = SCENARIOS.flatMap((sc) => [
  `\n## ${sc.name}\n`,
  '| manager | served | sold | op result | cash | kept |',
  '|---|---:|---:|---:|---:|---:|',
  ...managers.map((p) => {
    const xs = get(sc.id, p.id);
    return `| ${p.label} | ${mean(xs.map((x) => x.served)).toFixed(1)} | ${mean(xs.map((x) => x.sold)).toFixed(1)} | ${mean(xs.map((x) => x.operatingResult)).toFixed(0)} | ${mean(xs.map((x) => x.cash)).toFixed(0)} | ${(mean(xs.map((x) => x.promisesKept ?? 1)) * 100).toFixed(0)}% |`;
  }),
]);
const report = [`# Balance smoke (${SEEDS} seeds, ${(ms / 1000).toFixed(1)}s)`, '', ...checks.map(([n, ok, d]) => `- ${ok ? 'PASS' : 'FAIL'} ${n}: ${d}`), ...table].join('\n');
mkdirSync('docs', { recursive: true });
writeFileSync('docs/BALANCE.md', report + '\n');
console.log(report);
process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
