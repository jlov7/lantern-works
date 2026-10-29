import type { ApprovedProof } from '../../engine/design';
import { contractProof, ordinaryBrief, ordinaryRequestLine } from '../../engine/ordinary';
import { AUTHORSHIP_RULES_VERSION } from '../../engine/versions';
import { CAST_BY_ID, PRESETS, RULES } from '../../engine/rules';
import { APPROACHES, projectFor, approachFor, nightCalendar, nightResult, projectRecords, type ProjectRecord } from '../../engine/projects';
import type { CompanyState, Contract, Job, OfferSpec, ProjectApproach, ProjectIdentity, Request, RunConfig } from '../../engine/types';
import { laterRequestCopy } from './careerContinuity';

export type PosterFamily = 'bakery' | 'jazz' | 'theatre' | 'artisan' | 'taproom' | 'sleeve' | 'botanical' | 'market' | 'editorial' | 'sport' | 'cinema' | 'table';
export type Subject = 'loaf' | 'pie' | 'bun' | 'flower' | 'wreath' | 'sunflower' | 'tulip' | 'rose' | 'cup' | 'mic' | 'yarn' | 'curtain' | 'frame' | 'lantern' | 'mountain' | 'book' | 'watch' | 'teapot' | 'record' | 'coat' | 'dress' | 'truck' | 'dumpling' | 'bicycle' | 'plant' | 'cactus' | 'cake' | 'film' | 'glass' | 'needle' | 'print' | 'mango' | 'cherries' | 'barrow' | 'key' | 'scissors' | 'saxophone' | 'dancer' | 'pot' | 'violin' | 'bottle' | 'cheese' | 'popcorn' | 'sushi' | 'shoe' | 'party';
export interface AuthoredBrief {
  castId: string;
  family: PosterFamily;
  subject: Subject;
  headline: string;
  detail: string;
  request: string;
  ink: string;
  paper: string;
  accent: string;
  project?: ProjectIdentity;
  proof?: ApprovedProof;
  festivalSet?: boolean;
  event?: { name: string; day: number; careful: boolean; festival: boolean };
  story?: 'mara' | 'eli' | 'hugo' | 'clem' | 'oscar' | 'party';
}
type Line = readonly [headline: string, subject: Subject, detail: string];
interface Identity { family: PosterFamily; ink: string; paper: string; accent: string; lines: readonly Line[] }
const identity = (family: PosterFamily, ink: string, paper: string, accent: string, ...lines: Line[]): Identity => ({ family, ink, paper, accent, lines });

// An editorial decision for each actual request, indexed exactly like CAST.lines. No business-name inference.
export const BRIEF_IDENTITIES: Record<string, Identity> = {
  mara: identity('bakery', '#9b3c1d', '#fff0cc', '#e78331', ['Friday bake sale', 'bun', 'Moonrise ovens. Something to take home.'], ['Saturday sourdough', 'loaf', 'A slow rise. A fresh Saturday.'], ['Pies at the market', 'pie', 'Find Moonrise by the market stalls.']),
  ines: identity('botanical', '#24584b', '#f7ebdb', '#db7188', ['Peony weekend', 'flower', 'A little colour for the way home.'], ['Make a wreath', 'wreath', 'A small workshop at the flower cart.'], ['Sunflowers by the crate', 'sunflower', 'Summer from the Saturday cart.']),
  kofi: identity('table', '#392a23', '#e9e3cb', '#b55c36', ['Cold brew on the corner', 'cup', 'A new pour for familiar faces.'], ['Your next cup', 'cup', 'Loyalty cards are back at the cart.'], ['Friday open mic', 'mic', 'A cup, a song, the corner.']),
  bea: identity('editorial', '#6c3458', '#f6e0d7', '#c87958', ['First stitches', 'yarn', 'The Tuesday beginners circle.'], ['Winter in wool', 'yarn', 'New yarn at Bea’s Knit Shop.'], ['Another night to knit', 'yarn', 'A second knit-and-natter circle.']),
  eli: identity('theatre', '#f8e3b8', '#a9272e', '#e8b65e', ['Opening night', 'curtain', 'The Pocket Stage. The lights come up.'], ['A new stage', 'curtain', 'The same show. A new room.'], ['One last curtain', 'curtain', 'Closing week at the Pocket Stage.']),
  odile: identity('editorial', '#272d49', '#f0ead8', '#d17443', ['A new exhibition', 'frame', 'Gallery Nine opens its doors.'], ['In the artist’s words', 'frame', 'Thursday at Gallery Nine.'], ['After dark at Nine', 'frame', 'A late-night gallery opening.']),
  sam: identity('market', '#f4df9e', '#234a4b', '#df7849', ['Night market', 'lantern', 'The first market of the year.'], ['A second street', 'lantern', 'More stalls. More of the night.'], ['Follow the lanterns', 'lantern', 'A parade through the market.']),
  ravi: identity('sport', '#1e463d', '#e6e9c7', '#df682f', ['The first ascent', 'mountain', 'Hillside Climbing Gym opens.'], ['A new problem', 'mountain', 'The new bouldering wall at Hillside.'], ['Reach the top', 'mountain', 'Hillside’s first climbing competition.']),
  nell: identity('editorial', '#3c493f', '#efe5cb', '#a36a46', ['A night between pages', 'book', 'Read together at The Next Chapter.'], ['A poet visits', 'book', 'An evening for listening.'], ['Take your time', 'book', 'A book club for slow readers.']),
  ivo: identity('artisan', '#24463e', '#e9dfc7', '#b5844b', ['A name above the door', 'watch', 'Ivo Watch Workshop. The old bench has a new hand.'], ['A first repair', 'watch', 'Learn the first repair with Ivo.']),
  hugo: identity('artisan', '#343e3a', '#e8e0cc', '#ac7f43', ['Forty years, carefully', 'watch', 'Hugo Watch Repair. Time well spent.'], ['The art of restoration', 'watch', 'A workshop with Hugo.'], ['The next pair of hands', 'watch', 'An apprentice takes a bench.']),
  priya: identity('table', '#3b4e3b', '#f1e9ce', '#bc8b45', ['A considered evening', 'teapot', 'A tasting at Steep Tea Room.'], ['The season in a cup', 'teapot', 'A new menu, with a story.'], ['From one estate', 'teapot', 'Tea with a place to call home.']),
  wren: identity('sleeve', '#f1d4a2', '#203b4b', '#df7548', ['Record Day', 'record', 'For the ones who know every groove.'], ['Live between the racks', 'record', 'An in-store session at Wren Records.'], ['A rare pressing', 'record', 'The details are in the grooves.']),
  juno: identity('market', '#542f44', '#f6dbb8', '#cf5848', ['Tomorrow, vintage', 'coat', 'Pop-up Vintage opens tomorrow.'], ['Coats, just arrived', 'coat', 'A surprise rail. Here today.'], ['Dressed for tonight', 'dress', 'Party dresses. One night only.']),
  theo: identity('market', '#ede4ad', '#314d46', '#df6b37', ['Parkside tonight', 'truck', 'Find Theo by the park.'], ['New spot. Same supper.', 'truck', 'The rain moved us. We’re still cooking.'], ['Sauce by the river', 'truck', 'A new flavour for one evening.']),
  lu: identity('table', '#9c3427', '#f5e3c2', '#dba957', ['Dumplings, today', 'dumpling', 'One day. One special.'], ['Another batch is ready', 'dumpling', 'Lu’s kitchen is steaming again.'], ['For the night owls', 'dumpling', 'The dumpling kitchen stays open late.']),
  ash: identity('sport', '#1f5157', '#efe9cc', '#d88b3c', ['Roll in. Ride out.', 'bicycle', 'Free tune-ups this afternoon.'], ['Repairs by the station', 'bicycle', 'Ash’s pop-up repair stand. Today.'], ['Punctures at lunch', 'bicycle', 'A clinic for a smoother way home.']),
  dev: identity('botanical', '#315e40', '#efe4bd', '#be764a', ['Cuttings & company', 'plant', 'A friendly Sunday swap.'], ['Every cactus goes', 'cactus', 'A sale at the corner plant stall.'], ['Room to grow', 'plant', 'Repotting help this weekend.']),
  rosa: identity('bakery', '#8b3f32', '#f6e1ba', '#ca7144', ['Saturday cinnamon', 'bun', 'The buns are back at Rosa Bakes.'], ['A loaf for everyone', 'loaf', 'Gluten-free loaves at Rosa Bakes.'], ['Make a birthday wish', 'cake', 'Cake orders open for the month.']),
  mina: identity('cinema', '#f5ddad', '#29424e', '#d9774a', ['The director is here', 'film', 'A premiere at The Little Cinema.'], ['Another year of cinema', 'film', 'An anniversary on the big screen.'], ['Cinema under the sky', 'film', 'An outdoor screening in the square.']),
  oscar: identity('taproom', '#542f1a', '#efb94e', '#fbdf8b', ['The taps are open', 'glass', 'Oscar Brewing. Two years in the making.'], ['Our first festival beer', 'glass', 'A new brew for a big occasion.'], ['Behind the brewery doors', 'glass', 'The brewery tour begins.']),
  florence: identity('artisan', '#4d4c3d', '#ece3c9', '#a78242', ['A world on paper', 'frame', 'Old maps at Florence Framing.'], ['Frames, restored', 'frame', 'An old frame. A careful new life.'], ['The quiet art of gold', 'frame', 'A talk on gilding.']),
  idris: identity('artisan', '#364248', '#e6dfce', '#ab8550', ['Made to measure', 'needle', 'A week at Idris Tailoring.'], ['Fifty years of fit', 'needle', 'Idris Tailoring. An anniversary.'], ['A new hand at the cloth', 'needle', 'An apprentice joins the workshop.']),
  pip: identity('market', '#312d57', '#f0cbbc', '#d95e3e', ['Prints at the station', 'print', 'Today only. Pip’s pop-up stall.'], ['Fresh off the press', 'print', 'A new batch in an hour.'], ['Before the rain', 'print', 'A flash sale of pop-up prints.']),
  yusuf: identity('market', '#325137', '#f1dfaf', '#e8a03b', ['Mangoes, early', 'mango', 'On Yusuf’s barrow today.'], ['The last cherries', 'cherries', 'This afternoon, while they last.'], ['Find us in the square', 'barrow', 'The fruit barrow moves for the day.']),
  tilly: identity('table', '#3d6763', '#efe6cc', '#d7a34e', ['A cooler cup', 'teapot', 'Iced tea returns to Tilly’s cart.'], ['Two new blends', 'teapot', 'Something new for this week.'], ['Tea by the fountain', 'teapot', 'A small Sunday tasting.']),
  gus: identity('editorial', '#354643', '#efe1bc', '#cc803d', ['Colour for the weekend', 'print', 'The paint sale at Gus Hardware.'], ['A key to the corner', 'key', 'Key cutting, now at Gus Hardware.'], ['Spring starts here', 'plant', 'Bulbs for the regulars.']),
  amara: identity('editorial', '#693f52', '#f0dccb', '#c77c55', ['Walk in Wednesday', 'scissors', 'Make a little time for your hair.'], ['Meet your new stylist', 'scissors', 'A new face at Amara Hair on Monday.'], ['A little off the fringe', 'scissors', 'Half-price trims this week.']),
  bo: identity('table', '#694361', '#ebdce4', '#b78a4f', ['Taro is back', 'cup', 'You asked. Bo listened.'], ['A little student perk', 'cup', 'A discount all week at Bo Bubble Tea.'], ['Friday, a little later', 'cup', 'The bubble tea shop stays open.']),
  clem: identity('jazz', '#f1ddaf', '#242d63', '#e69b51', ['One night. One trio.', 'saxophone', 'Out of town. In the room. At Clem’s.'], ['Ten years of Clem', 'saxophone', 'A birthday worthy of the first night.'], ['The late jam', 'saxophone', 'A famous guest. Stay for the last set.']),
  yara: identity('theatre', '#f6dfbb', '#693957', '#e39c59', ['See them shine', 'dancer', 'The summer showcase at Yara Dance.'], ['Your turn to dance', 'dancer', 'A new adult class begins.'], ['Dance in the square', 'dancer', 'A dance-off for the whole street.']),
  finn: identity('sport', '#254a55', '#e6e4bf', '#d4783d', ['Everyone out', 'bicycle', 'The first group ride of the year.'], ['Ride towards morning', 'bicycle', 'A sunrise ride to the coast.'], ['One hundred rides', 'bicycle', 'The club celebrates on two wheels.']),
  lorna: identity('artisan', '#654739', '#eadcc1', '#b55f3c', ['Open the kiln', 'pot', 'An opening day for the whole studio.'], ['Clay in the courtyard', 'pot', 'A pottery market for one afternoon.'], ['From hands to form', 'pot', 'A visiting potter throws live.']),
  agnes: identity('artisan', '#584b4c', '#eee1c7', '#a77945', ['Bound by hand', 'book', 'A small run of journals at Agnes Bindery.'], ['Books, gently repaired', 'book', 'A new chapter for an old favourite.'], ['Paper with a current', 'book', 'A talk on the art of marbling.']),
  tobias: identity('artisan', '#5b3c30', '#eee0be', '#b8883b', ['An old voice, restored', 'violin', 'A violin returns from Tobias’s bench.'], ['Thirty chairs. One violin.', 'violin', 'A recital in the workshop.'], ['Her first violin', 'violin', 'An apprentice’s instrument is ready.']),
  saoirse: identity('artisan', '#54424c', '#efe0d0', '#b58a45', ['The street, in scent', 'bottle', 'A perfume made for this place.'], ['Six places to blend', 'bottle', 'A small class at Saoirse Perfumery.'], ['A rare oil, a long story', 'bottle', 'An arrival at the perfumery.']),
  malik: identity('table', '#4e5335', '#efe2bb', '#bf8c3f', ['Time from a tiny farm', 'cheese', 'An aged cheese at Malik Cheese Room.'], ['Meet the cheesemaker', 'cheese', 'A small, proper tasting.'], ['Aged in our own room', 'cheese', 'Malik’s next chapter begins here.']),
  rory: identity('market', '#704732', '#f4dfac', '#d99539', ['Before the seven o’clock', 'popcorn', 'Popcorn for the cinema crowd.'], ['Caramel, just done', 'popcorn', 'Today’s batch at Rory’s cart.'], ['Popcorn in the park', 'popcorn', 'Find the cart there this afternoon.']),
  hana: identity('table', '#354e47', '#eee1c8', '#d27d62', ['Fresh for lunch', 'sushi', 'Today’s special at Hana Sushi Stand.'], ['Salmon for tonight', 'sushi', 'A little extra. Ready this evening.'], ['Until we sell out', 'sushi', 'Hana’s pop-up at the station.']),
  ollie: identity('editorial', '#414643', '#eaddbc', '#b47b43', ['A better heel today', 'shoe', 'Fixes while you wait at Ollie’s.'], ['Ready for the rain', 'shoe', 'Rain boots patched today.'], ['Lace up for less', 'shoe', 'Half price on laces until close.']),
  zainab: identity('botanical', '#5a3c4f', '#f5e0c9', '#c75e70', ['Fifty bouquets', 'flower', 'Flowers looking for a home today.'], ['Tulips before tonight', 'tulip', 'A little colour, while it lasts.'], ['Roses for the weekend', 'rose', 'A flash sale at Zainab Flowers.']),
  committee: identity('market', '#f5e5a9', '#26534f', '#e87f45', ['A street full of festival', 'lantern', 'Four launches for festival weekend.']),
  association: identity('market', '#f8e6ad', '#285556', '#e77b49', ['Summer on our street', 'party', 'Come out. Everyone will be here.']),
};

const NEWS_BRIEFS: Record<string, { headline: string; detail: string; request: string; subject?: Subject; story?: AuthoredBrief['story'] }> = {
  "Mara's regular": { headline: 'A season at Moonrise', detail: 'Three launches for the growing bakery.', request: 'Mara wants something regular: three launches, every three days, each ready within two. She offers 1,050 up front.', story: 'mara' },
  'Second opening': { headline: 'The curtain rises again', detail: 'The Pocket Stage. The run is extended.', request: 'A second week is on, and Eli wants it to feel like an opening again: one careful launch within two days, 1,500 credits.', story: 'eli' },
  'A quiet send-off': { headline: 'The next pair of hands', detail: 'Forty years at the bench. An apprentice takes over.', request: 'After forty years Hugo is handing his bench to an apprentice. He asks for a quiet send-off and offers 500, well under your usual price.', story: 'hugo' },
  'Ten years of Clem': { headline: 'Ten years of Clem', detail: 'One room. Ten years. A birthday night.', request: 'Now the bar turns ten on Saturday, and Clem wants it to feel like the first night again: one careful launch within three days, 1,200 credits.', story: 'clem' },
  'Tap takeover rescue': { headline: 'Tonight, the taps are ours', detail: 'Oscar’s tap takeover. The night is back on.', request: 'Oscar is at your window: one launch, ready within two days, 900 credits. Save his night and every big-night crowd on the street hears whose launch did it.', story: 'oscar' },
  'Summer street party': { headline: 'Summer on our street', detail: 'A party for everyone on the street.', request: 'They want Lantern Works to launch the summer street party: one big launch within three days, 1,600 credits. Everyone you have served will be there.', subject: 'party', story: 'party' },
  'Festival bundle': { headline: 'A street full of festival', detail: 'The festival weekend. Four launches.', request: 'Four quick launches, one every two days, each ready within two days. 1,600 credits up front. They are at the window now.', subject: 'lantern' },
};
const PREMIERES: Record<string, Line> = {
  eli: ['Tonight, the curtain rises', 'curtain', 'A same-day premiere at the Pocket Stage.'],
  mina: ['Premiere tonight', 'film', 'The Little Cinema. A big night, announced today.'],
  clem: ['The first set is tonight', 'saxophone', 'A same-day premiere at Clem Jazz Bar.'],
  yara: ['On stage tonight', 'dancer', 'A same-day premiere at Yara Dance School.'],
};

const PROJECT_BRIEFS: Record<ProjectApproach, Line> = {
  'first-night': ['The first night, again', 'frame', 'The photograph and lettering from Clem’s first night.'],
  'new-band': ['The next ten years', 'saxophone', 'The anniversary wall belongs to the new band.'],
  'weekly-rhythm': ['A place in the week', 'loaf', 'Three coordinated cards for the bakery wall.'],
  'market-debut': ['Moonrise at the market', 'pie', 'A custom banner for Mara’s market debut.'],
  'quiet-sendoff': ['Hugo, at the bench', 'watch', 'A quiet workshop portrait to keep.'],
  'open-bench': ['The bench is open', 'watch', 'The apprentice’s sign. A public handover.'],
  courtyard: ['One courtyard, together', 'lantern', 'One custom invitation for a shared gathering.'],
  trail: ['Light the street', 'lantern', 'A programme connecting the commissioned hosts.'],
};

export function briefFor(request: Request, offer = request.offer, config?: RunConfig, proof?: ApprovedProof, rulesVersion = AUTHORSHIP_RULES_VERSION): AuthoredBrief {
  const cast = CAST_BY_ID[request.castId]!;
  const visual = BRIEF_IDENTITIES[request.castId]!;
  const line = visual.lines[request.lineIndex] ?? visual.lines[0]!;
  const fixed = request.source === 'news' && offer ? NEWS_BRIEFS[offer.name] : undefined;
  const premiere = request.source === 'news' && offer?.name === 'Premiere rush' ? PREMIERES[request.castId] : undefined;
  const ordinary = request.briefId ? ordinaryBrief(request, { ...(offer ?? PRESETS.bespoke), launches: 1 }) : null;
  const recurring = config ? laterRequestCopy({ config, rulesVersion }, request, offer) : null;
  const headline = ordinary?.title ?? recurring?.headline ?? fixed?.headline ?? premiere?.[0] ?? line[0];
  const detail = ordinary?.pieces[0]?.copy.find(copy => copy.id === 'detail')?.text ?? recurring?.detail ?? fixed?.detail ?? premiere?.[2] ?? line[2];
  if (request.project) {
    const project = request.project;
    const authored = PROJECT_BRIEFS[project.approach];
    const cal = config ? nightCalendar({ config }) : undefined;
    const event = project.id === 'lantern-night' && cal ? { name: cal.name, day: cal.day, careful: cal.careful, festival: config!.scenarioId === 'festival-week' } : undefined;
    const festivalSet = project.approach === 'weekly-rhythm' && config?.scenarioId === 'festival-week';
    const approach = config ? approachFor({ config, rulesVersion }, project.approach) : APPROACHES[project.approach];
    return { castId: request.castId, family: visual.family, ink: visual.ink, paper: visual.paper, accent: visual.accent, headline: proof?.pieces[0]?.title ?? (event ? project.approach === 'trail' && event.careful ? 'Invitations & catalogue' : event.name : festivalSet ? 'Bread for festival week' : authored[0]), subject: authored[1], detail: config?.continuation ? approach.detail : festivalSet ? 'Three coordinated bakery cards, ready together for festival week.' : authored[2], request: `${projectFor({ config: config ?? { scenarioId: 'main-street', seed: '' }, rulesVersion }, project.id).invitation} ${approach.detail}`, project, event, festivalSet, ...(proof ? { proof } : {}) };
  }
  return {
    castId: request.castId, family: visual.family, ink: visual.ink, paper: visual.paper, accent: visual.accent,
    headline: proof?.pieces[0]?.title ?? headline, detail: proof?.pieces[0]?.copy.find(copy => copy.role === 'detail')?.text ?? detail, subject: fixed?.subject ?? premiere?.[1] ?? line[1], story: recurring && fixed?.story === 'oscar' ? undefined : fixed?.story,
    ...(proof ? { proof } : {}),
    request: ordinaryRequestLine(request) ?? recurring?.request ?? fixed?.request ?? (premiere ? `${cast.name} has a premiere tonight and nobody to announce it. One careful launch, same day, 1,400 credits. They are at the window.` : cast.lines[request.lineIndex] ?? cast.lines[0]!),
  };
}

export function seriesLabel(castId: string, launch: number, launches: number): string {
  return `${CAST_BY_ID[castId]!.business} series · ${String(launch).padStart(2, '0')} / ${String(launches).padStart(2, '0')}`;
}

export function artifactLabel(brief: AuthoredBrief, launch: number): string {
  if (brief.proof) return brief.proof.pieces[launch - 1]!.title;
  if (!brief.project) return brief.headline;
  if (brief.project.approach === 'trail') return (brief.event?.careful ? ['The open-studios invitation', 'The shared catalogue'] : ['The shared programme', 'The street map', 'The wayfinding signs'])[launch - 1]!;
  if (brief.project.approach === 'weekly-rhythm') return `Mara’s ${brief.festivalSet ? 'festival' : 'bakery'} card ${launch}`;
  return APPROACHES[brief.project.approach].artifact;
}

export interface WorkPiece {
  jobId: string;
  contractId: string;
  requestId: string;
  castId: string;
  brief: AuthoredBrief;
  offer: OfferSpec;
  price: number;
  launch: number;
  launches: number;
  deliveredAt: number | null;
  day: number | null;
  route: string;
  /** Delivered launches from this order as of the displayed minute. */
  deliveredInOrder: number;
  complete: boolean;
}
interface Index { contracts: Map<string, Contract>; requests: Map<string, Request>; starts: Map<string, CompanyState['events']> }
const indexes = new WeakMap<CompanyState, Index>();
function indexFor(state: CompanyState): Index {
  const existing = indexes.get(state);
  if (existing) return existing;
  const starts = new Map<string, CompanyState['events']>();
  for (const event of state.events) if (event.type === 'task_start' && event.jobId) starts.set(event.jobId, [...(starts.get(event.jobId) ?? []), event]);
  const index = { contracts: new Map(state.contracts.map(c => [c.id, c])), requests: new Map(state.requests.map(r => [r.id, r])), starts };
  indexes.set(state, index);
  return index;
}

function workerName(state: CompanyState, id: string | undefined): string {
  if (!id) return '';
  const present = state.resources.find(r => r.id === id);
  if (present) return present.name;
  // These engine-issued staff IDs remain in task events after the roster drops the person.
  if (id.startsWith('st')) return RULES.staff.student.name;
  if (id.startsWith('j')) return RULES.staff.junior.name;
  if (id.startsWith('t')) return RULES.staff.temp.name;
  return id.startsWith('ai') ? `AI desk ${id.slice(2)}` : id;
}

function pieceFor(state: CompanyState, job: Job, minute: number, index: Index): WorkPiece {
  const contract = index.contracts.get(job.contractId)!;
  const request = index.requests.get(contract.requestId)!;
  const deliveredInOrder = state.jobs.filter(j => j.contractId === contract.id && j.deliveredAt !== null && j.deliveredAt <= minute).length;
  const stages = (['brief', 'produce', 'finish', 'rework'] as const).flatMap(stage => {
    const workers = [...new Set((index.starts.get(job.id) ?? []).filter(e => e.stage === stage && e.minute <= minute).map(e => workerName(state, e.resourceId)))].filter(Boolean);
    return workers.length ? [`${stage === 'produce' ? 'Made' : stage === 'brief' ? 'Briefed' : stage === 'finish' ? 'Finished' : 'Reworked'} by ${workers.join(' and ')}`] : [];
  });
  const deliveredAt = job.deliveredAt !== null && job.deliveredAt <= minute ? job.deliveredAt : null;
  return { jobId: job.id, contractId: contract.id, requestId: request.id, castId: job.castId, brief: briefFor(request, contract.offer, state.config, contractProof(contract), state.rulesVersion), offer: contract.offer, price: contract.price, launch: job.launchIndex + 1, launches: contract.offer.launches, deliveredAt, day: deliveredAt === null ? null : Math.max(0, Math.ceil(deliveredAt / RULES.minutesPerDay) - 1), route: stages.join(' · ') || 'Production has not started', deliveredInOrder, complete: deliveredInOrder === contract.jobIds.length };
}

/** The same command tape always reconstructs the same pieces, with no final-state deliveries leaking into playback. */
export function portfolioAt(state: CompanyState, minute = state.minute): WorkPiece[] {
  const index = indexFor(state);
  return state.jobs.filter(j => j.deliveredAt !== null && j.deliveredAt <= minute && j.status === 'delivered').sort((a, b) => a.deliveredAt! - b.deliveredAt! || a.id.localeCompare(b.id)).map(j => pieceFor(state, j, minute, index));
}

/** Use only job IDs present in frameAt's current folders. Its stages are authoritative during playback. */
export function workFor(state: CompanyState, jobIds: string[], minute: number): WorkPiece[] {
  const ids = new Set(jobIds);
  const index = indexFor(state);
  return state.jobs.filter(j => ids.has(j.id)).map(j => pieceFor(state, j, minute, index));
}

export interface ProjectScene {
  milestones: { record: ProjectRecord; pieces: WorkPiece[] }[];
  night: { approach: ProjectApproach | null; mode: 'window' | 'preparing' | 'ready' | 'delivered' | 'partial' | 'failed' | 'compromised'; label: string; name: string; day: number; promised: number; pieces: WorkPiece[]; contributors: WorkPiece[]; careful: boolean; festival: boolean };
}

/** Scenes credit printed artifacts and frozen contributions. They make no claim about event attendance. */
export function projectSceneAt(state: CompanyState, minute = state.minute): ProjectScene {
  const pieces = portfolioAt(state, minute);
  const records = projectRecords(state, minute);
  const result = nightResult(state, minute);
  const project = result.project;
  const nightPieces = project ? pieces.filter(p => p.contractId === project.contract.id) : [];
  const complete = project && project.delivered === project.promised;
  const mode = !project ? 'window' : !result.settled ? complete ? 'ready' : 'preparing' : project.status === 'compromised' ? 'compromised' : complete ? 'delivered' : project.delivered ? 'partial' : 'failed';
  const label = mode === 'window' ? 'Studio window · this season’s work' : mode === 'preparing' ? `${result.calendar.name} · preparing for Day ${result.calendar.day + 1}` : mode === 'ready' ? `${result.calendar.name} · ready for Day ${result.calendar.day + 1}` : mode === 'partial' ? `${project!.delivered} of ${project!.promised} pieces delivered · programme unfinished` : mode === 'failed' ? `${result.calendar.name} · programme not delivered` : mode === 'compromised' ? `${result.calendar.name} · original brief delivered, extra change declined` : `${result.calendar.name} · ${project!.delivered} of ${project!.promised} pieces delivered`;
  return {
    milestones: records.filter(r => r.id !== 'lantern-night' && r.completedAt !== null).map(record => ({ record, pieces: pieces.filter(p => p.contractId === record.contract.id) })),
    night: { approach: project?.approach ?? null, mode, label, name: result.calendar.name, day: result.calendar.day, promised: project?.promised ?? 0, pieces: project ? nightPieces : pieces.slice(-3), contributors: result.contributors.filter(r => r.earned).flatMap(r => pieces.filter(p => p.contractId === r.contract.id)), careful: result.calendar.careful, festival: state.config.scenarioId === 'festival-week' },
  };
}
