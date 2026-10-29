import { careerStage } from '../../engine/career';
import { NEWS } from '../../engine/news';
import { ordinaryRequestLine } from '../../engine/ordinary';
import { CAST_BY_ID } from '../../engine/rules';
import { newsOptions } from '../../engine/sim';
import type { CareerStage, CompanyState, News, OfferSpec, Request } from '../../engine/types';

type Context = Pick<CompanyState, 'config' | 'rulesVersion'>;
type LaterStage = Exclude<CareerStage, 'opening'>;
export interface RequestCopy { headline: string; detail: string; request: string }
export interface NewsPresentation { title: string; text: string; options: { label: string; detail: string }[] }

function laterStage(context: Context): LaterStage | null {
  const stage = careerStage(context);
  return stage && stage !== 'opening' ? stage : null;
}

export const isContinuingCareer = (context: Context): boolean => laterStage(context) !== null;

export function laterStoryPayoff(context: Context, offer: string): string | null {
  if (!laterStage(context)) return null;
  if (offer === 'Tap takeover rescue') return 'Oscar’s updated tap takeover announcement is out. Big-night customers are hearing about the work.';
  if (offer === 'Second opening') return 'The announcement for the extra week at the Pocket Stage is out. Eli has more dates to fill.';
  return null;
}

const OSCAR: Record<LaterStage, RequestCopy & { title: string }> = {
  practice: {
    title: 'Oscar needs a new guest-tap announcement', headline: 'Guest taps at Oscar Brewing',
    detail: 'A new guest-brewery line-up for the tap takeover.',
    request: 'The guest brewery has changed its line-up for Oscar’s tap takeover. He needs a replacement announcement: one launch within two days, 900 credits. Deliver it and big-night customers hear about the work.',
  },
  legacy: {
    title: 'A cask swap changes Oscar’s tasting', headline: 'The guest-cask tasting',
    detail: 'The updated tasting list at Oscar Brewing.',
    request: 'A late cask swap has changed the tasting list for Oscar’s tap takeover. He needs the announcement updated: one launch within two days, 900 credits. Deliver it and big-night customers hear about the work.',
  },
  open: {
    title: 'An extra guest at Oscar’s tap takeover', headline: 'A guest-brewery night',
    detail: 'The expanded guest list at Oscar Brewing.',
    request: 'An extra guest brewery has joined Oscar’s tap takeover. The announcement needs a revision: one launch within two days, 900 credits. Deliver it and big-night customers hear about the work.',
  },
};
const ADA: Record<LaterStage, { title: string; text: string }> = {
  practice: { title: 'A guest stint for Ada', text: 'Bright Lantern has offered Ada three days of guest work. She can take the stint, or you can offer a bonus to keep her at this studio. Her careful making would be missing while she is away.' },
  legacy: { title: 'Bright Lantern needs Ada for a commission', text: 'Bright Lantern wants Ada for a short commission over the next three days. She is considering it. You can make room for the guest work or offer a bonus to keep her here.' },
  open: { title: 'A three-day offer for Ada', text: 'Bright Lantern has a three-day booking for Ada. She can take the outside work without a wage from this studio, or stay if you offer a bonus. Your current promises still need enough people to finish them.' },
};
const QUICKPRINT: Record<LaterStage, { title: string; text: string }> = {
  practice: { title: 'Quickprint pauses new orders', text: 'Quickprint is servicing its presses and cannot take its usual quick jobs. Some of those customers will try your window tomorrow. They still need an offer they like and room in your workday.' },
  legacy: { title: 'Quickprint has more work than it can finish', text: 'Quickprint’s queue is full, and it is turning away quick jobs. Some of those customers will try your window tomorrow. Taking them is a choice; your existing promises remain due.' },
  open: { title: 'Quickprint turns away late jobs', text: 'Quickprint has closed its order book while it clears a batch of work. Some small shops and last-minute customers will try your window tomorrow. They need prices and deadlines that work for both of you.' },
};
const LIST_OFFER: Record<LaterStage, { title: string; text: string }> = {
  practice: { title: 'A customer-list offer at season’s end', text: 'Bright Lantern will pay 1,500 credits for this season’s customer list. Selling hands over all unfinished work when you open, including anything you take on today. Those advances are refunded; the launches do not count as work served by your studio.' },
  legacy: { title: 'Keep or sell this season’s list', text: 'The season ends today, and Bright Lantern is offering 1,500 credits for its customer list. You can keep the list or sell it with every unfinished launch. Selling refunds those advances and passes the work to Bright Lantern when you open, including anything accepted today.' },
  open: { title: 'The end-of-season list offer', text: 'Bright Lantern is buying this season’s customer contacts for 1,500 credits. The offer includes all work still unfinished when you open, including new orders taken today. Their advances are refunded, and those launches are not served by this studio.' },
};

/** Later incidents cannot rely on news choices that continuation does not remember. */
export function newsPresentation(state: CompanyState, news: News): NewsPresentation {
  const ctx = { s: state, day: news.day, ...(news.castId ? { castId: news.castId, castName: CAST_BY_ID[news.castId]?.name ?? news.castId } : {}) };
  const card = NEWS[news.card];
  const presentation = { title: card.title(ctx), text: card.text(ctx), options: newsOptions(state, news).map(({ label, detail }) => ({ label, detail })) };
  const stage = laterStage(state);
  if (!stage) return presentation;
  if (news.card === 'oscarRescue') return { ...presentation, title: OSCAR[stage].title, text: OSCAR[stage].request };
  if (news.card === 'poach') return { ...presentation, ...ADA[stage], options: presentation.options.map((option, i) => i === 0 ? { ...option, label: 'Let Ada take the guest work' } : option) };
  if (news.card === 'blackout') return { ...presentation, ...QUICKPRINT[stage] };
  if (news.card === 'lastOffer') return { ...presentation, ...LIST_OFFER[stage], options: presentation.options.map((option, i) => i === 0 ? { ...option, label: 'Keep this season’s list' } : option) };
  if (news.card === 'rival') return { ...presentation, title: 'The printer two doors down is cutting prices' };
  if (news.card === 'eliExtended') return { ...presentation, title: 'Eli adds a week to the current run', text: 'The current Pocket Stage run is being extended. Eli wants an announcement for the extra week: one careful launch within two days, 1,500 credits.' };
  return presentation;
}

const RECURRING: Record<string, Partial<Record<number, RequestCopy>>> = {
  sam: {
    1: { headline: 'Two streets of stalls', detail: 'The next Night Market spreads across two streets.', request: 'The next market has stalls across two streets. Help people find their way around.' },
  },
  ravi: {
    0: { headline: 'This week at Hillside', detail: 'Climbing sessions at Hillside Climbing Gym.', request: 'We have a week of climbing sessions to fill. Make people want to come along.' },
    1: { headline: 'A new problem', detail: 'Fresh routes on the bouldering wall at Hillside.', request: 'Fresh routes on the bouldering wall. Make people want to try them.' },
    2: { headline: 'The Hillside climbing meet', detail: 'A competition at Hillside Climbing Gym.', request: 'A competition at the gym. Give the event a proper launch.' },
  },
  oscar: {
    0: { headline: 'The taps this weekend', detail: 'Seasonal pours at Oscar Brewing.', request: 'A new cask is on this weekend. We need a launch to bring people into the taproom.' },
    1: { headline: 'A festival brew', detail: 'Oscar Brewing. A beer for the festival.', request: 'We have a beer ready for the festival. Make it an occasion.' },
    2: { headline: 'Inside Oscar Brewing', detail: 'A weekend of brewery tours.', request: 'Brewery tours this weekend. Give people a reason to book a place.' },
  },
  florence: {
    1: { headline: 'Frames, restored', detail: 'Frame restoration at Florence Framing.', request: 'Frame restoration. Quietly, precisely. Let people know about the work.' },
  },
  idris: {
    1: { headline: 'Fit and finish', detail: 'Careful work from Idris Tailoring.', request: 'A piece about the shop’s tailoring. Understated, please.' },
    2: { headline: 'Work at the cutting table', detail: 'The craft of tailoring, passed on at the bench.', request: 'A piece about work at the cutting table. Say it with care.' },
  },
  gus: {
    1: { headline: 'Keys cut on the corner', detail: 'Key cutting at Gus Hardware.', request: 'Could you give our key-cutting service a quick mention?' },
  },
  finn: {
    2: { headline: 'A day with the bike club', detail: 'A club ride through the neighbourhood.', request: 'We are getting the club together for a ride. Give everyone a reason to join us.' },
  },
  lorna: {
    0: { headline: 'New work from the kiln', detail: 'A studio weekend at Lorna Pottery.', request: 'New work is ready from the kiln. Invite people to the studio this weekend.' },
  },
  agnes: {
    1: { headline: 'Books, gently repaired', detail: 'Book repairs at Agnes Bindery.', request: 'A piece about repairing old books. Gently, please.' },
  },
  tobias: {
    2: { headline: 'A violin from the bench', detail: 'Instrument making at Tobias Violins.', request: 'A violin is ready from the workshop. Say it well.' },
  },
  malik: {
    2: { headline: 'Aged in the cheese room', detail: 'Cheese aged at Malik Cheese Room.', request: 'A piece about cheese aged in our own room. Say it plainly, say it right.' },
  },
};

/** Only fallback display copy changes. Approved and retained artwork remains exact. */
export function laterRequestCopy(context: Context, request: Request, offer?: OfferSpec): RequestCopy | null {
  const stage = laterStage(context);
  if (!stage || request.project || ordinaryRequestLine(request)) return null;
  if (request.source === 'news') {
    if (offer?.name === 'Tap takeover rescue') return OSCAR[stage];
    if (offer?.name === 'Second opening') return { headline: 'An extra week at the Pocket Stage', detail: 'The current run has an extra week.', request: 'Eli needs an announcement for the extra week: one careful launch within two days, 1,500 credits.' };
    return null;
  }
  return RECURRING[request.castId]?.[request.lineIndex] ?? null;
}
