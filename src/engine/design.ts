// The proof is the work promised: composition, customer copy and production treatment travel together.
import { z } from 'zod/mini';
import type { CareerStage, ProjectApproach, ProjectId } from './types';

export const ARTIFACT_KINDS = ['photograph', 'poster', 'card', 'banner', 'portrait', 'sign', 'invitation', 'programme', 'map', 'catalogue'] as const;
export const LAYOUT_IDS = ['gallery', 'headline', 'split', 'stack'] as const;
export const PALETTE_IDS = ['linen', 'midnight', 'poppy', 'river'] as const;
export const TYPEFACE_IDS = ['serif', 'sans', 'letterpress'] as const;
export const MOTIF_IDS = ['first-photo', 'trumpet', 'crescent', 'loaf', 'wheat', 'watch', 'bench', 'hands', 'lantern', 'star', 'door', 'leaf'] as const;
export const TREATMENTS = ['standard', 'third-ink', 'hand-border'] as const;
export type ArtifactKind = typeof ARTIFACT_KINDS[number];
export type LayoutId = typeof LAYOUT_IDS[number];
export type PaletteId = typeof PALETTE_IDS[number];
export type TypefaceId = typeof TYPEFACE_IDS[number];
export type MotifId = typeof MOTIF_IDS[number];
export type Treatment = typeof TREATMENTS[number];
export const CREATIVE_INTENTIONS = ['clem-room', 'clem-band', 'mara-regulars', 'mara-newcomers', 'hugo-craft', 'hugo-next-hands', 'ivo-own-name', 'ivo-first-repairs'] as const;
export type CreativeIntention = typeof CREATIVE_INTENTIONS[number];
export const creativeIntentionSchema = z.enum(CREATIVE_INTENTIONS);

export interface MotifPlacement { id: MotifId; x: number; y: number; scale: 1 | 2 | 3; rotation: 0 | 90 | 180 | 270 }
export interface DesignPiece {
  kind: ArtifactKind;
  layout: LayoutId;
  palette: PaletteId;
  typeface: TypefaceId;
  copy: string[];
  headline?: string;
  motifs: MotifPlacement[];
  treatment: Treatment;
}
export interface DesignSpec { version: 1; pieces: DesignPiece[] }
export interface BriefCopy { id: string; text: string; role: 'title' | 'detail' | 'footer' }
export interface BriefRequirement {
  id: string;
  explanation: string;
  piece: number;
  rule: { kind: 'copy'; token: string } | { kind: 'motif'; motif: MotifId } | { kind: 'artifact'; artifact: ArtifactKind } | { kind: 'shared-palette'; withPiece: number };
}
export interface DesignBrief {
  version: 1;
  title: string;
  intention: string;
  pieces: { title: string; kind: ArtifactKind; copy: BriefCopy[]; motifs: MotifId[] }[];
  requirements: BriefRequirement[];
  defaultDesign: DesignSpec;
  briefingMinutes?: number[];
}
export interface ProjectDesignBrief extends DesignBrief {
  projectId: ProjectId;
  approach: ProjectApproach;
}
export interface ApprovedProof {
  briefVersion: 1;
  design: DesignSpec;
  pieces: { title: string; copy: BriefCopy[] }[];
  requirements: BriefRequirement[];
  extras: { materials: number; finishMinutes: number }[];
}

export const PALETTES: Record<PaletteId, { name: string; paper: string; ink: string; accent: string }> = {
  linen: { name: 'Warm linen', paper: '#f4e6ca', ink: '#203943', accent: '#b34c35' },
  midnight: { name: 'After midnight', paper: '#202a3a', ink: '#f8e9c9', accent: '#f1b151' },
  poppy: { name: 'Poppy & cream', paper: '#fff3dd', ink: '#522d35', accent: '#b74731' },
  river: { name: 'River green', paper: '#dce9df', ink: '#183e3b', accent: '#97502e' },
};
export const TYPEFACES: Record<TypefaceId, { name: string; family: string }> = {
  serif: { name: 'Book serif', family: '"Young Serif", Georgia, serif' },
  sans: { name: 'Clear sans', family: '"Atkinson Hyperlegible", sans-serif' },
  letterpress: { name: 'Workshop type', family: 'ui-monospace, "Courier New", monospace' },
};
export const MOTIFS: Record<MotifId, string> = { 'first-photo': 'The first-night photograph', trumpet: 'Trumpet', crescent: 'Crescent moon', loaf: 'Fresh loaf', wheat: 'Wheat', watch: 'Pocket watch', bench: 'The watchmaker’s bench', hands: 'Two hands', lantern: 'Paper lantern', star: 'Star', door: 'Open door', leaf: 'Leaf' };
export const LAYOUTS: Record<LayoutId, { name: string; art: { x: number; y: number; width: number; height: number } }> = {
  gallery: { name: 'Gallery', art: { x: 8, y: 26, width: 84, height: 49 } },
  headline: { name: 'Big headline', art: { x: 8, y: 40, width: 84, height: 35 } },
  split: { name: 'Side by side', art: { x: 49, y: 12, width: 44, height: 63 } },
  stack: { name: 'Print stack', art: { x: 8, y: 10, width: 84, height: 47 } },
};

const int = (min: number, max: number) => z.int().check(z.gte(min), z.lte(max));
export const designPieceSchema = z.strictObject({
  kind: z.enum(ARTIFACT_KINDS), layout: z.enum(LAYOUT_IDS), palette: z.enum(PALETTE_IDS), typeface: z.enum(TYPEFACE_IDS),
  copy: z.array(z.string().check(z.minLength(1), z.maxLength(40))).check(z.maxLength(8)),
  headline: z.optional(z.string().check(z.maxLength(64))),
  motifs: z.array(z.strictObject({ id: z.enum(MOTIF_IDS), x: int(0, 100), y: int(0, 100), scale: z.union([z.literal(1), z.literal(2), z.literal(3)]), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) })).check(z.maxLength(8)),
  treatment: z.enum(TREATMENTS),
});

export const designSchema = z.strictObject({
  version: z.literal(1),
  pieces: z.array(designPieceSchema).check(z.minLength(1), z.maxLength(3)),
}) satisfies z.ZodMiniType<DesignSpec>;

/** Motifs use a square this many artboard units across, including their rotation. */
export const motifSize = (scale: 1 | 2 | 3): number => scale === 1 ? 22 : scale === 2 ? 32 : 44;

export function motifFits(layout: LayoutId, motif: MotifPlacement): boolean {
  const a = LAYOUTS[layout].art;
  const half = motifSize(motif.scale) / 2;
  return motif.x - half >= a.x && motif.x + half <= a.x + a.width && motif.y - half >= a.y && motif.y + half <= a.y + a.height;
}

/** Changing the layout keeps existing illustrations inside its reserved illustration area. */
export function fitMotif(layout: LayoutId, motif: MotifPlacement): MotifPlacement {
  const a = LAYOUTS[layout].art;
  let scale = motif.scale;
  while (scale > 1 && motifSize(scale) > Math.min(a.width, a.height)) scale = (scale - 1) as 1 | 2;
  const half = motifSize(scale) / 2;
  return { ...motif, scale, x: Math.round(Math.max(a.x + half, Math.min(a.x + a.width - half, motif.x))), y: Math.round(Math.max(a.y + half, Math.min(a.y + a.height - half, motif.y))) };
}

export function validateDesign(brief: DesignBrief, input: unknown): string[] {
  const parsed = designSchema.safeParse(input);
  if (!parsed.success) return ['The proof contains an invalid piece, setting or placement.'];
  const design = parsed.data;
  if (design.pieces.length !== brief.pieces.length) return [`This commission needs exactly ${brief.pieces.length} ${brief.pieces.length === 1 ? 'piece' : 'pieces'}.`];
  const errors: string[] = [];
  for (const [index, piece] of design.pieces.entries()) {
    const page = brief.pieces[index]!;
    if (piece.copy.some(token => !page.copy.some(c => c.id === token)) || new Set(piece.copy).size !== piece.copy.length) errors.push(`${page.title}: choose each customer text once from this brief.`);
    if (piece.motifs.some(m => !page.motifs.includes(m.id))) errors.push(`${page.title}: that illustration does not belong to this brief.`);
    if (piece.motifs.some(m => !motifFits(piece.layout, m))) errors.push(`${page.title}: keep illustrations inside the picture area so the customer’s words stay clear.`);
  }
  for (const req of brief.requirements) {
    const piece = design.pieces[req.piece]!;
    const rule = req.rule;
    const met = rule.kind === 'copy' ? piece.copy.includes(rule.token)
      : rule.kind === 'motif' ? piece.motifs.some(m => m.id === rule.motif)
      : rule.kind === 'artifact' ? piece.kind === rule.artifact
      : piece.palette === design.pieces[rule.withPiece]!.palette;
    if (!met) errors.push(req.explanation);
  }
  return errors;
}

export function quoteDesign(brief: DesignBrief, design: DesignSpec): { materials: number; finishMinutes: number }[] {
  return design.pieces.map((piece, index) => {
    if (piece.treatment === 'hand-border') return { materials: 20, finishMinutes: 30 };
    if (piece.treatment === 'third-ink') return brief.pieces[index]!.kind === 'card' ? { materials: 20, finishMinutes: 10 } : { materials: 40, finishMinutes: 15 };
    return { materials: 0, finishMinutes: 0 };
  });
}

export function approveProof(brief: DesignBrief, input: unknown): { proof?: ApprovedProof; errors: string[] } {
  const errors = validateDesign(brief, input);
  if (errors.length) return { errors };
  const design = structuredClone(input as DesignSpec);
  return { errors, proof: { briefVersion: 1, design, pieces: structuredClone(brief.pieces.map(({ title, copy }) => ({ title, copy }))), requirements: structuredClone(brief.requirements), extras: quoteDesign(brief, design) } };
}

export interface ProjectDesignContext {
  projectId: ProjectId;
  approach: ProjectApproach;
  scenarioId: string;
  eventDay: number;
  contributors: string[];
  continuation?: { previousApproach?: ProjectApproach; ivo: boolean };
  career?: { stage: CareerStage; sourceTitle?: string };
}

/** Copy is an authored fact of the brief, never invented later by the renderer. */
export function briefForProject(context: ProjectDesignContext): ProjectDesignBrief {
  const { projectId, approach, scenarioId, eventDay, contributors } = context;
  const festival = scenarioId === 'festival-week';
  const continuing = context.continuation;
  const careful = scenarioId === 'bespoke-rush';
  const event = careful ? 'Open studios' : festival ? 'The lantern walk' : 'Lantern Night';
  const pieces: DesignBrief['pieces'] = [];
  const requirements: BriefRequirement[] = [];
  const page = (title: string, kind: ArtifactKind, copy: BriefCopy[], motifs: MotifId[], requiredMotif?: MotifId) => {
    const index = pieces.length;
    pieces.push({ title, kind, copy, motifs });
    requirements.push({ id: `${index}-artifact`, explanation: `${title}: keep the agreed ${kind}.`, piece: index, rule: { kind: 'artifact', artifact: kind } });
    for (const c of copy) requirements.push({ id: `${index}-${c.id}`, explanation: `${title}: include “${c.text}”.`, piece: index, rule: { kind: 'copy', token: c.id } });
    if (requiredMotif) requirements.push({ id: `${index}-motif`, explanation: `${title}: keep ${MOTIFS[requiredMotif].toLowerCase()} in the piece.`, piece: index, rule: { kind: 'motif', motif: requiredMotif } });
  };
  const copy = (id: string, text: string, role: BriefCopy['role'] = 'detail'): BriefCopy => ({ id, text, role });
  let title: string;
  let intention: string;
  switch (approach) {
    case 'first-night':
      title = 'The room that started it'; intention = 'Clem wants the people from the first night to recognise their room. Keep the photograph and the original bar lettering.';
      page('Anniversary photograph', 'photograph', [copy('venue', 'CLEM JAZZ BAR', 'title'), copy('anniversary', 'Ten years. One room. All those nights.', 'footer')], ['first-photo', 'trumpet', 'star', 'crescent'], 'first-photo'); break;
    case 'new-band':
      title = 'The next ten years'; intention = 'Clem wants the anniversary to give the new band a beginning of their own. Put their name on the wall.';
      page('Anniversary poster', 'poster', [copy('band', 'THE NIGHT WINDOW TRIO', 'title'), copy('anniversary', 'Clem Jazz Bar · Tenth birthday'), copy('venue', 'Live at Clem Jazz Bar', 'footer')], ['trumpet', 'crescent', 'star', 'door']); break;
    case 'weekly-rhythm':
      title = festival ? 'Bread for the lantern walk' : 'A place in the week'; intention = 'Mara wants a family of cards people can recognise from the other side of the street. Use one palette across the set; give each card its own character.';
      ['The first loaf', 'A little time together', 'Save a place'].forEach((heading, i) => {
        page(`Bakery card ${i + 1}`, 'card', [copy(`card-${i + 1}`, heading, 'title'), copy('bakery', 'Moonrise Bakery', 'footer')], ['loaf', 'wheat', 'crescent', 'leaf']);
        if (i) requirements.push({ id: `${i}-palette`, explanation: 'Mara’s three cards need the same palette so they read as a family.', piece: i, rule: { kind: 'shared-palette', withPiece: 0 } });
      }); break;
    case 'market-debut':
      title = 'Mara’s first market morning'; intention = 'Mara wants people who have never visited the bakery to find her stall. Make the name and market location easy to find.';
      page('Market banner', 'banner', [copy('bakery', 'MOONRISE BAKERY', 'title'), copy('market', 'Saturday market · The old square', 'footer')], ['loaf', 'wheat', 'crescent', 'leaf']); break;
    case 'quiet-sendoff':
      title = 'Forty years at this bench'; intention = 'Hugo wants a keepsake for the apprentice, not a public invitation. Keep him and the bench in the picture.';
      page('Workshop portrait', 'portrait', [copy('hugo', 'Hugo at the bench', 'title'), copy('dedication', 'For Ivo. There is time to get it right.', 'footer')], ['bench', 'watch', 'hands', 'star'], 'bench'); break;
    case 'open-bench':
      title = 'A name above the new bench'; intention = 'Hugo is giving Ivo a place in the workshop. The new sign needs his name as well as the workshop’s.';
      page('Apprentice’s sign', 'sign', [copy('apprentice', 'IVO', 'title'), copy('workshop', 'Watch repair with Hugo', 'detail'), copy('invitation', 'The bench is open', 'footer')], ['watch', 'bench', 'hands', 'door']); break;
    case 'courtyard':
    case 'trail': {
      title = approach === 'courtyard' ? 'An evening in the courtyard' : careful ? 'Doors open, work shared' : 'Follow the light';
      intention = approach === 'courtyard' ? 'Invite the street into one shared place. Only the contributors who have already agreed can appear on the invitation.' : 'Give the gathering a common voice across its pieces. The route and hosts are the ones the studio has actually brought together.';
      const kinds: ArtifactKind[] = approach === 'courtyard' ? ['invitation'] : careful ? ['invitation', 'catalogue'] : ['programme', 'map', 'sign'];
      const where = approach === 'courtyard' ? 'The Lantern Works courtyard' : 'Start at Lantern Works';
      kinds.forEach(kind => page(`${event} ${kind}`, kind, [copy('event', event.toUpperCase(), 'title'), copy('date', `Day ${eventDay + 1} · After the shops close`), copy('place', where), copy('contributors', contributors.join(' · ') || 'Lantern Works', 'footer')], ['lantern', 'star', 'door', 'crescent', 'leaf']));
      break;
    }
  }
  if (continuing && projectId !== 'lantern-night') {
    const previous = continuing.previousApproach;
    const retitle = (index: number, text: string) => { pieces[index]!.title = text; };
    const rewrite = (index: number, id: string, text: string) => { const c = pieces[index]!.copy.find(c => c.id === id); if (c) c.text = text; };
    if (projectId === 'clem-ten') {
      title = approach === 'first-night' ? 'The archive stays on the wall' : previous === 'new-band' ? 'The trio takes a residency' : 'A new band takes the room';
      intention = approach === 'first-night' ? 'Clem is opening a small archive wall beside the stage. Restore another photograph without turning it into an anniversary advertisement.' : 'The band has a regular Thursday slot. Give this residency a poster people can recognise week after week.';
      retitle(0, approach === 'first-night' ? 'Archive wall photograph' : 'Thursday residency poster');
      rewrite(0, 'anniversary', approach === 'first-night' ? 'FROM THE CLEM ARCHIVE · The room remembers' : 'Every Thursday · Doors at seven');
      rewrite(0, 'band', previous === 'new-band' ? 'THE NIGHT WINDOW TRIO · IN RESIDENCE' : 'THE RIVER ROOM QUARTET');
    } else if (projectId === 'mara-regular') {
      title = approach === 'weekly-rhythm' ? 'A counter people can read' : previous === 'market-debut' ? 'Moonrise has a market name' : 'A place beyond the bakery';
      intention = approach === 'weekly-rhythm' ? 'Mara needs three matching counter and menu cards. Keep bread, breakfast and orders distinct, with one palette across the set.' : 'Mara is returning to the market with a stall identity. Make the bakery name and collection point clear.';
      if (approach === 'weekly-rhythm') ['Today’s bread', 'Breakfast at Moonrise', 'Order for tomorrow'].forEach((text, i) => { retitle(i, `Counter and menu card ${i + 1}`); rewrite(i, `card-${i + 1}`, text); });
      else { retitle(0, 'Market stall identity'); rewrite(0, 'market', previous === 'market-debut' ? 'Find our regular stall · Saturday market' : 'Saturday market · Collect at the Moonrise stall'); }
    } else if (continuing.ivo) {
      title = approach === 'quiet-sendoff' ? 'Ivo opens the workshop' : 'Learn a first repair with Ivo';
      intention = approach === 'quiet-sendoff' ? 'Ivo needs his own sign above the workshop. Hugo’s apprentice is taking responsibility for the bench and the work.' : 'Ivo is teaching a small repair workshop. Make the invitation and the teacher’s name clear.';
      pieces.length = 0; requirements.length = 0;
      if (approach === 'quiet-sendoff') page('Ivo’s independent sign', 'sign', [copy('apprentice', 'IVO WATCH WORKSHOP', 'title'), copy('workshop', 'Repairs at the old bench', 'footer')], ['watch', 'bench', 'hands', 'door']);
      else page('Ivo’s repair workshop poster', 'poster', [copy('apprentice', 'FIRST REPAIRS WITH IVO', 'title'), copy('workshop', 'Saturday · Six places at the bench'), copy('invitation', 'Bring a watch. Learn where to begin.', 'footer')], ['watch', 'bench', 'hands', 'door']);
    }
    // Requirements describe the new customer copy, rather than retaining the previous season's wording.
    for (const requirement of requirements) if (requirement.rule.kind === 'copy') { const token = requirement.rule.token; const c = pieces[requirement.piece]!.copy.find(c => c.id === token)!; requirement.explanation = `${pieces[requirement.piece]!.title}: include “${c.text}”.`; }
  }
  if (context.career?.stage === 'practice' && projectId === 'hugo-handover' && approach === 'open-bench') {
    title = 'Learn a repair with Ivo';
    intention = 'Ivo is teaching a small repair workshop. Make the invitation and the teacher’s name clear.';
    pieces[0]!.copy.find(c => c.id === 'apprentice')!.text = 'REPAIRS WITH IVO';
  }
  if (context.career && ['legacy', 'open'].includes(context.career.stage) && projectId !== 'lantern-night') {
    const open = context.career.stage === 'open';
    pieces.length = 0; requirements.length = 0;
    const coordinated = () => requirements.push({ id: '1-palette', explanation: 'Keep the coordinated pieces in one palette.', piece: 1, rule: { kind: 'shared-palette', withPiece: 0 } });
    switch (approach) {
      case 'first-night':
        title = open ? 'The next archive rotation' : 'A retained print, lent to the archive';
        intention = 'Lend the retained artwork exactly as it was made. Compose a new caption and invitation beside it.';
        page('Archive caption and invitation', 'invitation', [copy('archive', 'FROM THE CLEM ARCHIVE', 'title'), copy('piece', context.career.sourceTitle ?? 'A print from the studio archive'), copy('invitation', 'See the shared archive at Clem Jazz Bar', 'footer')], ['trumpet', 'crescent', 'star', 'door']); break;
      case 'new-band':
        title = open ? 'A new archive selection' : 'Curate the shared archive';
        intention = 'Make two coordinated prints that give the shared photographs a clear place in the room.';
        ['The room remembers', 'The music carries on'].forEach((heading, i) => page(`Archive display print ${i + 1}`, 'poster', [copy('heading', heading, 'title'), copy('archive', 'The shared archive at Clem Jazz Bar', 'footer')], ['trumpet', 'crescent', 'star', 'door']));
        coordinated(); break;
      case 'weekly-rhythm':
        title = open ? 'A seasonal table at Moonrise' : 'One shared table';
        intention = 'Invite neighbours to one table. Mara supplies bread without opening the bakery as a host.';
        page('Shared-table invitation', 'invitation', [copy('table', open ? 'THE SEASONAL TABLE' : 'A PLACE AT THE SHARED TABLE', 'title'), copy('bakery', 'Bread from Moonrise Bakery'), copy('invitation', 'Bring a neighbour. Share the table.', 'footer')], ['loaf', 'wheat', 'crescent', 'leaf']); break;
      case 'market-debut':
        title = open ? 'The bakery opens for the season' : 'Open the bakery to the street';
        intention = 'Make three coordinated labels and invitations. All three must arrive to open the bakery and earn its bread contribution.';
        ['Bread to share', 'A table at Moonrise', 'The bakery is open'].forEach((heading, i) => {
          page(`Bakery label and invitation ${i + 1}`, 'card', [copy('heading', heading, 'title'), copy('bakery', 'Moonrise Bakery', 'footer')], ['loaf', 'wheat', 'crescent', 'leaf']);
          if (i) requirements.push({ id: `${i}-palette`, explanation: 'Keep the bakery set in one palette.', piece: i, rule: { kind: 'shared-palette', withPiece: 0 } });
        }); break;
      case 'quiet-sendoff':
        title = open ? 'A repair manual edition' : 'A repair sheet to pass on';
        intention = 'Make one careful reference sheet people can use and keep. The sheet contributes work without opening a class.';
        page('Repair reference sheet', 'poster', [copy('repair', 'REPAIR NOTES FROM IVO', 'title'), copy('step', 'Look carefully. Record the parts. Work at the bench.'), copy('workshop', 'Ivo Watch Workshop', 'footer')], ['watch', 'bench', 'hands', 'door']); break;
      case 'open-bench':
        title = open ? 'The repair class returns' : 'Pass on a repair at the bench';
        intention = 'Prepare a class invitation and a demonstration sheet. The demonstration needs its own careful briefing; both pieces must arrive before Ivo hosts.';
        page('Repair class invitation', 'invitation', [copy('class', 'REPAIRS WITH IVO', 'title'), copy('invitation', 'Bring a watch. Share a place at the bench.'), copy('workshop', 'Ivo Watch Workshop', 'footer')], ['watch', 'bench', 'hands', 'door']);
        page('Repair demonstration sheet', 'poster', [copy('demonstration', 'THE REPAIR, STEP BY STEP', 'title'), copy('step', 'Observe the movement. Record each part. Check the repair.'), copy('workshop', 'Ivo Watch Workshop', 'footer')], ['watch', 'bench', 'hands', 'door']); break;
    }
  }
  if (context.career) for (const requirement of requirements) if (requirement.rule.kind === 'copy') {
    const token = requirement.rule.token;
    const c = pieces[requirement.piece]!.copy.find(c => c.id === token)!;
    requirement.explanation = `${pieces[requirement.piece]!.title}: include “${c.text}”.`;
  }
  const defaultDesign: DesignSpec = { version: 1, pieces: pieces.map((p, index) => {
    const required = requirements.find(r => r.piece === index && r.rule.kind === 'motif')?.rule;
    const motif = required?.kind === 'motif' ? required.motif : p.motifs[0]!;
    return { kind: p.kind, layout: 'gallery', palette: projectId === 'clem-ten' ? 'midnight' : projectId === 'mara-regular' ? 'linen' : projectId === 'hugo-handover' ? 'river' : 'poppy', typeface: 'serif', copy: p.copy.map(c => c.id), motifs: [{ id: motif, x: 50, y: 50, scale: 3, rotation: 0 }], treatment: 'standard' };
  }) };
  return { version: 1, projectId, approach, title, intention, pieces, requirements, defaultDesign };
}
