import { approveProof, type ApprovedProof, type CreativeIntention, type DesignBrief, type DesignSpec, type MotifId, type PaletteId } from './design';
import { CAST_BY_ID } from './rules';
import type { CareerStage, CompanyState, Contract, CreativePromise, OfferSpec, ProjectApproach, Request } from './types';
import { hasCreativePromiseRules } from './versions';
import { careerStage } from './career';

export interface OrdinaryIntention { id: CreativeIntention; label: string; response: string; approach: ProjectApproach }
const INTENTIONS: Record<string, readonly OrdinaryIntention[]> = {
  clem: [
    { id: 'clem-room', label: 'Give people a sense of the room', response: 'You wanted people to feel what this room is like. I have a photograph of how it began.', approach: 'first-night' },
    { id: 'clem-band', label: 'Put the musicians first', response: 'You wanted the musicians to lead. There is another band I would like you to meet.', approach: 'new-band' },
  ],
  mara: [
    { id: 'mara-regulars', label: 'Give the regulars something to recognise', response: 'You wanted the regulars to recognise us. I have been thinking about a set of cards.', approach: 'weekly-rhythm' },
    { id: 'mara-newcomers', label: 'Help someone new find the bakery', response: 'You wanted new people to find us. The market might be our next place.', approach: 'market-debut' },
  ],
  hugo: [
    { id: 'hugo-craft', label: 'Let the work speak quietly', response: 'You wanted the work to speak for itself. A quiet keepsake might be enough.', approach: 'quiet-sendoff' },
    { id: 'hugo-next-hands', label: 'Make room for the next pair of hands', response: 'You wanted to make room for someone new. Ivo will need a name above the bench.', approach: 'open-bench' },
  ],
  ivo: [
    { id: 'ivo-own-name', label: 'Give the workshop its own name', response: 'You wanted people to know whose workshop this is. I am ready for a sign of my own.', approach: 'quiet-sendoff' },
    { id: 'ivo-first-repairs', label: 'Invite someone to learn a first repair', response: 'You wanted to invite people in. I could teach a small group here.', approach: 'open-bench' },
  ],
};
const NONE: readonly OrdinaryIntention[] = [];
export function ordinaryIntentions(castId: string, briefId?: string): readonly OrdinaryIntention[] {
  const choices = Object.hasOwn(INTENTIONS, castId) ? INTENTIONS[castId]! : NONE;
  if (!briefId) return choices;
  if (!ordinaryBriefIdentityValid(castId, briefId)) return NONE;
  const responses: Record<string, [string, string]> = {
    clem: ['You kept the room in view. There is room for that in the archive.', 'You put the musicians first. The next programme needs that clarity.'],
    mara: ['The regulars recognise us in this print. The table should feel familiar, too.', 'This helps someone find us. The next market invitation needs that care.'],
    hugo: ['You let the work speak quietly. I would like to keep that record.', 'You made room for someone learning the work. That is something worth passing on.'],
    ivo: ['The workshop has a clear voice in this print. The repair sheets need one, too.', 'You invited people to learn. There are more repairs we can share.'],
  };
  return choices.map((choice, i) => ({ ...choice, ...(choice.id === 'ivo-first-repairs' ? { label: 'Invite someone to learn a repair' } : choice.id === 'ivo-own-name' ? { label: 'Give the workshop a clear voice' } : {}), response: responses[castId]![i]! }));
}

const CONTENT: Record<string, { titles: string[]; details: string[]; motifs: MotifId[]; palette: PaletteId }> = {
  clem: { titles: ['One night. One trio.', 'Ten years of Clem', 'The late jam'], details: ['Out of town. In the room. At Clem’s.', 'A birthday worthy of the first night.', 'A famous guest. Stay for the last set.'], motifs: ['trumpet', 'crescent', 'star', 'door'], palette: 'midnight' },
  mara: { titles: ['Friday bake sale', 'Saturday sourdough', 'Pies at the market'], details: ['Moonrise ovens. Something to take home.', 'A slow rise. A fresh Saturday.', 'Find Moonrise by the market stalls.'], motifs: ['loaf', 'wheat', 'crescent', 'leaf'], palette: 'linen' },
  hugo: { titles: ['Forty years, carefully', 'The art of restoration', 'The next pair of hands'], details: ['Hugo Watch Repair. Time well spent.', 'A workshop with Hugo.', 'An apprentice takes a bench.'], motifs: ['watch', 'bench', 'hands', 'star'], palette: 'river' },
  ivo: { titles: ['A name above the door', 'A first repair'], details: ['Ivo Watch Workshop. The old bench has a new hand.', 'Learn the first repair with Ivo.'], motifs: ['watch', 'bench', 'hands', 'door'], palette: 'river' },
};
const ORDINARY_SOURCES: readonly Request['source'][] = ['walkin', 'word', 'flyer', 'premium', 'booking'];
const RECURRING: Record<string, Record<CareerStage, [string, string, string, string]>> = {
  clem: {
    opening: ['The late set', 'One trio, after the doors open.', 'The room on Friday', 'Live music at Clem Jazz Bar.'],
    practice: ['Thursday in residence', 'The residency returns to Clem Jazz Bar.', 'A photograph from the archive', 'A familiar room, seen from another night.'],
    legacy: ['The shared archive', 'Bring a memory of the room to Clem Jazz Bar.', 'Musicians at the archive table', 'An evening of music and photographs.'],
    open: ['The archive rotation', 'Another selection from the Clem archive.', 'This week in the room', 'Live music, returning faces, an open door.'],
  },
  mara: {
    opening: ['Friday bake sale', 'Moonrise ovens. Something to take home.', 'Pies at the market', 'Find Moonrise by the market stalls.'],
    practice: ['Bread at the counter', 'Today’s bread and tomorrow’s orders at Moonrise.', 'Moonrise at the market', 'Saturday collection at the Moonrise stall.'],
    legacy: ['A place at the shared table', 'Bring a neighbour to the Moonrise table.', 'Bread to share', 'Moonrise Bakery. Something for the whole table.'],
    open: ['The seasonal table', 'This season’s loaves at Moonrise Bakery.', 'Market collection', 'The Moonrise stall returns on Saturday.'],
  },
  hugo: {
    opening: ['The art of restoration', 'Hugo Watch Repair. Time well spent.', 'Notes from the bench', 'Careful work, recorded by Hugo.'],
    practice: ['The repair notebook', 'Hugo’s notes on a patient craft.', 'A watch worth keeping', 'A repaired watch, with its history intact.'],
    legacy: ['Work from the old bench', 'Hugo’s repair notes, shared with the street.', 'The tools we keep', 'A record of tools and the work they have done.'],
    open: ['From the repair notebook', 'Another page from Hugo’s collected notes.', 'A watch and its story', 'The street remembers careful work.'],
  },
  ivo: {
    opening: ['Work at the bench', 'Watch repairs with Ivo.', 'A repair to learn', 'Bring a watch. Learn where to begin.'],
    practice: ['Ivo Watch Workshop', 'Repairs at the old bench, with Ivo.', 'Saturday repairs', 'Learn a repair with Ivo at the workshop.'],
    legacy: ['Passing on repairs', 'A repair sheet to use and keep.', 'The shared repair class', 'Ivo Watch Workshop. Learn together at the bench.'],
    open: ['The returning repair class', 'Another Saturday at Ivo’s bench.', 'The repair manual edition', 'A new selection of practical repair notes.'],
  },
};
function recurringDefinition(briefId: string) {
  for (const [castId, stages] of Object.entries(RECURRING)) for (const [stage, pool] of Object.entries(stages)) for (let i = 0; i < 2; i++) {
    if (briefId === `${castId}-${stage}-${i + 1}`) return { castId, title: pool[i * 2]!, detail: pool[i * 2 + 1]! };
  }
  return null;
}
export function ordinaryBriefIdentityValid(castId: string, briefId: string): boolean { return recurringDefinition(briefId)?.castId === castId; }
export function ordinaryRequestLine(request: Request): string | null { return request.briefId ? recurringDefinition(request.briefId)?.detail ?? null : null; }
export function stampOrdinaryBrief(s: CompanyState, request: Request): void {
  const stage = careerStage(s);
  if (!stage || !RECURRING[request.castId] || !ORDINARY_SOURCES.includes(request.source)) return;
  const delivered = (s.config.continuation?.relationships.find(r => r.castId === request.castId)?.ordinaryDelivered ?? 0) + s.jobs.filter(j => j.castId === request.castId && j.status === 'delivered').length;
  const changed = s.config.continuation?.version === 3 && s.config.continuation.career.stories.some(r => r.nodeId.startsWith(`${request.castId}-`) && ['failed', 'partial', 'compromised'].includes(r.outcome)) ? 1 : 0;
  request.briefId = `${request.castId}-${stage}-${(request.lineIndex + delivered + changed) % 2 + 1}`;
}

/** A quick proof changes the composition of one ordinary print, never its production terms. */
export function ordinaryBrief(request: Request, offer: OfferSpec): DesignBrief | null {
  if (request.project || !ORDINARY_SOURCES.includes(request.source) || offer.launches !== 1 || !Object.hasOwn(CONTENT, request.castId)) return null;
  const content = CONTENT[request.castId]!;
  const cast = CAST_BY_ID[request.castId]!;
  const index = content.titles[request.lineIndex] ? request.lineIndex : 0;
  const recurring = request.briefId ? recurringDefinition(request.briefId) : null;
  if (request.briefId && recurring?.castId !== request.castId) return null;
  const title = recurring?.title ?? content.titles[index]!;
  const copy = [
    { id: 'title', text: title, role: 'title' as const },
    { id: 'detail', text: recurring?.detail ?? content.details[index]!, role: 'detail' as const },
    { id: 'customer', text: cast.business, role: 'footer' as const },
  ];
  return {
    version: 1, title, intention: recurring?.detail ?? cast.lines[request.lineIndex] ?? cast.lines[0]!,
    pieces: [{ title, kind: 'poster', copy, motifs: [...content.motifs] }],
    requirements: [
      { id: 'poster', explanation: 'Keep the promised poster.', piece: 0, rule: { kind: 'artifact', artifact: 'poster' } },
      ...copy.map(c => ({ id: c.id, explanation: `Include “${c.text}”.`, piece: 0, rule: { kind: 'copy' as const, token: c.id } })),
    ],
    defaultDesign: { version: 1, pieces: [{ kind: 'poster', layout: 'gallery', palette: content.palette, typeface: 'serif', copy: copy.map(c => c.id), motifs: [{ id: content.motifs[0]!, x: 50, y: 50, scale: 3, rotation: 0 }], treatment: 'standard' }] },
  };
}

export function approveOrdinaryProof(request: Request, offer: OfferSpec, design?: DesignSpec, intention?: CreativeIntention): { proof?: ApprovedProof; errors: string[] } {
  let proof: ApprovedProof | undefined;
  if (design !== undefined) {
    const brief = ordinaryBrief(request, offer);
    if (!brief) return { errors: ['Quick proofs are for single-launch ordinary orders from Clem, Mara, Hugo or Ivo.'] };
    const approved = approveProof(brief, design);
    if (!approved.proof) return approved;
    if (approved.proof.design.pieces.some(piece => piece.treatment !== 'standard')) return { errors: ['An ordinary proof uses the included two-ink treatment.'] };
    proof = approved.proof;
  }
  if (intention !== undefined && (!proof || !ordinaryIntentions(request.castId, request.briefId).some(choice => choice.id === intention))) return { errors: ['Choose an intention for this customer with an approved ordinary proof.'] };
  return { proof, errors: [] };
}

export function contractProof(contract: Contract): ApprovedProof | undefined { return contract.proof ?? contract.project?.proof; }

/** Recognition is earned by the first whole ordinary authored order delivered in this season. */
export function creativePromise(state: CompanyState, castId: string, minute = state.minute): CreativePromise | null {
  if (!hasCreativePromiseRules(state.rulesVersion)) return null;
  const candidates = state.contracts.flatMap(contract => {
    const proof = contract.proof;
    if (contract.castId !== castId || contract.project || !proof || contract.offer.launches !== 1 || contract.jobIds.length !== 1) return [];
    const request = state.requests.find(r => r.id === contract.requestId);
    const job = state.jobs.find(j => j.id === contract.jobIds[0]);
    if (!request || !ordinaryBrief(request, contract.offer) || !job || job.status !== 'delivered' || job.deliveredAt === null || job.deliveredAt > minute) return [];
    return [{ contract, proof, job, deliveredAt: job.deliveredAt }];
  }).sort((a, b) => a.deliveredAt - b.deliveredAt || a.contract.seq - b.contract.seq);
  const first = candidates[0];
  if (!first) return null;
  const { contract, proof, job, deliveredAt } = first;
  return {
    sourceSeason: state.config.continuation?.season ?? 1, contractId: contract.id, requestId: contract.requestId, jobId: job.id, castId, deliveredAt,
    ...(contract.intention ? { intention: contract.intention } : {}),
    ...(contract.briefId ? { briefId: contract.briefId } : {}),
    design: structuredClone(proof.design.pieces[0]!), title: proof.pieces[0]!.title, copy: structuredClone(proof.pieces[0]!.copy),
  };
}
