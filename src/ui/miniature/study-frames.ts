import { applyCommand, createRun, replay } from '../../engine/sim';
import { projectBrief } from '../../engine/projects';
import { CLOSING_PROMISE } from '../../engine/fixtures/closingPromise';
import { preparedStudy } from '../portfolio/study';
import { frameAt } from '../timeline';

/** Commands create every task and delivery. This study never writes job statuses or task events. */
export function miniatureStudyFrames() {
  const morning = createRun({ scenarioId: 'main-street', seed: 'e2e-1' });
  let before = preparedStudy();
  const staff = applyCommand(before, { type: 'setStaff', staffing: { aiTier: 'none', routing: 'human' } });
  if (staff.error) throw new Error(staff.error);
  before = staff.state;
  const accepted = applyCommand(before, { type: 'acceptProject', projectId: 'clem-ten', approach: 'new-band', maker: 'h1', design: projectBrief(before, 'clem-ten', 'new-band').defaultDesign });
  if (accepted.error) throw new Error(accepted.error);
  before = accepted.state;
  const result = applyCommand(before, { type: 'runDay' });
  if (result.error) throw new Error(result.error);
  const after = result.state;
  const make = after.events.find(e => e.day === before.day && e.type === 'task_start' && e.stage === 'produce');
  const index = CLOSING_PROMISE.commands.findIndex(c => c.type === 'answer' && c.option === 'late');
  const callMorning = replay(CLOSING_PROMISE.config, CLOSING_PROMISE.commands.slice(0, index - 1), CLOSING_PROMISE.rules);
  if (callMorning.errors.length) throw new Error(callMorning.errors.join('; '));
  const hold = applyCommand(callMorning.state, { type: 'runDay', calls: true });
  if (hold.error || !hold.state.call) throw new Error(hold.error ?? 'Native call did not pause');
  return [
    { id: 'morning', label: 'Morning window', state: morning, frame: frameAt(morning, morning, morning.minute), note: 'Clem is at the window. No orders have been accepted.' },
    { id: 'production', label: 'At the workbench', state: after, frame: frameAt(before, after, (make?.minute ?? before.minute) + 12), note: 'The booked anniversary proof, on the surface chosen by its recorded task.' },
    { id: 'evening', label: 'Evening', state: after, frame: frameAt(before, after, before.minute + 480), note: 'The same day at closing. Only work delivered by this minute is on the wall.' },
    { id: 'call', label: 'Call on hold', state: hold.state, frame: frameAt(callMorning.state, hold.state, hold.state.call.minute), note: 'A native paused call. The study cannot answer the call or accept work.' },
  ];
}
