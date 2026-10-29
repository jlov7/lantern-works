import { useState, type JSX } from 'react';
import { debriefOffline, digest, pickTryNext, type Debrief } from '../../ai/debrief';
import { medalFor, medalParFor, summarize } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';
import { aiAvailable, aiLabel, debriefClaude } from '../advisor';
import { KeyDialog } from '../Dialogs';

/** The offline debrief, with an optional live rewrite by Claude when a key or the dev bridge is connected. */
/** Suggestions about hours are tried from the morning before the first big loss of buyers (a hire starts the next day). */
const HOURS = new Set(['hire', 'overtime', 'templated', 'ai-desk', 'fewer-promises']);

/** The next medal up and how many more served it needed, when that is within reach of a second try. */
function stretch(state: CompanyState): string | null {
  const par = medalParFor(state);
  if (!par) return null;
  const { medal } = medalFor(state);
  const next = medal === null ? 'bronze' : medal === 'bronze' ? 'silver' : medal === 'silver' ? 'gold' : null;
  const gap = next ? par[next] - summarize(state).served : 0;
  return next && gap > 0 && gap <= 15 ? `${next.charAt(0).toUpperCase()}${next.slice(1)} was ${gap} served away.` : null;
}

export function EndDebrief({ state, readOnly, onBranch }: { state: CompanyState; readOnly: boolean; onBranch?: (day: number) => void }): JSX.Element {
  // The suggestion as a challenge: a branch from the morning where it would have mattered.
  const [challenge] = useState(() => {
    const id = pickTryNext(state).id;
    const first = Math.min(...digest(state).notFitDays.map((x) => x.day - 1));
    return { day: HOURS.has(id) && Number.isFinite(first) ? Math.max(0, first - 1) : 0, gap: stretch(state) };
  });
  const [debrief, setDebrief] = useState<{ d: Debrief; source: string }>(() => ({ d: debriefOffline(state), source: 'Written from your numbers by the game (no AI).' }));
  const [debriefErr, setDebriefErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);

  async function askClaude() {
    setBusy(true);
    setDebriefErr(null);
    const r = await debriefClaude(state);
    setBusy(false);
    if (r.ok) setDebrief({ d: r.value, source: `Written live by ${aiLabel()} from a digest of this season's numbers.` });
    else setDebriefErr(r.error);
  }

  return (
    <section className="end-debrief" aria-labelledby="deb-h">
      <h2 id="deb-h">Debrief</h2>
      <article>
        <h3>{debrief.d.headline}</h3>
        {debrief.d.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="try-next">
          {challenge.gap && <strong>{challenge.gap} </strong>}Try next: {debrief.d.tryNext}
        </p>
        {onBranch && (
          <button type="button" className="btn btn-small" onClick={() => onBranch(challenge.day)}>
            Try it: play again from Day {challenge.day + 1}
          </button>
        )}
        <p className="muted small">{debrief.source}</p>
      </article>
      {debriefErr && (
        <div className="banner banner-bad banner-action" role="alert">
          <p>{debriefErr}</p>
          <div className="row wrap">
            <button type="button" className="btn btn-small" onClick={() => void askClaude()} disabled={busy}>
              Try again
            </button>
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setDebriefErr(null)}>
              Keep the offline debrief
            </button>
          </div>
        </div>
      )}
      <button type="button" className="btn" onClick={() => (aiAvailable() ? void askClaude() : setKeyOpen(true))} disabled={busy || readOnly} aria-describedby={readOnly ? 'deb-ro' : undefined}>
        {busy ? 'Claude is reading the season...' : 'Ask Claude for a debrief'}
      </button>
      {readOnly ? (
        <p id="deb-ro" className="muted small">
          Off for someone else's season, so nobody spends their own AI calls on a replay. Play the street to get a debrief of yours.
        </p>
      ) : (
        aiAvailable() && <p className="muted small">AI requests go to {aiLabel()}.</p>
      )}
      {keyOpen && <KeyDialog onClose={() => setKeyOpen(false)} />}
    </section>
  );
}
