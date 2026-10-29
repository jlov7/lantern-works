import { useMemo, useState } from 'react';
import { patternSources, preparePatternBlocked, teachPatternBlocked, MAX_PATTERNS, PATTERN_COST, PATTERN_MINUTES, PATTERN_REDUCTION } from '../../engine/patterns';
import { RULES } from '../../engine/rules';
import type { Command, CompanyState } from '../../engine/types';
import { credits, dayLabel } from '../format';
import { deliveredPatternUses } from '../game/creativeRecognition';
import { DesignedArtwork } from './DesignedArtwork';
import '../../styles/continuing-studio.css';

export function PatternShelf({ state, disabled, apply }: { state: CompanyState; disabled: boolean; apply: (command: Command) => void }) {
  const sources = useMemo(() => patternSources(state), [state]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [replaceId, setReplaceId] = useState('');
  const selected = sources.find(p => p.id === sourceId) ?? sources.at(-1);
  const patterns = state.patterns ?? [];
  const blocked = selected ? preparePatternBlocked(state, selected.id, replaceId || undefined) : null;
  const noor = state.resources.find(r => r.role === 'junior' && r.name === RULES.staff.junior.name && r.fromDay <= state.day && (r.toDay === null || r.toDay >= state.day));
  return <section className="pattern-shelf" aria-labelledby="patterns-h">
    <header><p className="portfolio-eyebrow">Things the studio learns</p><h2 id="patterns-h" tabIndex={-1}>The pattern shelf</h2></header>
    <p>Keep a composition you want to use again. Preparing it costs {credits(PATTERN_COST)} and {PATTERN_MINUTES} minutes of Tomas’s work.</p>
    <p className="small">A ready pattern saves {PATTERN_REDUCTION} briefing minutes when the kind of piece, composition, palette, lettering and illustration positions match. The words can change. Materials and finishing take their usual work.</p>
    {!selected ? <p>A delivered print can become a pattern. Pieces kept from earlier seasons appear here too.</p> : <div className="pattern-source">
      <DesignedArtwork piece={selected.design} copy={selected.copy} label={selected.title} />
      <div><label>Start from a delivered piece<select value={selected.id} onChange={event => setSourceId(event.target.value)}>{sources.map(source => <option key={source.id} value={source.id}>{source.title} · Season {source.sourceSeason}</option>)}</select></label>
        {patterns.length >= MAX_PATTERNS && <label>Replace a ready pattern<select value={replaceId} onChange={event => setReplaceId(event.target.value)}><option value="">Choose which pattern to replace</option>{patterns.filter(p => p.status === 'ready').map(pattern => <option key={pattern.id} value={pattern.id}>{sources.find(s => s.id === pattern.sourceId)?.title ?? pattern.sourceId}</option>)}</select></label>}
        <button type="button" className="btn" disabled={disabled || !!blocked} onClick={() => apply({ type: 'preparePattern', sourceId: selected.id, ...(replaceId ? { replacePatternId: replaceId } : {}) })}>Prepare this pattern · {credits(PATTERN_COST)}</button>
        {blocked && <p className="small">{blocked}</p>}
      </div>
    </div>}
    {patterns.length > 0 && <ul className="pattern-records">{patterns.map(pattern => {
      const source = sources.find(s => s.id === pattern.sourceId);
      const uses = deliveredPatternUses(state, pattern.id);
      const lesson = noor ? state.patternTeaching?.find(t => t.patternId === pattern.id && t.resourceId === noor.id) : undefined;
      const taught = !!noor?.inheritedPatterns?.includes(pattern.id) || (lesson?.completedAt != null && lesson.day < state.day);
      const why = noor ? teachPatternBlocked(state, pattern.id, noor.id) : 'Noor needs a place at the studio before she can learn this pattern.';
      return <li key={pattern.id}><div><h3>{source?.title ?? 'A studio pattern'}</h3><p>{pattern.status === 'ready' ? 'Ready for Ada and Tomas.' : `${pattern.remaining} preparation minutes left with Tomas. The pattern helps only after it is ready.`}</p>{uses > 0 && <p>Used on {uses} delivered {uses === 1 ? 'print' : 'prints'} this season.</p>}</div>
        {taught ? <p>Noor knows this pattern too.</p> : lesson?.completedAt != null ? <p>Noor finished the lesson. She can use it from {dayLabel(lesson.day + 1)}.</p> : lesson ? <p>Tomas and Noor have a lesson booked for {dayLabel(lesson.day)}.</p> : <div><button type="button" className="btn" disabled={disabled || !!why} onClick={() => noor && apply({ type: 'teachPattern', patternId: pattern.id, resourceId: noor.id })}>Teach this pattern to Noor</button><p className="small">{why ?? `${PATTERN_MINUTES} minutes together with Tomas. Noor can use it from the following morning.`}</p></div>}
      </li>;
    })}</ul>}
  </section>;
}
