export const fillFraction = (value: number, max: number) => max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
