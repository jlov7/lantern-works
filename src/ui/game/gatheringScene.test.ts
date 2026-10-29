import { describe, expect, it } from 'vitest';
import { replay } from '../../engine/sim';
import type { Command } from '../../engine/types';
import full from '../../../test-fixtures/replays/historical-trail-save.json';
import partial from '../../../test-fixtures/replays/deliberate-overcommit-4-save.json';
import failed from '../../../test-fixtures/replays/deliberate-overcommit-30-save.json';
import absent from '../../../test-fixtures/replays/absent-gathering-save.json';
import { nightStudy } from '../portfolio/study';
import { gatheringSceneAt } from './gatheringScene';
import { portfolioAt } from './portfolio';
import compromised from '../../../test-fixtures/replays/phone-compromised.json';
import { streetDisplayAt } from './streetDisplay';
import { seasonEnding } from '../../engine/endings';
import { nightResult } from '../../engine/projects';
import { projectCompletionLine } from './commissionFacts';

function scene(tape: { config: typeof full.config; commands: unknown[]; rules: string }) {
  const run = replay(tape.config, tape.commands as Command[], tape.rules);
  expect(run.errors).toEqual([]);
  return gatheringSceneAt(run.state);
}

describe('gathering staging facts', () => {
  it('keeps a freshly played original gathering complete when its extra change was declined', () => {
    const run = replay(compromised.config, compromised.commands as Command[], compromised.rules);
    expect(run.errors).toEqual([]);
    const before = structuredClone(run.state);
    const record = nightResult(run.state).project!;
    expect(record.status).toBe('compromised');
    expect(record.delivered).toBe(record.promised);
    expect(seasonEnding(run.state).line).toContain('original programme was delivered');
    const display = streetDisplayAt(run.state);
    expect(display.mode).toBe('courtyard');
    expect(display.eventName).toBe('Lantern Night');
    expect(display.eventNote).toBe('The original programme was delivered. The extra change was declined.');
    expect(display.locations.find(location => location.eventPiece)?.work?.brief.proof).toEqual(record.contract.project!.proof);
    expect(gatheringSceneAt(run.state).hosts.map(host => host.castId)).toEqual(['clem']);
    expect(gatheringSceneAt(run.state).attendees).toBeNull();
    expect(projectCompletionLine(record)).toBe('The original gathering programme is delivered. The extra change was declined.');
    expect(run.state).toEqual(before);
  });
  it('stages only earned hosts in a completed native event', () => {
    const result = scene(full);
    expect(result.status).toBe('delivered');
    expect(result.deliveredPieceIds).toHaveLength(3);
    expect(result.hosts.map(host => host.castId).sort()).toEqual(['clem', 'mara']);
    expect(result.attendees).toBeNull();
  });
  it.each([[partial, 'partial', 1], [failed, 'failed', 0], [absent, 'window', 0]] as const)('does not stage hosts for %s', (tape, status, count) => {
    const result = scene(tape);
    expect(result.status).toBe(status);
    expect(result.deliveredPieceIds).toHaveLength(count);
    expect(result.hosts).toEqual([]);
    expect(result.attendees).toBeNull();
  });
  it('credits Hugo’s quiet portrait without making him a host', () => {
    const result = gatheringSceneAt(nightStudy('main-street', 'courtyard'));
    expect(result.contributions.map(c => c.castId)).toContain('hugo');
    expect(result.hosts.map(h => h.castId)).not.toContain('hugo');
  });
  it('keeps a refused-change print in the portfolio while withholding its contribution and host role', () => {
    const state = nightStudy('main-street', 'courtyard');
    const contract = state.contracts.find(c => c.project?.id === 'clem-ten')!;
    const job = state.jobs.find(j => j.contractId === contract.id)!;
    job.changeDeclined = true;
    state.events.push({ type: 'project_change_declined', jobId: job.id, minute: job.deliveredAt! - 1, day: job.releaseDay });
    expect(portfolioAt(state).some(piece => piece.jobId === job.id)).toBe(true);
    const result = gatheringSceneAt(state);
    expect(result.contributions.map(c => c.castId)).not.toContain('clem');
    expect(result.hosts.map(h => h.castId)).not.toContain('clem');
  });
});
