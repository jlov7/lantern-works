import { useEffect, useState, type FormEvent } from 'react';
import {
  DIFFICULTIES, PRIORITIES, eligibleDecisionCards, loadDecisionPractice, practiceDifficulty, practiceEvening, practicePriority, resolveDecisionCard,
  type Difficulty, type PracticeEvening, type PracticePlan, type Priority,
} from '../game/decisionPractice';
import { decisionPracticeSettings, rememberDecisionPractice } from '../game/storage';
import { credits, signed } from '../format';
import { encodeShare, loadRuns } from '../persist';
import '../../styles/decision-practice.css';

type Settings = { priority: Priority; difficulty: Difficulty; forecast: boolean };

function readSettings(): Settings {
  const saved = new URLSearchParams(decisionPracticeSettings() ?? '');
  const search = new URLSearchParams(location.search);
  return {
    priority: practicePriority.safeParse(search.get('priority')).data ?? practicePriority.safeParse(saved.get('priority')).data ?? 'relationships',
    difficulty: practiceDifficulty.safeParse(search.get('difficulty')).data ?? practiceDifficulty.safeParse(saved.get('difficulty')).data ?? 'guided',
    forecast: (search.get('forecast') ?? saved.get('forecast')) !== 'off',
  };
}

function listedBookings(plan: PracticePlan) {
  return plan.bookings.join(' and ');
}

function Plan({ plan, showForecast, sharedCost }: { plan: PracticePlan; showForecast: boolean; sharedCost: boolean }) {
  return <li className="practice-plan">
    <h3>{listedBookings(plan)}</h3>
    {!sharedCost && <p>{plan.tempCostCr ? `Hire a temp for ${credits(plan.tempCostCr)}.` : 'Keep the current crew.'}</p>}
    <p>Due up front: {credits(plan.depositCr)}.</p>
    {showForecast && plan.regularBookings.length > 0 && <p>Regulars: {plan.regularBookings.join(' and ')}.</p>}
    {showForecast && <p>{plan.forecastFlags.length ? `Forecast risk: ${plan.forecastFlags.join(' and ')} may miss a launch.` : 'Both bookings fit in the forecast.'}</p>}
  </li>;
}

function OutcomeTable({ pair, plans }: { pair: [PracticeEvening, PracticeEvening]; plans: PracticePlan[] }) {
  const [a, b] = pair;
  const planA = plans.find(plan => plan.id === a.id)!;
  const planB = plans.find(plan => plan.id === b.id)!;
  const deliveryChange = b.delivered - a.delivered;
  const deliveryDifference = deliveryChange === 0 ? 'the same number of deliveries'
    : `${Math.abs(deliveryChange)} ${deliveryChange > 0 ? 'more' : 'fewer'} ${Math.abs(deliveryChange) === 1 ? 'delivery' : 'deliveries'}`;
  const rows = [
    { label: 'Cash in the till', a: credits(a.cashCr), b: credits(b.cashCr) },
    { label: 'Earned today', a: credits(a.earnedCr), b: credits(b.earnedCr) },
    { label: 'Held for work still owed', a: credits(a.unearnedCr), b: credits(b.unearnedCr) },
    { label: 'Deliveries today', a: a.delivered, b: b.delivered },
    { label: 'Missed today', a: a.missed, b: b.missed },
    { label: 'Neighbours lost today', a: a.lostNeighbours.join(', ') || 'None', b: b.lostNeighbours.join(', ') || 'None' },
  ];
  return <>
    <table className="practice-results">
      <caption>Recorded evenings</caption>
      <thead><tr><td /><th scope="col">{listedBookings(planA)}</th><th scope="col">{listedBookings(planB)}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.a}</td><td>{row.b}</td></tr>)}</tbody>
    </table>
    {(a.cashCr !== b.cashCr || a.earnedCr !== b.earnedCr || a.delivered !== b.delivered) && <p>
      With {listedBookings(planB)}, the change was {signed(b.cashCr - a.cashCr)} cr in the till, {signed(b.earnedCr - a.earnedCr)} cr earned and {deliveryDifference}.
    </p>}
  </>;
}

export default function DecisionPractice() {
  const [practice] = useState(loadDecisionPractice);
  const [settings, setSettings] = useState(readSettings);
  const [active, setActive] = useState(settings);
  const [replayLink, setReplayLink] = useState('');
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [results, setResults] = useState<PracticeEvening[] | null>(null);
  const { card } = resolveDecisionCard(active.priority, eligibleDecisionCards(active.difficulty, practice.options));
  const plans = card ? card.options.map(id => practice.options.find(plan => plan.id === id)!) : [];
  const sharedCost = plans.length === 2 && plans[0]!.tempCostCr === plans[1]!.tempCostCr ? plans[0]!.tempCostCr : null;
  const first = results?.find(row => row.id === plans[0]?.id);
  const second = results?.find(row => row.id === plans[1]?.id);

  useEffect(() => {
    document.title = 'Decision practice - Lantern Works';
    let open = true;
    const { config, commands, rules } = practice.morning;
    void encodeShare(config, commands, 'Festival Week rehearsal', rules).then(code => {
      if (open) setReplayLink(`${location.origin}${location.pathname}#s=${code}`);
    }, () => { if (open) setPrepareFailed(true); });
    return () => { open = false; };
  }, [practice]);

  const showChallenge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = new URL(location.href);
    const choice = new URLSearchParams({
      priority: settings.priority, difficulty: settings.difficulty, forecast: settings.forecast ? 'on' : 'off',
    });
    for (const [key, value] of choice) url.searchParams.set(key, value);
    history.replaceState(history.state, '', url);
    rememberDecisionPractice(choice.toString());
    setActive(settings);
    setResults(null);
  };

  const compare = () => {
    if (!card) return;
    const found: PracticeEvening[] = [];
    for (const saved of loadRuns()) {
      const evening = practiceEvening(saved, practice, card);
      if (evening && !found.some(row => row.id === evening.id)) found.push(evening);
      if (found.length === plans.length) break;
    }
    setResults(found);
  };

  return <main className="title decision-practice" id="main">
    <a className="btn btn-quiet" href={`${location.origin}${location.pathname}`}>Back to Lantern Works</a>
    <header>
      <p className="practice-street">Festival Week, Day {practice.day + 1}</p>
      <h1>What will you protect?</h1>
      <p>Pick a studio principle, then try two ways through the same morning.</p>
    </header>
    <form className="practice-settings" onSubmit={showChallenge}>
      <label>Studio principle
        <select value={settings.priority} onChange={event => setSettings({ ...settings, priority: practicePriority.parse(event.target.value) })}>
          {Object.entries(PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Difficulty
        <select value={settings.difficulty} onChange={event => setSettings({ ...settings, difficulty: practiceDifficulty.parse(event.target.value) })}>
          {Object.entries(DIFFICULTIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="practice-help"><input type="checkbox" checked={settings.forecast}
        onChange={event => setSettings({ ...settings, forecast: event.target.checked })} /> Show forecast hints</label>
      <button type="submit" className="btn">Show challenge</button>
    </form>
    <section className="practice-card" aria-labelledby="practice-heading">
      <h2 id="practice-heading" aria-live="polite">{card?.question ?? 'No challenge fits this morning.'}</h2>
      {card && <>
        <p>{DIFFICULTIES[active.difficulty]} · {PRIORITIES[active.priority]}</p>
        <p>{sharedCost === null ? 'Book the jobs in the order shown.'
          : sharedCost ? `Both plans hire a temp for ${credits(sharedCost)}. Book the jobs in the order shown.`
            : 'Both plans keep the current crew. Book the jobs in the order shown.'}</p>
        <ul className="practice-plans">{plans.map(plan => <Plan key={plan.id} plan={plan} showForecast={active.forecast} sharedCost={sharedCost !== null} />)}</ul>
        <p>Save a copy when the morning opens. Play to the evening, then return from the title to try the other plan.</p>
        {replayLink ? <a className="btn btn-primary" href={replayLink}>Play the morning</a>
          : <p role="status">{prepareFailed ? 'This browser could not open the rehearsal replay.' : 'Preparing the morning…'}</p>}
      </>}
    </section>
    {card && <section className="practice-compare" aria-labelledby="practice-compare-heading">
      <h2 id="practice-compare-heading">Compare the evenings</h2>
      <p>Read the latest saved result for each plan. Stop at the end of the rehearsal day.</p>
      <button type="button" className="btn" onClick={compare}>Check saved evenings</button>
      {results !== null && <p role="status">{first && second ? 'Both plans found.' : `${results.length} of 2 finished plans found.`}</p>}
      {first && second && <OutcomeTable pair={[first, second]} plans={plans} />}
    </section>}
  </main>;
}
