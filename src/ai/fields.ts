// Offer fields and turnaround words shared by the prompts, the compilers and the evals. No imports, so the
// app can load the prompts lazily without pulling them into the main chunk.

/** Offer fields the player can state or leave to a default. */
export const OFFER_FIELDS = ['name', 'launches', 'spacingDays', 'turnaroundDays', 'scope', 'style', 'price'] as const;
export type OfferField = (typeof OFFER_FIELDS)[number];

/** Turnaround as words the model picks from, mapped to the engine's integer (1 = same day, 2 = next day, ...). */
export const TURNAROUND = { same_day: 1, next_day: 2, within_3_days: 3, within_4_days: 4, within_5_days: 5 } as const;
export type TurnaroundWord = keyof typeof TURNAROUND;
