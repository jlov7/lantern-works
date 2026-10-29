import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { forecast } from './selectors';
import { replay } from './sim';
import type { Command, RunConfig } from './types';

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/temp-assignment.json'), 'utf8')) as { config: RunConfig; commands: Command[] };

describe('a temp and a nearly free faster lead', () => {
  it.each([false, true])('does not need Ines (%s) to keep Ash on time while taking Lorna', (withInes) => {
    const commands: Command[] = [...fixture.commands, ...(withInes ? [{ type: 'accept' as const, requestId: 'd3-r1' }] : [])];
    const { state, errors } = replay(fixture.config, commands);
    expect(errors).toEqual([]);
    expect(state.requests.find((r) => r.id === 'd3-r7')?.castId).toBe('lorna');
    expect(forecast(state, 'd3-r7')).toEqual({ atRisk: [], newAtRisk: [], newAfterSeason: [], existingAfterSeason: [] });
  });
});
