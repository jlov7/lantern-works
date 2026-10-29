import { forecast } from '../../engine/selectors';
import { applyCommand } from '../../engine/sim';
import type { CompanyState, Specialization } from '../../engine/types';

export function mentoringPreview(state: CompanyState, resourceId: string, specialization: Specialization) {
  const result = applyCommand(state, { type: 'mentor', resourceId, specialization });
  if (result.error) return null;
  const consequences = forecast(result.state);
  return { state: result.state, late: consequences.atRisk, refunded: consequences.existingAfterSeason };
}
