// A call in the middle of the day: a launch due tonight is suddenly going to miss. The day waits while the player
// chooses, and each answer shows how the rest of the day would go, worked out before choosing.
import { memo, useEffect, useMemo, useRef, type JSX } from 'react';
import { RULES } from '../../engine/rules';
import { callChoices } from '../../engine/sim';
import type { CallOption, CompanyState } from '../../engine/types';
import { castName, credits, hours } from '../format';
import { clockLabel } from '../timeline';
import { callConsequence } from './callConsequence';
import { promiseLabel } from './promiseLabel';

const DAY = RULES.minutesPerDay;

interface Props {
  state: CompanyState;
  onAnswer: (option: CallOption) => void;
}

export const CallCard = memo(function CallCard({ state, onAnswer }: Props): JSX.Element | null {
  const call = state.call;
  const choices = useMemo(() => callChoices(state), [state]);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), []);
  if (!call) return null;
  const job = state.jobs.find((j) => j.id === call.jobId)!;
  const who = castName(job.castId);
  const project = state.contracts.find(contract => contract.id === job.contractId)!.project;
  const work = promiseLabel(state, job.id);
  const start = state.day * DAY;
  const asked = state.events.find((e) => e.type === 'snag' && e.jobId === job.id && e.day === state.day)?.amount ?? 0;
  const booking = choices.find(choice => choice.gatheringBooking?.shared)?.gatheringBooking;
  const name = (id: string) => promiseLabel(state, id, 'customer');

  const label: Record<CallOption, string> = {
    late: 'Everyone stays until 5pm',
    cut: 'Ship it without the change',
    ring: `Ring ${who}: tomorrow instead, ${RULES.ring.discountPercent}% off`,
    ride: 'Leave it',
  };

  return (
    <section className="call" role="alertdialog" aria-labelledby="call-h" aria-describedby="call-what">
      <h2 id="call-h" ref={head} tabIndex={-1}>
        A call at {clockLabel(call.minute - start)}
      </h2>
      <p id="call-what">
        {call.cause === 'snag' ? (
          <>
            {project ? `${work} needs ${hours(asked)} more finishing after ${who}'s call.` : `${who} rang with a change to their launch: ${hours(asked)} more finishing.`} As things stand it won't be ready by 5pm.
          </>
        ) : (
          <>{project ? work : <>{who}&rsquo;s launch</>} needs redoing. As things stand it won&rsquo;t be ready by 5pm.</>
        )}
      </p>
      <p className="small">Forecast through existing deadlines, with the current team and plan. No new work or future luck. You can still change tomorrow's capacity.</p>
      {booking && <p className="call-gathering"><strong>Gathering bookings close on Day {booking.day + 1}.</strong> {booking.available ? 'The current work would unlock an invitation with every available answer. You still need to book it that morning.' : 'The current work would not unlock either invitation by that morning with any available answer. This call still decides the print, the relationship and its cost.'}</p>}
      <ul className="call-options">
        {choices.map((c) => {
          const outcome = callConsequence(c, who, start, name);
          return (
            <li key={c.option}>
              <button type="button" className={`btn ${c.option === 'ride' ? 'btn-quiet' : 'btn-paper'}`} disabled={outcome.unavailable} onClick={() => onAnswer(c.option)} aria-describedby={`call-${c.option}`}>
                {label[c.option]}
                {outcome.unavailable ? ' (unavailable)' : ''}
                {c.option === 'late' && !outcome.unavailable ? ` (${credits(c.cost)})` : ''}
              </button>
              <span id={`call-${c.option}`} className={`small call-outcome${outcome.saved && c.futureRisks.length === 0 ? ' is-saved' : ''}`}>
                {outcome.text}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
