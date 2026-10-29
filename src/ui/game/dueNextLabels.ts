import type { Job } from '../../engine/types';

const STAGE: Record<Job['stage'], string> = { brief: 'to brief', produce: 'being made', finish: 'to finish', rework: 'needs rework', done: 'done' };

export function dueNextStage(job: Job, today: number): string {
  if (job.status === 'scheduled') return job.releaseDay === today ? 'starts today' : 'starts tomorrow';
  return STAGE[job.stage];
}
