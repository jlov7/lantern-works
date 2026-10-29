import { useMemo, useState } from 'react';
import { isRegular } from '../../engine/sim';
import { SEGMENTS } from '../../engine/rules';
import type { CompanyState, SegmentId } from '../../engine/types';
import { Modal } from '../Dialogs';
import { castName } from '../format';
import { returnAfterReply, reviewReplies, routineReplies } from './morningReplies';

export function ReplyReview({ state, disabled, onClose, onReply }: { state: CompanyState; disabled: boolean; onClose: () => void; onReply: (ids: string[]) => void }) {
  const requests = routineReplies(state);
  const [chosen, setChosen] = useState(() => requests.map(request => request.id));
  const review = useMemo(() => reviewReplies(state, chosen), [state, chosen]);
  const exceptions = state.requests.filter(request => request.day === state.day && request.status === 'waiting' && !requests.some(ordinary => ordinary.id === request.id));
  return <Modal title="Reply to remaining requests" onClose={onClose}>
    <div className="morning-replies">
      <p>Tell these neighbours you cannot take this request. Untick anyone you still want to consider.</p>
      <p className="reply-cost" role="status">{review.losses.length ? `Reputation cost: ${review.losses.reduce((total, loss) => total + loss.points, 0)} in total (${review.losses.map(loss => `${SEGMENTS[loss.segment as SegmentId].label}: ${loss.points}`).join('; ')}).` : 'No reputation cost for these replies.'}</p>
      <fieldset disabled={disabled}><legend>Requests to decline</legend>
        {requests.map(request => <label key={request.id}><input type="checkbox" checked={chosen.includes(request.id)} onChange={event => setChosen(ids => event.target.checked ? [...ids, request.id] : ids.filter(id => id !== request.id))} /><span><strong>{castName(request.castId)}</strong>{isRegular(state, request.castId) ? ' · returning customer' : ''}</span></label>)}
      </fieldset>
      {review.keepsRelationships && <p>No promise is broken. {returnAfterReply(state, '')} Ignoring a regular who would buy can lose the relationship.</p>}
      {review.lost.length > 0 && <p className="risk risk-bad">This older season loses these regulars when refused: {review.lost.map(castName).join(', ')}.</p>}
      {exceptions.length > 0 && <p className="small">Answer separately: {exceptions.map(request => `${castName(request.castId)} (${request.source === 'amends' ? 'repair offer' : 'commission'})`).join(', ')}.</p>}
      <div className="ticket-actions"><button type="button" className="btn btn-primary" disabled={disabled || !review.requests.length} onClick={() => { onClose(); onReply(review.requests.map(request => request.id)); }}>Decline selected requests ({review.requests.length})</button><button type="button" className="btn btn-quiet" onClick={onClose}>Keep considering</button></div>
      <p className="small">Undo restores one reply at a time until you open the shop.</p>
    </div>
  </Modal>;
}
