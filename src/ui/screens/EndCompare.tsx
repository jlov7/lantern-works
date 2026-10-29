import { useMemo, type JSX } from 'react';
import { juniorPayoff, servedByDay, summarize, type Summary } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';
import { credits, dayLabel, pct } from '../format';
import { loadRuns, restore } from '../persist';
import type { RunMeta } from '../useRun';
import { GHOST_IDS, type GhostId, type useGhosts } from './ghosts';
import { GHOSTS } from '../../engine/policies';
import { SERIES_STYLE, type Series } from './series';
import { SeriesKey, ServedChart } from './ServedChart';

const GHOST_LABEL = (id: GhostId): string => GHOSTS[id].label;

function CompareRow({ id, label, s, you }: { id: keyof typeof SERIES_STYLE; label: string; s: Summary; you?: boolean }): JSX.Element {
  return (
    <tr className={you ? 'you' : ''}>
      <th scope="row">
        <SeriesKey s={SERIES_STYLE[id]} />
        {label}
      </th>
      <td data-label="Served">{s.served}</td>
      <td data-label="Kept">{pct(s.promisesKept)}</td>
      <td data-label="Missed">{s.missed}</td>
      <td data-label="Cash" className={s.cash < 0 ? 'neg' : ''}>
        {credits(s.cash)}
      </td>
      <td data-label="Operating result" className={s.operatingResult < 0 ? 'neg' : ''}>
        {credits(s.operatingResult)}
      </td>
      <td data-label="People busy">{pct(s.humanUtil)}</td>
    </tr>
  );
}

/** GD-29: a branch next to the season it came from, both rebuilt from their saved moves. */
export function BranchCompare({ state, meta }: { state: CompanyState; meta: RunMeta }): JSX.Element {
  const parent = useMemo(() => {
    const saved = loadRuns().find((r) => r.id === meta.parentId);
    const s = saved ? restore(saved) : null;
    return s ? { label: saved!.label, sum: summarize(s), finished: s.finished } : null;
  }, [meta.parentId]);
  const mine = summarize(state);
  if (!parent) {
    return (
      <section className="end-branch" aria-labelledby="br-h">
        <h2 id="br-h">This branch and the original</h2>
        <p className="muted">The season this branch came from is no longer saved in this browser, so there is nothing to compare with.</p>
      </section>
    );
  }
  const rows: [string, (s: Summary) => string, (s: Summary) => number][] = [
    ['Served', (s) => String(s.served), (s) => s.served],
    ['Promises kept', (s) => pct(s.promisesKept), (s) => s.promisesKept ?? 0],
    ['Missed', (s) => String(s.missed), (s) => -s.missed],
    ['Cash at close', (s) => credits(s.cash), (s) => s.cash],
    ['Operating result', (s) => credits(s.operatingResult), (s) => s.operatingResult],
  ];
  return (
    <section className="end-branch" aria-labelledby="br-h">
      <h2 id="br-h">This branch and the original</h2>
      <p className="muted small">
        Both seasons rebuilt from their saved moves. They match until the morning of {dayLabel(meta.branchDay ?? 0)}, where this branch went its own way.
        {!parent.finished && ' The original season is not finished yet.'}
      </p>
      <table className="branch-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Measure</span>
            </th>
            <th scope="col">This branch</th>
            <th scope="col">Original</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, show, rank]) => {
            const d = rank(mine) - rank(parent.sum);
            return (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className={d > 0 ? 'better' : undefined}>
                  {show(mine)}
                  {d > 0 && <span className="sr-only"> (better)</span>}
                </td>
                <td>{show(parent.sum)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Where your money went: the operating result as earned revenue less each kind of cost, largest first. */
function MoneyLine({ s, paid, start }: { s: Summary; paid: ReturnType<typeof juniorPayoff>; start: number }): JSX.Element {
  const costs = (
    [
      ['wages', s.wages],
      ['rent', s.shop],
      ['the AI desk', s.ai],
      ['fees for missed promises', s.fees],
      ['upgrades, flyers and street news', s.other],
    ] as const
  )
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  return (
    <p className="small money-line">
      Your money: earned {credits(s.revenue)} from delivered launches{s.other < 0 ? ` and ${credits(-s.other)} from street news` : ''}, then {costs.map(([k, v]) => `${k} ${credits(v)}`).join(', ')}. Operating result{' '}
      <strong className={s.operatingResult < 0 ? 'neg' : undefined}>{credits(s.operatingResult)}</strong>. Cash at the close ({credits(s.cash)}) is the {credits(start)} you opened with
      {s.cash - start === s.operatingResult ? ' plus this result' : ', plus this result and any credit still owed to the bank'}.
      {paid && ` ${paid.name} cost ${credits(paid.wages)} in wages; her ${paid.hours} hours of work went into launches worth about ${credits(paid.worth)}.`}
    </p>
  );
}

/** Your season beside the three scripted studios on the same street and seed. */
export function StudioCompare({ state, ghosts }: { state: CompanyState; ghosts: ReturnType<typeof useGhosts> }): JSX.Element {
  if (state.config.continuation) return <p className="muted">This studio began with its own work, resources and relationships. The fresh-start studios do not share those starting conditions.</p>;
  const series: Series[] | null = ghosts
    ? [
        { ...SERIES_STYLE.you, values: servedByDay(state) },
        { ...SERIES_STYLE.old, values: ghosts.old.served },
        { ...SERIES_STYLE.faster, values: ghosts.faster.served },
        { ...SERIES_STYLE.hand, values: ghosts.hand.served },
        { ...SERIES_STYLE.bright, values: ghosts.bright.served },
      ]
    : null;
  return (
    <section className="end-compare" aria-labelledby="cmp-h" aria-busy={ghosts === null}>
      <h2 id="cmp-h">Same street, four studios beside yours</h2>
      <p className="muted small">
        Old Lantern never changed: bespoke work, no AI. Faster Lantern added one AI desk to the same offer. Handmade Lantern uses no AI: it put Launchlet beside Bespoke, hired Noor and bought the brief library on day 1. Bright Lantern put Launchlet beside Bespoke with an AI desk. The last two answer street news with care and book overtime when a buyer would only fit that way. All take a job only if the forecast says it fits. Same neighbours, same luck.
      </p>
      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">Studio</th>
              <th scope="col">Served</th>
              <th scope="col">Kept</th>
              <th scope="col">Missed</th>
              <th scope="col">Cash</th>
              <th scope="col">Operating result</th>
              <th scope="col">People busy</th>
            </tr>
          </thead>
          <tbody>
            <CompareRow id="you" label="Your studio" s={summarize(state)} you />
            {ghosts && GHOST_IDS.map((id) => <CompareRow key={id} id={id} label={GHOST_LABEL(id)} s={ghosts[id].summary} />)}
          </tbody>
        </table>
      </div>
      <MoneyLine s={summarize(state)} paid={juniorPayoff(state)} start={state.cash - state.journal.reduce((a, e) => a + e.cash, 0)} />
      {series ? <ServedChart series={series} /> : <p className="ghost-wait">Working out the other studios...</p>}
    </section>
  );
}
