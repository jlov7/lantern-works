/** Native reductions align with the brief's pieces, including zero for an unmatched piece. */
export function patternBriefingLine(reductions: readonly number[], titles: readonly string[]): string {
  if (reductions.every(minutes => minutes === 0)) return 'No briefing time saved. Matching pieces are already at the briefing minimum.';
  if (reductions.length === 1) return `Saves ${reductions[0]} briefing ${reductions[0] === 1 ? 'minute' : 'minutes'}.`;
  return `${reductions.map((minutes, index) => `${titles[index]}: ${minutes ? `${minutes} min saved` : 'no saving'}`).join('; ')}.`;
}
