import { expect } from '@playwright/test';
import { projectBrief } from '../src/engine/projects';
import { applyCommand, createRun } from '../src/engine/sim';
import type { Command, RunConfig } from '../src/engine/types';

/** Reuse native decisions with explicit current proof choices, leaving recorded tapes untouched. */
export function authoredCommands(config: RunConfig, recorded: readonly Command[], rulesVersion?: string): Command[] {
  let state = createRun(config, rulesVersion);
  return recorded.map(command => {
    const current: Command = command.type === 'acceptProject' ? { ...command, design: command.design ?? projectBrief(state, command.projectId, command.approach).defaultDesign } : command;
    const next = applyCommand(state, current);
    expect(next.error, JSON.stringify(current)).toBeUndefined();
    state = next.state;
    return current;
  });
}
