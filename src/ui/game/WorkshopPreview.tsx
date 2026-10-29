// Who on the street would buy the draft, and what the rest would want instead.
import { type JSX } from 'react';
import { objection, valueOffer } from '../../engine/demand';
import { SEGMENTS } from '../../engine/rules';
import type { OfferSpec } from '../../engine/types';
import { credits } from '../format';
import { wants } from './workshopMath';

export function SegmentList({ draft, stale }: { draft: OfferSpec; stale: boolean }): JSX.Element {
  return (
    <ul className={`seg-list${stale ? ' is-stale' : ''}`}>
      {Object.values(SEGMENTS).map((sg) => {
        const simple = valueOffer(sg.id, 'simple', 100, draft);
        const careful = sg.nuancedBp > 0 ? valueOffer(sg.id, 'nuanced', 100, draft) : null;
        const best = simple.blocker === null ? simple : careful && careful.blocker === null ? careful : simple;
        return (
          <li key={sg.id} className={best.blocker === null ? 'yes' : 'no'}>
            <span className="seg-name">{sg.label}</span>
            {best.blocker === null ? (
              <span>Buys. A typical one would pay up to about {credits(best.wtp)}.</span>
            ) : (
              <span>
                &ldquo;{objection(best.blocker, sg.id)}&rdquo; <span className="wants">{wants(sg, draft)}</span>
              </span>
            )}
            {careful && careful.blocker !== simple.blocker && <span className="muted small"> Tricky briefs: {careful.blocker === null ? 'buy' : objection(careful.blocker, sg.id).toLowerCase()}</span>}
          </li>
        );
      })}
    </ul>
  );
}
