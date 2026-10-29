import { careerStage, careerStories } from '../../engine/career';
import type { CompanyState } from '../../engine/types';

export function careerIdentity(state: CompanyState) {
  const stage = careerStage(state);
  if (!stage) return null;
  const purpose = {
    opening: { title: 'Opening the studio', line: 'Make the first promises, find a working rhythm, and choose what to make for the street.' },
    practice: { title: 'A practice of your own', line: 'Help Clem develop the archive, Mara try a market, and Ivo make his own workshop. The work now builds on what happened before.' },
    legacy: { title: 'What the studio leaves behind', line: 'Choose what to share with the neighbourhood: an archive, a shared table, or repair knowledge. Retained work can have a new use.' },
    open: { title: 'Open studio', line: 'The authored career is complete. Keep making recurring archive displays, seasonal tables and repair work, with another gathering each season.' },
  }[stage];
  return { stage, ...purpose, complete: state.finished && (stage === 'legacy' || stage === 'open'), stories: careerStories(state) };
}

export function canUndoRun(state: CompanyState): boolean {
  if (state.finished) return state.commands.at(-1)?.type === 'featurePieces';
  const boundary = state.commands.findLastIndex(command => command.type === 'runDay' || command.type === 'answer');
  return state.commands.length - 1 > boundary;
}
