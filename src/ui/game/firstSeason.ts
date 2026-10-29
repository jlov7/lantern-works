// A player's first season brings the studio's systems in over the first mornings, not all at once (GD-18): the
// newcomer persona skipped the full planning area as a wall of text, and each new system gives the early middle
// days something new. Seasons after the first show everything from Day 1. Days are 0-based, like the engine.
// Upgrades wait until Day 6: Day 4 already brings the AI desk and, most seasons, the first big street choice.
// The first morning is only the window, its buyers and the Open button; the studio's panels come on Day 2.
export const OPENS = { studio: 1, street: 1, pace: 1, flyers: 2, ai: 3, upgrades: 5 } as const;

export type Opens = typeof OPENS | null;

/** What opens this morning, said once, on the morning it opens. */
export function newToday(opens: Opens, day: number): string | null {
  if (!opens) return null;
  if (day === opens.street) return "the studio below, for more hours (hire Noor, a temp, overtime), and the street panel with your side goals. And a pace for the day, at the window: push to fit more in, or work carefully for fewer redos.";
  if (day === opens.flyers) return 'flyers, in the studio, to bring more of one kind of neighbour.';
  if (day === opens.ai) return 'the AI desk. An AI desk makes work until 5pm; people still brief and finish.';
  if (day === opens.upgrades) return 'upgrades, in the studio: bought once, they make some work quicker or safer.';
  return null;
}
