import { useMemo, useState, type JSX } from 'react';
import { MENTORING, noorWork, specializationOn } from '../../engine/mentoring';
import { mentoringBlocked } from '../../engine/sim';
import { dayPlan } from '../../engine/selectors';
import type { Command, CompanyState, Resource, Specialization } from '../../engine/types';
import { hasStudioRules } from '../../engine/versions';
import { dayLabel } from '../format';
import { DayPlan } from './DayPlan';
import { mentoringPreview } from './mentoringPreview';
import { promiseLabel } from './promiseLabel';
import '../../styles/mentoring.css';

export function Mentoring({ state, noor, disabled, apply }: { state: CompanyState; noor: Resource; disabled: boolean; apply: (command: Command) => void }): JSX.Element | null {
  const [selected, setSelected] = useState<Specialization | null>(null);
  const preview = useMemo(() => {
    if (!selected) return null;
    const quote = mentoringPreview(state, noor.id, selected);
    if (!quote) return null;
    const baseline = dayPlan(quote.state);
    return { ...quote, calendar: { baseline, considering: null, preview: baseline } };
  }, [state, noor.id, selected]);
  if (!hasStudioRules(state.rulesVersion)) return null;
  const trained = specializationOn(noor, state.day);
  const m = noor.mentorship;
  const proof = noorWork(state);
  const names = (ids: string[]) => [...new Set(ids.map(id => promiseLabel(state, id, 'customer')))].join(', ');
  if (m) return <section className="mentoring chosen" aria-label="Noor’s development">
    <h3>{MENTORING[m.kind].name}</h3>
    <p className="small">{trained ? `${MENTORING[m.kind].detail.replace('From tomorrow, ', '')}${proof?.completed ? ` ${proof.completed} completed ${proof.completed === 1 ? 'task has' : 'tasks have'} used the training.` : ' No completed task has used the training yet.'}` : `${noor.name} and ${MENTORING[m.kind].mentor} spend the first ${MENTORING[m.kind].minutes} minutes together on ${dayLabel(m.day)}. The new skill starts on ${dayLabel(m.day + 1)}.`}</p>
  </section>;
  return <details className="mentoring" aria-label="Noor’s development">
    <summary>A direction for Noor</summary>
    <p className="small">Choose one specialism for this time at the studio. The lesson takes both people away from customer work this morning. Wages stay the same.</p>
    <fieldset disabled={disabled}>
      <legend>What should Noor practise?</legend>
      {(Object.keys(MENTORING) as Specialization[]).map(kind => {
        const lesson = MENTORING[kind];
        const blocked = mentoringBlocked(state, noor.id, kind);
        return <label className="mentoring-option" key={kind}>
          <input type="radio" name="noor-specialism" value={kind} checked={selected === kind} onChange={() => setSelected(kind)} disabled={blocked !== null} />
          <span><strong>{lesson.name}</strong><span>{lesson.minutes} minutes each this morning. {lesson.detail}</span>{blocked && <span className="muted">{blocked}</span>}</span>
        </label>;
      })}
    </fieldset>
    {preview && selected && <div className="mentoring-quote">
      <p className="small">{MENTORING[selected].mentor} and Noor are occupied until {selected === 'proofing' ? '10:30am' : '11am'}. {preview.late.length > 0 && `Without redos, the remaining plan would miss: ${names(preview.late)}. `}{preview.refunded.length > 0 && `At season close, ${preview.refunded.length} unfinished ${preview.refunded.length === 1 ? 'launch' : 'launches'} for ${names(preview.refunded)} would be refunded. `}{preview.late.length === 0 && preview.refunded.length === 0 && 'Existing promises still fit in the no-redo forecast.'}</p>
      <details><summary>See the training day</summary><DayPlan state={preview.state} considering={null} calendar={preview.calendar} /></details>
      <button type="button" className="btn btn-paper" disabled={disabled} onClick={() => apply({ type: 'mentor', resourceId: noor.id, specialization: selected })}>Book {MENTORING[selected].name.toLowerCase()}</button>
    </div>}
  </details>;
}
