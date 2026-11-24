type EditionOutcome = { deliveredAt: number; cash: number; turnedAway: readonly string[] };

export function compareOutcomes(a: EditionOutcome, b: EditionOutcome) {
  const aLeavers = new Set(a.turnedAway);
  const bLeavers = new Set(b.turnedAway);
  return {
    minutesDiff: Math.abs(a.deliveredAt - b.deliveredAt),
    cashDiff: Math.abs(a.cash - b.cash),
    onlyA: [...aLeavers].filter(name => !bLeavers.has(name)),
    onlyB: [...bLeavers].filter(name => !aLeavers.has(name)),
    both: [...aLeavers].filter(name => bLeavers.has(name)),
  };
}
