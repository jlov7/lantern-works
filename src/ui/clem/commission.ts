import { designSchema, validateDesign, type DesignSpec } from '../../engine/design';
import { projectBrief, projectQuote } from '../../engine/projects';
import { applyCommand, replay } from '../../engine/sim';
import { portfolioAt } from '../game/portfolio';
import { z } from 'zod/mini';

export const CLEM_APPROACHES = ['first-night', 'new-band'] as const;
export type ClemApproach = (typeof CLEM_APPROACHES)[number];
const project = 'clem-ten';
const opening = replay({ scenarioId: 'main-street', seed: 'career-prosperous' }, [
  { type: 'accept', requestId: 'd0-r0' },
  { type: 'runDay' },
  { type: 'runDay' },
]).state;

// The studio has already delivered Clem's first ordinary job. The anniversary starts on his next visit.
export const clemBrief = (approach: ClemApproach) => projectBrief(opening, project, approach);
export const clemQuote = (approach: ClemApproach, design: DesignSpec) => projectQuote(opening, project, approach, design);
export const bookClem = (approach: ClemApproach, design: DesignSpec) =>
  applyCommand(opening, { type: 'acceptProject', projectId: project, approach, design });

export function printClem(approach: ClemApproach, design: DesignSpec) {
  const booking = bookClem(approach, design);
  if (booking.error) return null;
  const contract = booking.state.contracts.find(item => item.project?.id === project);
  const job = booking.state.jobs.find(item => item.contractId === contract?.id);
  if (!contract || !job) return null;
  let state = booking.state;
  while (state.minute < job.dueAt) {
    const next = applyCommand(state, { type: 'runDay' });
    if (next.error || next.state.minute <= state.minute) return null;
    state = next.state;
    const piece = portfolioAt(state).find(item => item.contractId === contract.id && item.complete);
    if (piece?.brief.proof && piece.day !== null) return { piece, state };
  }
  return null;
}

const sessionSchema = z.strictObject({
  version: z.literal(1),
  step: z.enum(['brief', 'review', 'press', 'lift', 'window']),
  approach: z.enum(CLEM_APPROACHES),
  design: designSchema,
});
export type ClemSession = z.infer<typeof sessionSchema>;
const saveKey = 'lantern.clem-commission.v1';

export function freshClem(): ClemSession {
  const design = clemBrief('new-band').defaultDesign;
  return { version: 1, step: 'brief', approach: 'new-band', design: { ...design, pieces: [{ ...design.pieces[0]!, palette: 'linen' }] } };
}

export function loadClem(): ClemSession {
  try {
    const saved = sessionSchema.safeParse(JSON.parse(sessionStorage.getItem(saveKey) ?? 'null'));
    if (saved.success && !validateDesign(clemBrief(saved.data.approach), saved.data.design).length) return saved.data;
  } catch { /* A closed or damaged session starts fresh. */ }
  return freshClem();
}

export function saveClem(session: ClemSession) {
  try { sessionStorage.setItem(saveKey, JSON.stringify(session)); } catch { /* Play can continue without storage. */ }
}
