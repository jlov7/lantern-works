// Golden replays (ADR 003): saves, share links, branches and ghosts all depend on replay giving the same season.
// If an outcome changes while RULES.version stays the same, this fails. After a deliberate rules change, bump
// RULES.version and regenerate with: UPDATE_GOLDEN=1 pnpm exec vitest run src/engine/golden.test.ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GHOSTS, runPolicy, type Policy } from './policies';
import { PRESETS, RULES, SCENARIOS } from './rules';

const FILE = join(__dirname, 'fixtures', 'golden.json');
const active: Policy = {
  id: 'active',
  label: 'active',
  menu: [PRESETS.bespoke, PRESETS.launchlet],
  staffing: { aiTier: 'solo', routing: 'all' },
  accept: 'cheapest',
  news: 'sensible',
  overtime: true,
  plan: [{ day: 1, buy: ['styleGuide'] }, { day: 2, hire: true }, { day: 6, menu: [PRESETS.club, PRESETS.launchlet] }],
};

function corpus(rulesVersion: string = RULES.version): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sc of SCENARIOS)
    for (const p of [GHOSTS.old, GHOSTS.faster, active]) {
      const s = runPolicy({ scenarioId: sc.id, seed: 'golden' }, p, {}, rulesVersion);
      const fingerprint = JSON.stringify({ commands: s.commands, journal: s.journal, jobs: s.jobs, rep: s.rep, news: s.news, cash: s.cash });
      out[`${sc.id}/${p.id}`] = createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);
    }
  return out;
}

describe('golden replays', () => {
  it('preserves the original 6.1 policy goldens', () => {
    const saved = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'golden-6.1.0.json'), 'utf8')) as { rulesVersion: string; runs: Record<string, string> };
    expect(saved.rulesVersion).toBe('lantern-6.1.0');
    expect(corpus(saved.rulesVersion)).toEqual(saved.runs);
  });
  it('outcomes only change together with RULES.version', () => {
    const now = { rulesVersion: RULES.version, tapeVersion: RULES.tapeVersion, runs: corpus() };
    if (process.env.UPDATE_GOLDEN || !existsSync(FILE)) {
      writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n');
      return;
    }
    const saved = JSON.parse(readFileSync(FILE, 'utf8')) as typeof now;
    if (saved.rulesVersion !== now.rulesVersion || saved.tapeVersion !== now.tapeVersion) {
      throw new Error(`Rules version changed (${saved.rulesVersion} -> ${now.rulesVersion}). Regenerate: UPDATE_GOLDEN=1 pnpm exec vitest run src/engine/golden.test.ts`);
    }
    expect(now.runs, 'An outcome changed without a RULES.version bump. Bump it (saves and links from the old version will be kept and labelled), then regenerate.').toEqual(saved.runs);
  });
});
