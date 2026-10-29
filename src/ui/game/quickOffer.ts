import { PRESETS, RULES } from '../../engine/rules';
import { applyCommand } from '../../engine/sim';
import type { Command, CompanyState } from '../../engine/types';
import { fitsToday, launchMinutes, offerEconomics, reachOf } from './workshopMath';

/** A concrete extra offer only when it wins someone currently walking away. */
export function quickOffer(state: CompanyState) {
  if (state.menu.length >= RULES.maxMenu) return null;
  const offer = PRESETS.launchlet;
  const command: Extract<Command, { type: 'setMenu' }> = { type: 'setMenu', offers: [...state.menu, offer] };
  // Locks and duplicate names must not turn a rejected menu into a misleading zero-buyer forecast.
  if (applyCommand(state, command).error) return null;
  const reach = reachOf(state, offer, state.menu.length);
  const newBuyers = reach.buyThis - reach.switched;
  if (!newBuyers) return null;
  const afterKit = { ...state, kit: { ...state.kit, status: 'ready' as const } };
  return {
    command,
    newBuyers,
    reach,
    today: fitsToday(state, offer, state.menu.length),
    minutesAfterKit: launchMinutes(afterKit, offer),
    economicsAfterKit: offerEconomics(afterKit, offer),
    kitMinutes: state.kit.status === 'none' ? RULES.effort.kitSetup : state.kit.remaining,
  };
}
