// Street news for this morning: a choice with stated costs, answered before the shop opens.
import { memo, useEffect, useMemo, useRef, type JSX } from 'react';
import { newsOptions } from '../../engine/sim';
import type { CompanyState, News } from '../../engine/types';
import { orderFit } from './newsFit';
import { newsOrder } from './orderIntake';
import { newsPresentation } from './careerContinuity';

interface Props {
  state: CompanyState;
  news: News;
  disabled: boolean;
  onChoose: (newsId: string, option: number) => void;
}

export const NewsCard = memo(function NewsCard({ state, news, disabled, onChoose }: Props): JSX.Element {
  const { title, text, options } = newsPresentation(state, news);
  // An option that adds an order says whether it would fit, before it is chosen.
  const fitOf = useMemo(() => (news.choice === null ? newsOptions(state, news).map((_, i) => orderFit(state, news, i)) : []), [state, news]);
  const decided = useRef<HTMLParagraphElement>(null);
  const wasOpen = useRef(news.choice === null);

  // After a choice the card folds; keep focus on what replaced the buttons.
  useEffect(() => {
    if (news.choice !== null && wasOpen.current) decided.current?.focus();
    wasOpen.current = news.choice === null;
  }, [news.choice]);

  if (news.choice !== null) {
    const order = newsOrder(state, news, news.choice);
    return (
      <section className="news news-done" aria-label="Street news">
        <p ref={decided} tabIndex={-1} className="small">
          <span className="news-kicker">Street news</span> {title}: {order ? <><strong>{order.name}: {order.status}</strong>. {order.consequence} {order.remaining}</> : <><strong>{options[news.choice]?.label}</strong>. {options[news.choice]?.detail}</>}
        </p>
      </section>
    );
  }
  return (
    <section className="news" aria-labelledby={`news-${news.id}`}>
      <p className="news-kicker">Street news</p>
      <h3 id={`news-${news.id}`} tabIndex={-1}>
        {title}
      </h3>
      <p className="news-text">{text}</p>
      <ul className="news-options">
        {options.map((o, i) => {
          const order = newsOrder(state, news, i);
          return (
            <li key={o.label}>
              <button type="button" className="btn news-option" onClick={() => onChoose(news.id, i)} disabled={disabled} aria-describedby={`news-${news.id}-d${i}`}>
                {order ? 'Add the order to the window' : o.label}
              </button>
              <span id={`news-${news.id}-d${i}`} className="small news-detail">
                {o.detail}
                {fitOf[i] ? ` ${fitOf[i]}` : ''}
                {order?.intakeWarning && <strong> {order.intakeWarning}</strong>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="news-default small">Choose one before you open the shop.</p>
    </section>
  );
});
