import { useId, useState } from 'react';
import type { CompanyState, ProjectId } from '../../engine/types';
import { commissionConversation } from '../game/commissionConversation';
import { CustomerPortrait } from '../atelier/AtelierWindow';
import { useReducedMotion } from '../useReducedMotion';
import { DesignedArtwork } from './DesignedArtwork';

export function CommissionConversation({ state, projectId }: { state: CompanyState; projectId: ProjectId }) {
  const conversation = commissionConversation(state, projectId);
  const [question, setQuestion] = useState<number | null>(null);
  const id = useId();
  const reduced = useReducedMotion();
  return <section className="commission-conversation" aria-labelledby={id} data-reduced-motion={reduced || undefined}>
    <div className="commission-conversation__portrait" aria-hidden="true"><CustomerPortrait castId={conversation.castId} /></div>
    <div className="commission-conversation__words"><h4 id={id}>At the table with {conversation.name}</h4>
      <p className="commission-conversation__answer" key={question ?? 'opening'} aria-live="polite">“{question === null ? conversation.opening : conversation.exchanges[question]!.answer}”</p>
      {conversation.memory && <details className="commission-conversation__memory"><summary>The piece that started this</summary><DesignedArtwork piece={conversation.memory.design} copy={conversation.memory.copy} label={conversation.memory.title} /><p>{conversation.memory.title} · Season {conversation.memory.sourceSeason}</p></details>}
      <div className="commission-conversation__questions" role="group" aria-label={`Ask ${conversation.name} about the brief`}>{conversation.exchanges.map((exchange, index) => <button type="button" key={exchange.question} className="btn btn-small" aria-pressed={question === index} onClick={() => setQuestion(index)}>{exchange.question}</button>)}</div>
    </div>
  </section>;
}
