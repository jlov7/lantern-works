// The studio's levers: who is in today, extra hands, overtime, upgrades and flyers, each with its cost and its catch.
import { memo, useMemo, useState, type JSX } from 'react';
import { RULES, SEGMENTS } from '../../engine/rules';
import { dailyCosts, juniorPayoff } from '../../engine/selectors';
import { capacityCost } from './capacityCosts';
import { applyCommand, SEGMENT_IDS, workingOn } from '../../engine/sim';
import type { Command, CompanyState, Resource, SegmentId, UpgradeId } from '../../engine/types';
import { credits, dayLabel, num } from '../format';
import type { Opens } from './firstSeason';
import { Coach } from './Guide';
import { launchMinutes } from './workshopMath';
import type { HintLever, StudioHint } from './studioHint';
import { specializationOn } from '../../engine/mentoring';
import { Mentoring } from './Mentoring';
import { PatternShelf } from '../creative/PatternShelf';
import { hasAuthorshipRules, hasStudioRules } from '../../engine/versions';

interface Props {
  state: CompanyState;
  disabled: boolean;
  apply: (c: Command) => void;
  /** First season: the mornings flyers and upgrades open. Null shows everything. */
  opens: Opens;
  hint: StudioHint | null;
}

const UPGRADES: UpgradeId[] = ['library', 'checklist', 'styleGuide'];

function role(r: Resource, day: number): string {
  if (r.role === 'lead') return 'brief, make, finish';
  if (r.role === 'temp') return 'temp, today only';
  if (r.role === 'junior') {
    const skill = specializationOn(r, day);
    return `${skill === 'proofing' ? 'briefs, finishing and redos at 115% time' : skill === 'templates' ? 'briefs, finishing; makes simple templates at 125% time' : 'briefs and finishing only, slower'}${r.toDay !== null ? `, until ${dayLabel(r.toDay)}` : ''}`;
  }
  return "the AI desk";
}

/** "Ada and Tomas (brief, make, finish); Noor (...)": people who share a role are named together. */
function byRole(rs: Resource[], day: number): string {
  const groups = new Map<string, string[]>();
  for (const r of rs) groups.set(role(r, day), [...(groups.get(role(r, day)) ?? []), r.name]);
  return [...groups].map(([what, names]) => `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} (${what})`).join('; ');
}

function leverReasons(state: CompanyState) {
  const noor = state.resources.find(r => r.kind === 'human' && r.role === 'junior' && r.name === RULES.staff.junior.name && (r.toDay === null || r.toDay >= state.day));
  const err = (c: Command) => applyCommand(state, c).error ?? null;
  return {
    hire: err(noor ? { type: 'letGo', resourceId: noor.id } : { type: 'hire' }),
    temp: err({ type: 'temp' }),
    overtime: err({ type: 'overtime' }),
    flyers: err({ type: 'flyers', segment: 'small' }),
    ...Object.fromEntries(UPGRADES.map((u) => [u, err({ type: 'buy', item: u })])),
  } as Record<'hire' | 'temp' | 'overtime' | 'flyers' | UpgradeId, string | null>;
}

interface LeverProps {
  id: string;
  label: string;
  cost: string;
  detail: string;
  action: string;
  why: string | null;
  disabled: boolean;
  onClick: () => void;
  /** The lever this morning's hint points at. */
  suggested?: boolean;
  /** Show the explanation; otherwise it is hidden and still read out as the button's description. */
  explain?: boolean;
  /** A fuller name for the button when its text is short. */
  actionLabel?: string;
  children?: JSX.Element;
}

function Lever({ id, label, cost, detail, action, actionLabel, why, disabled, onClick, suggested, explain, children }: LeverProps): JSX.Element {
  return (
    <li className={`lever${suggested ? ' is-suggested' : ''}`}>
      <div className="lever-top">
        <span className="lever-label">{label}</span>
        <span className="lever-cost">{cost}</span>
      </div>
      <p className="small lever-detail" id={`${id}-d`} hidden={!(explain || suggested)}>
        {detail}
      </p>
      <div className="lever-act">
        {children}
        <button type="button" className="btn btn-small" onClick={onClick} disabled={disabled || why !== null} aria-label={actionLabel} aria-describedby={`${id}-d${why ? ` ${id}-why` : ''}`}>
          {action}
        </button>
      </div>
      {why && !disabled && (
        <p className="small lever-why" id={`${id}-why`}>
          {why}
        </p>
      )}
    </li>
  );
}

export const StudioPanel = memo(function StudioPanel({ state, disabled, apply, opens, hint }: Props): JSX.Element {
  const d = state.day;
  const [segment, setSegment] = useState<SegmentId>('small');
  const inToday = workingOn(state, d);
  const humans = state.resources.filter((r) => r.kind === 'human');
  const away = humans.filter((r) => r.fromDay <= d && (r.toDay === null || r.toDay >= d) && !inToday.includes(r));
  const coming = humans.filter((r) => r.fromDay > d);
  const noor = humans.find((r) => r.role === 'junior' && r.name === RULES.staff.junior.name && (r.toDay === null || r.toDay >= d));
  // A dry run of each lever gives the engine's own reason when it can't be used.
  // Local explanation and flyer controls reuse the same reasons until the game state changes.
  const why = useMemo(() => leverReasons(state), [state]);
  const j = RULES.staff.junior;
  const costs = dailyCosts(state);
  const temp = capacityCost(state, 'temp');
  const overtime = capacityCost(state, 'overtime');
  const juniorHours = Math.round(((RULES.humanShift / 60) * 100) / j.speedPercent);
  // What Noor could return over the rest of the season, in the window's quickest offer, against her wages.
  const daysLeft = Math.max(0, RULES.days - (d + 1));
  const quick = state.menu
    .filter((o) => o.price > 0)
    .map((o) => ({ o, h: launchMinutes(state, o) / 60 / o.launches }))
    .sort((a, b) => a.h - b.h)[0];
  const room = quick ? Math.floor((daysLeft * juniorHours) / Math.max(0.5, quick.h)) : 0;
  const payoff = quick && daysLeft > 0 ? ` Room for about ${room} more ${quick.o.name} launches by the end, for ${credits(daysLeft * j.dailyCost)} in wages.` : '';
  const paid = juniorPayoff(state);
  const flyersOpen = !opens || d >= opens.flyers;
  const upgradesOpen = !opens || d >= opens.upgrades;
  const tip = (l: HintLever) => hint?.lever === l;
  // One line per lever by default (the newcomer persona skipped this panel as a wall of text); the hinted lever
  // and the toggle show the explanations.
  const [explain, setExplain] = useState(false);

  return (
    <section className="panel studio" id="studio" aria-labelledby="studio-h">
      <Coach step={4} manual className="coach-down" />
      <div className="panel-head">
        <h2 id="studio-h" tabIndex={-1}>The studio</h2>
        <button type="button" className="btn btn-small btn-quiet" aria-pressed={explain} onClick={() => setExplain((e) => !e)}>
          {explain ? 'Fewer words' : 'Explain the options'}
        </button>
      </div>
      <p className="small staff-line">
        <strong>In today:</strong> {byRole(inToday, d)}.
        {away.length > 0 && <> Off today: {away.map((r) => r.name).join(', ')}.</>}
        {coming.length > 0 && <> Starting soon: {coming.map((r) => `${r.name}, ${dayLabel(r.fromDay)}`).join('; ')}.</>}
        {state.overtimeDays.includes(d) && <> Overtime booked: everyone stays until 5pm, {credits(RULES.staff.overtimePerPerson * inToday.length)} at opening.</>}
      </p>
      <p className="costs small">
        Running costs <strong>{credits(costs.total)} a day</strong>: wages {num(costs.wages)}, rent {num(costs.shop)}
        {costs.ai ? `, AI desk ${num(costs.ai)}` : ''}.
      </p>
      {paid && (
        <p className="small payoff-line">
          {paid.name} so far: {credits(paid.wages)} in wages; {hasStudioRules(state.rulesVersion) ? `${state.events.filter(e => e.type === 'task_done' && e.resourceId === noor?.id).length} customer tasks completed.` : `her ${paid.hours} hours of work went into launches worth about ${credits(paid.worth)}.`}
        </p>
      )}
      {hint && !disabled && (hint.lever !== 'flyers' || flyersOpen) && <p className="studio-hint small">{hint.text}</p>}
      {noor && <Mentoring key={noor.id} state={state} noor={noor} disabled={disabled} apply={apply} />}
      <ul className="levers">
        {noor ? (
          <Lever id="lv-hire" label={`Let ${noor.name} go`} cost={`saves ${j.dailyCost} a day`} detail={noor.fromDay > d ? `${noor.name} won't start.` : `${noor.name} works today, then leaves.`} action={`Let ${noor.name} go`} why={why.hire} disabled={disabled} explain={explain} onClick={() => apply({ type: 'letGo', resourceId: noor.id })} />
        ) : (
          <Lever id="lv-hire" label={`Hire ${j.name}, a junior`} cost={`${j.dailyCost} a day, so ${credits(costs.total + j.dailyCost)} in all`} detail={`About ${juniorHours} more hours of work a day from tomorrow (briefs and finishing).${payoff}`} explain action={`Hire ${j.name}`} why={why.hire} disabled={disabled} suggested={tip('hire')} onClick={() => apply({ type: 'hire' })} />
        )}
        <Lever id="lv-temp" label={`Book a temp (${RULES.staff.temp.name})`} cost={state.tempDays.includes(d) ? 'Booked' : why.temp ? 'Unavailable' : temp.opening ? `${credits(temp.total)} total` : `${credits(temp.now)} now`} detail={`Full skills, today only, but what they make is redone ${RULES.staff.temp.reworkPercent / 100} times as often.${!state.tempDays.includes(d) && !why.temp ? ` ${credits(temp.now)} paid now${temp.opening ? `, ${credits(temp.opening)} extra overtime at opening` : ''}.` : ''}`} action="Book a temp" why={why.temp} disabled={disabled} explain={explain} suggested={tip('temp')} onClick={() => apply({ type: 'temp' })} />
        <Lever id="lv-ot" label="Overtime" cost={state.overtimeDays.includes(d) ? 'Booked' : why.overtime ? 'Unavailable' : `${credits(overtime.total)} at opening`} detail={`Everyone in today stays until 5pm. Charged when you open. Tomorrow they work ${RULES.staff.tiredPercent - 100}% slower, and not two days running.`} action="Book overtime" why={why.overtime} disabled={disabled} explain={explain} suggested={tip('overtime')} onClick={() => apply({ type: 'overtime' })} />
        {flyersOpen && (
        <Lever id="lv-fly" label="Hand out flyers" cost={credits(RULES.flyers.cost)} detail={`${RULES.flyers.count} extra neighbours of the type you choose come tomorrow. They still need an offer they like.`} action="Hand out flyers" why={why.flyers} disabled={disabled} explain={explain} suggested={tip('flyers')} onClick={() => apply({ type: 'flyers', segment })}>
          <label className="flyer-pick">
            <span className="vh">Flyers for</span>
            <select value={segment} onChange={(e) => setSegment(e.target.value as SegmentId)} disabled={disabled || why.flyers !== null}>
              {SEGMENT_IDS.map((id) => (
                <option key={id} value={id}>
                  {SEGMENTS[id].label}
                </option>
              ))}
            </select>
          </label>
        </Lever>
        )}
      </ul>
      {upgradesOpen && (
      <div className="upgrades">
        <h3 className="levers-h">Upgrades, bought once</h3>
      <ul className="levers">
        {UPGRADES.map((u) => {
          const up = RULES.upgrades[u];
          const have = state.upgrades.includes(u);
          return have ? (
            <li key={u} className="lever lever-owned">
              <div className="lever-top">
                <span className="lever-label">{up.label}</span>
                <span className="lever-cost">Bought</span>
              </div>
              <p className="small lever-detail">{up.detail}</p>
            </li>
          ) : (
            <Lever key={u} id={`lv-${u}`} label={up.label} cost={credits(up.cost)} detail={up.detail} action="Buy" actionLabel={`Buy the ${up.label.replace(/^[A-Z][a-z]/, (m) => m.toLowerCase())}`} why={why[u]} disabled={disabled} explain={explain} onClick={() => apply({ type: 'buy', item: u })} />
          );
        })}
      </ul>
      </div>
      )}
      {hasAuthorshipRules(state.rulesVersion) && <PatternShelf state={state} disabled={disabled} apply={apply} />}
    </section>
  );
});
