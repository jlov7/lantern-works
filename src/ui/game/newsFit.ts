// A news option that puts an order in the queue: whether that order would fit today's hours, worked out by making the
// choice on a copy, so "Hear her out" says what saying yes would take before it is said.
import { fits, fitsWithRedo, forecast } from '../../engine/selectors';
import { applyCommand, newsOptions } from '../../engine/sim';
import type { CompanyState, News } from '../../engine/types';

export function orderFit(s: CompanyState, news: News, option: number): string | null {
  if (!newsOptions(s, news)[option]?.effects.some((e) => e.k === 'request')) return null;
  const res = applyCommand(s, { type: 'choose', newsId: news.id, option });
  if (res.error) return null;
  const t = res.state;
  const r = t.requests.find((x) => x.status === 'waiting' && !s.requests.some((y) => y.id === x.id));
  if (!r) return null;
  const f = forecast(t, r.id);
  if (fits(f)) return fitsWithRedo(t, r.id) ? 'As things stand, it fits.' : 'As things stand it fits, with no room for a redo.';
  if (f.newAfterSeason.length && !f.newAtRisk.length) return 'Part of it would fall after the season and be refunded.';
  if (f.existingAfterSeason.length && !f.newAtRisk.length) {
    const baseline = forecast(t);
    return f.existingAfterSeason.some((id) => !baseline.existingAfterSeason.includes(id))
      ? 'Taking it would leave an existing launch unfinished at closing, with a refund.'
      : 'An existing launch would already be refunded at closing.';
  }
  if (!f.newAtRisk.length) {
    const baseline = forecast(t);
    return f.atRisk.some((id) => !baseline.atRisk.includes(id))
      ? 'It fits, but would make another launch late.'
      : 'This order would be on time. Existing work would be late without it.';
  }
  return 'As things stand it would be late: it needs more hours.';
}
