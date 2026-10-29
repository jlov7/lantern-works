// How often each ending comes up across a spread of scripted managers, streets and seeds (GD-21: none above 30%).
// Run directly with `pnpm exec tsx src/ui/screens/endings.check.ts [seeds]` to print the table.
import { pathToFileURL } from 'node:url';
import { GHOSTS, runPolicy, type Policy } from '../../engine/policies';
import { PRESETS, SCENARIOS } from '../../engine/rules';
import { seasonEnding } from '../../engine/endings';

const solo = { aiTier: 'solo', routing: 'all' } as const;
const none = { aiTier: 'none', routing: 'human' } as const;

export const ENDING_MANAGERS: Policy[] = [
  GHOSTS.old,
  GHOSTS.faster,
  GHOSTS.bright,
  { id: 'preset', label: 'Bespoke and Launchlet, one AI desk', menu: [PRESETS.bespoke, PRESETS.launchlet], staffing: solo, accept: 'forecast' },
  { id: 'greedy', label: 'Bespoke and Club, take everyone', menu: [PRESETS.bespoke, PRESETS.club], staffing: solo, accept: 'all' },
  {
    id: 'active',
    label: 'Least work first, overtime, a junior, two upgrades',
    menu: [{ ...PRESETS.bespoke, price: 800 }, { ...PRESETS.launchlet, price: 290 }],
    staffing: solo,
    accept: 'cheapest',
    news: 'sensible',
    overtime: true,
    plan: [{ day: 1, buy: ['styleGuide'] }, { day: 3, hire: true, buy: ['library'] }],
  },
  { id: 'idle', label: 'Prices nobody pays', menu: [{ ...PRESETS.bespoke, price: 5000 }], staffing: none, accept: 'forecast' },
  { id: 'club-hand', label: 'Club and Launchlet by hand', menu: [PRESETS.club, PRESETS.launchlet], staffing: none, accept: 'forecast', news: 'sensible' },
  { id: 'launchlet', label: 'Launchlet only, by hand', menu: [PRESETS.launchlet], staffing: none, accept: 'forecast', news: 'sensible' },
  { id: 'careful', label: 'Dear bespoke with a checklist', menu: [{ ...PRESETS.bespoke, price: 1100 }], staffing: none, accept: 'forecast', news: 'sensible', plan: [{ day: 1, buy: ['checklist'] }] },
  {
    id: 'inventor',
    label: 'A two-launch offer of their own',
    menu: [{ name: 'Two-step', launches: 2, spacingDays: 3, turnaroundDays: 3, scope: 'any', style: 'custom', price: 1500 }, PRESETS.launchlet],
    staffing: { aiTier: 'solo', routing: 'simple' },
    accept: 'forecast',
    news: 'sensible',
  },
  { id: 'late', label: 'Bespoke by hand, overtime when it fits', menu: [PRESETS.bespoke], staffing: none, accept: 'forecast', overtime: true },
];

export interface EndingRow {
  id: string;
  title: string;
  count: number;
  share: number;
}

export function endingDistribution(seeds = 4): { total: number; rows: EndingRow[] } {
  const counts = new Map<string, { title: string; count: number }>();
  let total = 0;
  for (const sc of SCENARIOS)
    for (const p of ENDING_MANAGERS)
      for (let i = 1; i <= seeds; i++) {
        const e = seasonEnding(runPolicy({ scenarioId: sc.id, seed: `end${i}` }, p));
        const c = counts.get(e.id) ?? { title: e.title, count: 0 };
        c.count += 1;
        counts.set(e.id, c);
        total += 1;
      }
  const rows = [...counts.entries()].map(([id, c]) => ({ id, title: c.title, count: c.count, share: c.count / total })).sort((a, b) => b.count - a.count);
  return { total, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { total, rows } = endingDistribution(Number(process.argv[2] ?? 4));
  console.log(`${total} seasons`);
  for (const r of rows) console.log(`${(r.share * 100).toFixed(1).padStart(5)}%  ${String(r.count).padStart(3)}  ${r.title}`);
}
