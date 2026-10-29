// The street's paper as a printed front page: the season's end, and a midweek edition on the morning the season turns.
import type { JSX } from 'react';
import type { Gazette } from './gazette';

export function GazettePage({ paper, id, className = '' }: { paper: Gazette; id: string; className?: string }): JSX.Element {
  return (
    <section className={`end-gazette ${className}`} aria-labelledby={id}>
      <p className="gz-mast">{paper.masthead}</p>
      <h2 id={id} className="gz-head">
        {paper.headline}
      </h2>
      {paper.lead && <p className="gz-lead">{paper.lead}</p>}
      {paper.second && <p>{paper.second}</p>}
      {paper.letter && <p className="gz-letter">{paper.letter}</p>}
      {paper.rivals && <p>{paper.rivals}</p>}
      {paper.numbers && <p className="gz-numbers">{paper.numbers}</p>}
      {paper.corrections && <p className="gz-small">{paper.corrections}</p>}
      <p className="gz-small">{paper.classified}</p>
    </section>
  );
}
