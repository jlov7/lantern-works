// Zod schemas for everything that crosses a boundary on load: saves and share links. zod/mini keeps this
// small enough for the first load; model-reply schemas use full zod in the lazily loaded AI chunk.
import { z } from 'zod/mini';
import { RULES } from '../engine/rules';
import { PROJECT_IDS, PROJECT_APPROACHES } from '../engine/projects';
import { continuationSchema } from '../engine/continuation';
import { creativeIntentionSchema, designSchema } from '../engine/design';
import type { Command } from '../engine/types';

const L = RULES.limits;
const intIn = (lo: number, hi: number) => z.int().check(z.gte(lo), z.lte(hi));
const str = (min: number, max: number) => z.string().check(z.minLength(min), z.maxLength(max));

export const offerSchema = z.strictObject({
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(L.nameLength)),
  launches: intIn(L.launches[0], L.launches[1]),
  spacingDays: intIn(L.spacingDays[0], L.spacingDays[1]),
  turnaroundDays: intIn(L.turnaroundDays[0], L.turnaroundDays[1]),
  scope: z.enum(['simple', 'any']),
  style: z.enum(['custom', 'templated']),
  price: intIn(L.price[0], L.price[1]),
});

const id = str(1, 40);

export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('featurePieces'), pieceIds: z.array(str(1, 80)).check(z.maxLength(3)) }),
  z.strictObject({ type: z.literal('preparePattern'), sourceId: str(1, 80), replacePatternId: z.optional(str(1, 80)) }),
  z.strictObject({ type: z.literal('teachPattern'), patternId: str(1, 80), resourceId: id }),
  z.strictObject({ type: z.literal('accept'), requestId: id, counter: z.optional(z.literal(true)), maker: z.optional(id), design: z.optional(designSchema), intention: z.optional(creativeIntentionSchema) }),
  z.strictObject({ type: z.literal('acceptProject'), projectId: z.enum(PROJECT_IDS), approach: z.enum(PROJECT_APPROACHES), maker: z.optional(id), design: z.optional(designSchema), sourceId: z.optional(str(1, 80)) }),
  z.strictObject({ type: z.literal('reserve'), requestId: id, startsInDays: z.union([z.literal(1), z.literal(2)]), design: z.optional(designSchema), intention: z.optional(creativeIntentionSchema) }),
  z.strictObject({ type: z.literal('mentor'), resourceId: id, specialization: z.enum(['proofing', 'templates']) }),
  z.strictObject({ type: z.literal('decline'), requestId: id }),
  z.strictObject({ type: z.literal('setMenu'), offers: z.array(offerSchema).check(z.minLength(1), z.maxLength(RULES.maxMenu)) }),
  z.strictObject({ type: z.literal('setStaff'), staffing: z.strictObject({ aiTier: z.enum(['none', 'solo', 'duo']), routing: z.enum(['human', 'simple', 'all']) }) }),
  z.strictObject({ type: z.literal('choose'), newsId: id, option: intIn(0, 5) }),
  z.strictObject({ type: z.literal('hire') }),
  z.strictObject({ type: z.literal('letGo'), resourceId: id }),
  z.strictObject({ type: z.literal('temp') }),
  z.strictObject({ type: z.literal('overtime') }),
  z.strictObject({ type: z.literal('pace'), pace: z.enum(['steady', 'push', 'careful']) }),
  z.strictObject({ type: z.literal('buy'), item: z.enum(['library', 'checklist', 'styleGuide']) }),
  z.strictObject({ type: z.literal('flyers'), segment: z.enum(['small', 'moment', 'careful', 'rush']) }),
  z.strictObject({ type: z.literal('runDay'), calls: z.optional(z.literal(true)) }),
  z.strictObject({ type: z.literal('answer'), option: z.enum(['late', 'cut', 'ring', 'ride']) }),
]) satisfies z.ZodMiniType<Command>;

export const configSchema = z.strictObject({ scenarioId: str(1, 40), seed: str(1, 40), continuation: z.optional(continuationSchema) });

/** Bound external share imports. Local seasons can contain any number of legal morning edits. */
export const MAX_COMMANDS = 600;

export const savedRunSchema = z.strictObject({
  v: z.literal(1),
  rules: z.string(),
  id: str(1, 60),
  label: str(0, 60),
  savedAt: str(0, 40),
  config: configSchema,
  commands: z.array(commandSchema),
  parentId: z.optional(str(0, 60)),
  branchDay: z.optional(intIn(0, RULES.days)),
});

export type SavedRun = z.infer<typeof savedRunSchema>;

export const shareSchema = z.strictObject({
  v: z.literal(1),
  rules: z.string(),
  config: configSchema,
  commands: z.array(commandSchema).check(z.maxLength(MAX_COMMANDS)),
  name: z.optional(str(0, 40)),
});

export type SharePayload = z.infer<typeof shareSchema>;
