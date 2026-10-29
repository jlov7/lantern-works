import { useEffect, useMemo, useState, type JSX, type RefObject } from 'react';
import { scenarioById } from '../../engine/rules';
import { summarize } from '../../engine/selectors';
import type { CompanyState } from '../../engine/types';
import { credits, pct } from '../format';
import { encodeShare } from '../persist';
import { drawPostcard } from './postcard';
import { shareText } from './season';

/** Share text, postcard and self-contained season links. */
export function EndShare({ state, title, line, medalLine, hero }: { state: CompanyState; title: string; line: string; medalLine: string; hero: RefObject<HTMLDivElement | null> }): JSX.Element {
  const base = `${location.origin}${location.pathname}`;
  const startKey = JSON.stringify([state.config, state.rulesVersion]);
  const [prepared, setPrepared] = useState<{ key: string; url: string | null; error?: string } | null>(null);
  useEffect(() => {
    if (!state.config.continuation) return;
    let live = true;
    void encodeShare(state.config, [], `Season ${state.config.continuation.season}`, state.rulesVersion).then(
      (encoded) => { if (live) setPrepared({ key: startKey, url: `${base}#start=${encoded}` }); },
      () => { if (live) setPrepared({ key: startKey, url: null, error: 'The studio challenge could not be prepared in this browser.' }); },
    );
    return () => { live = false; };
  }, [state.config, state.rulesVersion, startKey, base]);
  const challengeUrl = state.config.continuation ? prepared?.key === startKey ? prepared.url : null : `${base}#play=${encodeURIComponent(state.config.scenarioId)}:${encodeURIComponent(state.config.seed)}:${encodeURIComponent(state.rulesVersion)}`;
  const share = useMemo(() => shareText(state, challengeUrl ?? ''), [state, challengeUrl]);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [cardMsg, setCardMsg] = useState<string | null>(null);
  const [postcardBusy, setPostcardBusy] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copyLink(kind: 'replay' | 'challenge') {
    if (kind === 'challenge' && !challengeUrl) return;
    let url: string;
    try {
      url = kind === 'replay' ? `${base}#s=${await encodeShare(state.config, state.commands, title.slice(0, 40), state.rulesVersion)}` : challengeUrl!;
    } catch {
      setShareMsg('This replay could not be made into a link. Copy the challenge link to share the same street instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg(kind === 'replay' ? 'Replay link copied. It rebuilds your season move by move.' : state.config.continuation ? 'Studio challenge copied. It starts with the same cash, work and relationships.' : 'Challenge link copied. Same street, same neighbours, their own choices.');
    } catch {
      setShareMsg(`Copying is blocked here. Select and copy this link: ${url}`);
    }
  }

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(share);
      setCardMsg('Share text copied.');
    } catch {
      setCardMsg('Copying is blocked here. Select the text above and copy it.');
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: 'Lantern Works', text: share });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setCardMsg('Sharing did not work here. Copy the text instead.');
    }
  }

  async function savePostcard() {
    setPostcardBusy(true);
    const sum = summarize(state);
    try {
      const c = await drawPostcard(hero.current?.querySelector<HTMLElement>('.neighbourhood-scene') ?? hero.current?.querySelector('svg') ?? null, {
        street: scenarioById(state.config.scenarioId)?.name ?? state.config.scenarioId,
        seed: state.config.seed,
        title,
        line,
        medal: medalLine,
        stats: [
          ['neighbours served', String(sum.served)],
          ['promises kept', pct(sum.promisesKept)],
          ['cash at close', credits(sum.cash)],
        ],
        date: new Date(),
        rules: state.rulesVersion,
      });
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('no image');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lantern-works-${state.config.scenarioId}-${state.config.seed}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setShareMsg('Postcard saved to your downloads.');
    } catch {
      setShareMsg('The postcard could not be drawn in this browser. The share text and links still work.');
    } finally {
      setPostcardBusy(false);
    }
  }

  return (
    <section className="end-share" aria-labelledby="sh-h">
      <h2 id="sh-h">Share and keep</h2>
      <div className="share-card">
        <pre className="share-text" aria-label="Share text">
          {share}
        </pre>
        <div className="row wrap">
          <button type="button" className="btn" onClick={() => void copyCard()} disabled={!challengeUrl}>
            Copy share text
          </button>
          {canShare && (
            <button type="button" className="btn" onClick={() => void nativeShare()} disabled={!challengeUrl}>
              Share...
            </button>
          )}
        </div>
        {cardMsg && (
          <p className="muted small" role="status">
            {cardMsg}
          </p>
        )}
      </div>
      <div className="row wrap">
        <button type="button" className="btn" onClick={() => void savePostcard()} disabled={postcardBusy}>
          {postcardBusy ? 'Drawing the postcard...' : 'Save postcard'}
        </button>
        <button type="button" className="btn" onClick={() => void copyLink('replay')}>
          Copy replay link
        </button>
        <button type="button" className="btn" onClick={() => void copyLink('challenge')} disabled={!challengeUrl}>
          Copy challenge link
        </button>
      </div>
      {shareMsg && (
        <p className="muted small share-msg" role="status">
          {shareMsg}
        </p>
      )}
      {!challengeUrl && <p className="muted small" role="status">{prepared?.key === startKey && prepared.error ? prepared.error : 'Preparing the studio challenge...'}</p>}
      <p className="muted small">Replay links include your moves and artwork. Studio challenges also include the work, resources and relationships you carried forward. They never include an API key or anything you typed to Claude.</p>
    </section>
  );
}
