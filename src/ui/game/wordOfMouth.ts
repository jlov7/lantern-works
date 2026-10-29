// Word of mouth in numbers the street panel can show. No React here.
import { RULES } from '../../engine/rules';
import { repLevel } from '../../engine/sim';

/**
 * On-time launches for this type that lift word of mouth one step and keep it there after a night's drift toward
 * zero (prices and arrivals read it the next morning). Null at the top.
 */
export function launchesToNextStep(rep: number): number | null {
  const level = repLevel(rep);
  if (level >= 4) return null;
  const P = RULES.rep.perLevel;
  // repLevel truncates toward zero: level k > 0 starts at k * P, level k <= 0 at k * P - (P - 1).
  const target = level + 1 > 0 ? (level + 1) * P : (level + 1) * P - (P - 1);
  // Above zero the drift pulls down, so aim one night's drift higher; below zero it helps.
  const drift = target > 0 ? RULES.rep.decay : -RULES.rep.decay;
  return Math.max(1, Math.ceil((target + drift - rep) / RULES.rep.delivered));
}
