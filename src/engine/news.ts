// Street news: a seeded card on some mornings, each with a few priced options and a stated default (option 0).
// Cards are authored, fictional and legible. Effects only use levers the rules already define.
import { RULES } from './rules';
import type { CompanyState, NewsCardId, Need, OfferSpec, SegmentId } from './types';

/** When an effect lands: 0 = today, 1 = tomorrow. */
type When = 0 | 1;

export type Effect =
  | { k: 'cost'; amount: number; note: string }
  /** Someone off from `when` for `days` days (default 1). */
  | { k: 'absent'; who: string; when: When; paid: boolean; days?: number }
  | { k: 'temp'; when: When }
  | { k: 'wtp'; segment: SegmentId; percent: number; days: number }
  /** Extra neighbours of a type from tomorrow, for `days` days (default 1). */
  | { k: 'arrivals'; segment: SegmentId; count: number; days?: number }
  | { k: 'aiCost'; delta: number }
  | { k: 'outage' }
  | { k: 'noOutage' }
  /** Tomorrow, this percent of ordinary walk-ins stay home. */
  | { k: 'quiet'; percent: number }
  | { k: 'rep'; segment: SegmentId; delta: number }
  | { k: 'request'; castId: string; segment: SegmentId; need: Need; offer: OfferSpec; repOnDelivery?: number }
  | { k: 'student' }
  | { k: 'loan'; amount: number; interest: number }
  /** Every launch still in the works goes to another studio: refunded, never served. */
  | { k: 'handover' };

export interface NewsOption {
  label: string;
  detail: string;
  effects: Effect[];
}

export interface NewsContext {
  s: CompanyState;
  day: number;
  /** A cast member the card is about, chosen when the card is drawn. */
  castId?: string;
  castName?: string;
}

export interface NewsCard {
  id: NewsCardId;
  title: (c: NewsContext) => string;
  text: (c: NewsContext) => string;
  /** Cards that need a particular neighbour name the segment to pick from, or a rule to find one. */
  cast?: (s: CompanyState) => string[];
  eligible: (s: CompanyState, day: number) => boolean;
  options: (c: NewsContext) => NewsOption[];
  /** Story beats are not drawn: they take the morning's news as soon as what you did for a regular makes them true. */
  story?: boolean;
}

/** Deliveries completed for one neighbour (whole orders). */
export function deliveredFor(s: CompanyState, castId: string): number {
  return s.contracts.filter((c) => c.castId === castId && c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered')).length;
}

/** Neighbours whose whole order was delivered. */
const servedCount = (s: CompanyState): number => s.contracts.filter((c) => c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered')).length;

const hasAi = (s: CompanyState) => s.staffing.aiTier !== 'none';
const lastDay = RULES.days - 1;

export const NEWS: Record<NewsCardId, NewsCard> = {
  crossroads: {
    id: 'crossroads',
    story: true,
    title: () => 'What will Lantern Works be known for?',
    text: () => 'Three days in, the street is deciding what kind of studio you are. Pick what to be known for over the next four days. Each choice brings more of one kind of neighbour and costs you with another.',
    eligible: (_s, day) => day === 3,
    options: () => [
      { label: 'Stay as you are', detail: 'Nothing changes.', effects: [] },
      {
        label: 'The big-night studio (300)',
        detail: 'Posters in every venue: one extra big-moment neighbour a day, paying 10% more. Small shops pay 10% less.',
        effects: [
          { k: 'cost', amount: 300, note: 'Venue posters' },
          { k: 'arrivals', segment: 'moment', count: 1, days: 4 },
          { k: 'wtp', segment: 'moment', percent: 10, days: 4 },
          { k: 'wtp', segment: 'small', percent: -10, days: 4 },
        ],
      },
      {
        label: 'The quick shop on the corner (200)',
        detail: 'A sign in the window: two extra small shops a day. Big nights pay 10% less: they want a studio that takes its time.',
        effects: [
          { k: 'cost', amount: 200, note: 'Window sign' },
          { k: 'arrivals', segment: 'small', count: 2, days: 4 },
          { k: 'wtp', segment: 'moment', percent: -10, days: 4 },
        ],
      },
      {
        label: 'The careful hand (free)',
        detail: 'Word of mouth among the careful shops: one extra careful voice a day, paying 10% more. Last-minute jobs pay 15% less.',
        effects: [
          { k: 'arrivals', segment: 'careful', count: 1, days: 4 },
          { k: 'wtp', segment: 'careful', percent: 10, days: 4 },
          { k: 'wtp', segment: 'rush', percent: -15, days: 4 },
        ],
      },
    ],
  },
  maraGrows: {
    id: 'maraGrows',
    story: true,
    title: () => "Mara's bakery is growing",
    text: () => 'You have launched two things for Moonrise Bakery and the queue now goes round the corner. Mara wants something regular: three launches, every three days, each ready within two. She offers 1,050 up front.',
    eligible: (s, day) => day <= lastDay - 6 && deliveredFor(s, 'mara') >= 2 && !s.lostCast.includes('mara'),
    options: () => [
      { label: 'Not now', detail: 'Mara understands. She will still drop by.', effects: [] },
      {
        label: 'Hear her out',
        detail: 'Her order joins the queue at the window.',
        effects: [{ k: 'request', castId: 'mara', segment: 'small', need: 'simple', offer: { name: "Mara's regular", launches: 3, spacingDays: 3, turnaroundDays: 2, scope: 'simple', style: 'custom', price: 1050 } }],
      },
    ],
  },
  eliExtended: {
    id: 'eliExtended',
    story: true,
    title: () => "Eli's show has been extended",
    text: () => 'The Pocket Stage run sold out after your launch. A second week is on, and Eli wants it to feel like an opening again: one careful launch within two days, 1,500 credits.',
    eligible: (s, day) => day <= lastDay - 2 && deliveredFor(s, 'eli') >= 1 && !s.lostCast.includes('eli'),
    options: () => [
      { label: 'Not this time', detail: 'Eli finds someone else.', effects: [] },
      {
        label: 'Hear Eli out',
        detail: 'The order joins the queue at the window.',
        effects: [{ k: 'request', castId: 'eli', segment: 'moment', need: 'nuanced', offer: { name: 'Second opening', launches: 1, spacingDays: 3, turnaroundDays: 2, scope: 'any', style: 'custom', price: 1500 } }],
      },
    ],
  },
  hugoRetires: {
    id: 'hugoRetires',
    story: true,
    title: () => 'Hugo is retiring',
    text: () => 'After forty years Hugo is handing his bench to an apprentice. He asks for a quiet send-off and offers 500, well under your usual price. The careful shops on the street will hear how you treat him.',
    eligible: (s, day) => day <= lastDay - 3 && deliveredFor(s, 'hugo') >= 1 && !s.lostCast.includes('hugo'),
    options: () => [
      { label: 'Wish him well', detail: 'Nothing changes.', effects: [] },
      {
        label: 'Do it for 500',
        detail: 'His order joins the queue. Deliver it and careful voices will think better of you.',
        effects: [
          { k: 'request', castId: 'hugo', segment: 'careful', need: 'nuanced', offer: { name: 'A quiet send-off', launches: 1, spacingDays: 3, turnaroundDays: 3, scope: 'any', style: 'custom', price: 500 }, repOnDelivery: 8 },
        ],
      },
    ],
  },
  clemTen: {
    id: 'clemTen',
    story: true,
    title: () => 'Clem Jazz Bar turns ten',
    text: () => 'Your launch for Clem filled the room. Now the bar turns ten on Saturday, and Clem wants it to feel like the first night again: one careful launch within three days, 1,200 credits.',
    eligible: (s, day) => day <= lastDay - 3 && deliveredFor(s, 'clem') >= 1 && !s.lostCast.includes('clem'),
    options: () => [
      { label: 'Send a card instead', detail: 'Clem understands.', effects: [] },
      {
        label: 'Hear Clem out',
        detail: 'The order joins the queue at the window.',
        effects: [{ k: 'request', castId: 'clem', segment: 'moment', need: 'nuanced', offer: { name: 'Ten years of Clem', launches: 1, spacingDays: 3, turnaroundDays: 3, scope: 'any', style: 'custom', price: 1200 } }],
      },
    ],
  },
  oscarRescue: {
    id: 'oscarRescue',
    story: true,
    title: () => "Bright Lantern dropped Oscar's launch",
    text: () =>
      "Bright Lantern's AI desk sent the launch for Oscar Brewing's tap takeover to the wrong mailing list. Oscar is at your window: one launch, ready within two days, 900 credits. Save his night and every big-night crowd on the street hears whose launch did it.",
    eligible: (s, day) => day >= 4 && day <= 6 && !s.lostCast.includes('oscar'),
    options: () => [
      { label: 'Not your problem', detail: 'Oscar tries somewhere else.', effects: [] },
      {
        label: 'Help Oscar',
        detail: 'His order joins the queue. Deliver it and big-night customers think better of you.',
        effects: [{ k: 'request', castId: 'oscar', segment: 'moment', need: 'simple', offer: { name: 'Tap takeover rescue', launches: 1, spacingDays: 3, turnaroundDays: 2, scope: 'any', style: 'custom', price: 900 }, repOnDelivery: 8 }],
      },
    ],
  },
  streetParty: {
    id: 'streetParty',
    story: true,
    title: () => 'The street wants you for the party',
    text: (c) =>
      `${servedCount(c.s)} neighbours served so far, and the street association has noticed. They want Lantern Works to launch the summer street party: one big launch within three days, 1,600 credits. Everyone you have served will be there.`,
    eligible: (s, day) => day >= 6 && day <= lastDay - 3 && servedCount(s) >= 10,
    options: () => [
      { label: 'Too busy this week', detail: 'Another studio gets the party.', effects: [] },
      {
        label: 'Take the party',
        detail: 'The order joins the queue. Deliver it and the whole street talks about you.',
        effects: [{ k: 'request', castId: 'association', segment: 'moment', need: 'simple', offer: { name: 'Summer street party', launches: 1, spacingDays: 3, turnaroundDays: 3, scope: 'any', style: 'custom', price: 1600 }, repOnDelivery: 10 }],
      },
    ],
  },
  poach: {
    id: 'poach',
    story: true,
    title: () => 'Bright Lantern wants Ada',
    text: () =>
      "Bright Lantern has offered Ada a job, and she is tempted. She could try it for the next three days and decide, or you could give her a reason to stay. Ada does the careful making nobody else here can.",
    eligible: (_s, day) => day >= 6 && day <= 8,
    options: () => [
      { label: 'Let her try it', detail: 'Ada is at Bright Lantern for the next three days, unpaid. One pair of hands fewer, 400 a day saved.', effects: [{ k: 'absent', who: 'h1', when: 1, paid: false, days: 3 }] },
      { label: 'Give Ada a bonus to stay (600)', detail: 'She stays. Nothing else changes.', effects: [{ k: 'cost', amount: 600, note: "Ada's bonus" }] },
    ],
  },
  blackout: {
    id: 'blackout',
    story: true,
    title: () => 'Quickprint has gone dark',
    text: () =>
      "The big printers at Quickprint, the print shop by the square, broke down overnight. It is shut for the rest of the week, and its customers are on the street looking for someone. Tomorrow some of them will try your window.",
    // Quick-job customers: the two streets bound by hours, not Careful Season, where care is the limit.
    eligible: (s, day) => day >= 8 && day <= lastDay - 2 && s.config.scenarioId !== 'bespoke-rush',
    options: () => [
      {
        label: 'Let them come',
        detail: 'Four more neighbours tomorrow: small shops and last-minute jobs, used to quick work. They still need an offer they like and hours to fit.',
        effects: [
          { k: 'arrivals', segment: 'small', count: 2 },
          { k: 'arrivals', segment: 'rush', count: 2 },
        ],
      },
      {
        label: `Let them come, with ${RULES.staff.temp.name} booked for tomorrow (${RULES.staff.temp.cost})`,
        detail: `The same four neighbours, and ${RULES.staff.temp.name} the temp works tomorrow with full skills.`,
        effects: [
          { k: 'arrivals', segment: 'small', count: 2 },
          { k: 'arrivals', segment: 'rush', count: 2 },
          { k: 'temp', when: 1 },
        ],
      },
      { label: "Put a 'full' sign up", detail: "Nothing changes. Quickprint's customers go elsewhere.", effects: [] },
    ],
  },
  lastOffer: {
    id: 'lastOffer',
    story: true,
    title: () => 'Bright Lantern makes an offer',
    text: () =>
      "On the last morning, Bright Lantern's owner leans on your counter: 1,500 credits for Lantern Works' customer list, today, no questions. Ada has gone very quiet. Tomas is holding the stapler like it might be needed.",
    eligible: (_s, day) => day === lastDay,
    // Selling is a trade, not free money: whatever is still in the works goes with the list, refunded and unserved.
    options: ({ s }) => {
      const open = s.jobs.filter((j) => j.status === 'active' || j.status === 'scheduled');
      const value = open.reduce((a, j) => a + j.allocation, 0);
      const people = new Set(open.map((j) => j.contractId)).size;
      return [
        { label: 'Show them the door', detail: 'Nothing changes. Your customers stay yours.', effects: [] },
        {
          label: 'Sell the list (+1,500)',
          detail: people
            ? `1,500 credits now, and Bright Lantern takes over everything in the works when you open: ${people === 1 ? '1 neighbour' : `${people} neighbours`} so far, ${value.toLocaleString('en-GB')} cr refunded, none served by you.`
            : '1,500 credits now, and Bright Lantern takes over anything you take on today.',
          effects: [{ k: 'cost', amount: -1500, note: 'Customer list sold to Bright Lantern' }, { k: 'handover' }],
        },
      ];
    },
  },
  ill: {
    id: 'ill',
    title: () => 'Tomas has a cold',
    text: () => 'He sounds terrible on the phone and insists he is fine, between sneezes. He can stay home today, or you can book a temp to cover.',
    eligible: () => true,
    options: () => [
      { label: 'Tomas stays home', detail: 'Tomas is off today, on full pay.', effects: [{ k: 'absent', who: 'h2', when: 0, paid: true }] },
      {
        label: `Book a temp (${RULES.staff.temp.cost})`,
        detail: `${RULES.staff.temp.name} covers today with full skills.`,
        effects: [{ k: 'absent', who: 'h2', when: 0, paid: true }, { k: 'temp', when: 0 }],
      },
    ],
  },
  gazette: {
    id: 'gazette',
    title: () => 'The Gazette is writing about studios',
    text: () => 'Friday\'s paper wants one studio on the street. Readers tend to be planning a big night or something careful. Tomas has already chosen his best side for the photograph.',
    eligible: (_s, day) => day <= lastDay - 2,
    options: () => [
      { label: 'Not this week', detail: 'Nothing changes.', effects: [] },
      {
        label: 'Buy a half page (300)',
        detail: 'Three extra neighbours tomorrow: two big moments, one careful voice.',
        effects: [
          { k: 'cost', amount: 300, note: 'Gazette half page' },
          { k: 'arrivals', segment: 'moment', count: 2 },
          { k: 'arrivals', segment: 'careful', count: 1 },
        ],
      },
      {
        label: 'Ada gives an interview',
        detail: 'Free, but Ada is out of the studio all day. Two extra neighbours tomorrow.',
        effects: [
          { k: 'absent', who: 'h1', when: 0, paid: true },
          { k: 'arrivals', segment: 'moment', count: 1 },
          { k: 'arrivals', segment: 'careful', count: 1 },
        ],
      },
    ],
  },
  bulk: {
    id: 'bulk',
    title: () => 'The festival committee has a big order',
    text: () => 'Four quick launches, one every two days, each ready within two days. 1,600 credits up front. They are at the window now.',
    eligible: (_s, day) => day <= lastDay - 7,
    options: () => [
      { label: 'Say you are full', detail: 'They go elsewhere.', effects: [] },
      {
        label: 'Hear them out',
        detail: 'Their order joins the queue at the window. You can still say no.',
        effects: [
          {
            k: 'request',
            castId: 'committee',
            segment: 'small',
            need: 'simple',
            offer: { name: 'Festival bundle', launches: 4, spacingDays: 2, turnaroundDays: 2, scope: 'simple', style: 'custom', price: 1600 },
          },
        ],
      },
    ],
  },
  rival: {
    id: 'rival',
    title: () => 'A pop-up printer opened two doors down',
    text: () => 'They are undercutting small jobs for the next three days, and have put a sign in the window that says so in very large letters. Small shops will expect lower prices from you too.',
    eligible: () => true,
    options: () => [
      { label: 'Hold your prices', detail: 'Small shops will pay 15% less for three days.', effects: [{ k: 'wtp', segment: 'small', percent: -15, days: 3 }] },
      {
        label: 'Send loyalty postcards (200)',
        detail: 'Your regulars stay closer: small shops pay only 5% less for three days.',
        effects: [
          { k: 'cost', amount: 200, note: 'Loyalty postcards' },
          { k: 'wtp', segment: 'small', percent: -5, days: 3 },
        ],
      },
    ],
  },
  aiPrice: {
    id: 'aiPrice',
    title: () => 'The AI desk provider is raising prices',
    text: (c) =>
      hasAi(c.s) ? 'From tomorrow each AI desk costs 80 more a day, unless you lock in a season deal now.' : 'From tomorrow an AI desk costs 80 more a day. You have none, but you might want one later.',
    eligible: (_s, day) => day <= lastDay - 3,
    options: () => [
      { label: 'Accept the rise', detail: '80 more per desk, per day, for the rest of the season.', effects: [{ k: 'aiCost', delta: 80 }] },
      { label: 'Lock in a season deal (450)', detail: 'Pay now; prices stay as they are.', effects: [{ k: 'cost', amount: 450, note: 'AI desk season deal' }] },
    ],
  },
  market: {
    id: 'market',
    title: () => 'Market day tomorrow',
    text: () => 'The square fills with stalls tomorrow. More small shops and last-minute jobs than usual will pass the window. Tomas has offered to run a stall, mostly for the free samples.',
    eligible: (_s, day) => day <= lastDay - 1,
    options: () => [
      {
        label: 'Business as usual',
        detail: 'Two extra small shops and one rush job tomorrow.',
        effects: [
          { k: 'arrivals', segment: 'small', count: 2 },
          { k: 'arrivals', segment: 'rush', count: 1 },
        ],
      },
      {
        label: 'Run a stall (250, Tomas there all day)',
        detail: 'Four extra small shops and two rush jobs tomorrow, but Tomas is at the stall, not the studio.',
        effects: [
          { k: 'cost', amount: 250, note: 'Market stall' },
          { k: 'absent', who: 'h2', when: 1, paid: true },
          { k: 'arrivals', segment: 'small', count: 4 },
          { k: 'arrivals', segment: 'rush', count: 2 },
        ],
      },
    ],
  },
  maintenance: {
    id: 'maintenance',
    title: () => 'AI maintenance tomorrow',
    text: () => 'The provider says the AI desk will be down all day tomorrow, unless you pay for priority access. Ada says she will believe it when she sees it.',
    eligible: (s, day) => hasAi(s) && day <= lastDay - 1,
    options: () => [
      { label: 'Live with it', detail: 'No AI desk tomorrow. People make everything.', effects: [{ k: 'outage' }] },
      { label: 'Pay for priority (180)', detail: 'The desk stays up.', effects: [{ k: 'cost', amount: 180, note: 'Priority AI access' }, { k: 'noOutage' }] },
    ],
  },
  rain: {
    id: 'rain',
    title: () => 'Heavy rain tomorrow',
    text: () => 'Half as many people will be out. A quiet day is a chance to catch up, or to save a wage. Ada says it is a day for catching up; Tomas says it is a day for soup.',
    eligible: (_s, day) => day <= lastDay - 1,
    options: () => [
      { label: 'Open as normal', detail: 'Fewer neighbours tomorrow; everyone works.', effects: [{ k: 'quiet', percent: 50 }] },
      {
        label: 'Give Tomas the day off',
        detail: `Saves his ${RULES.humanDailyCost} wage tomorrow. One pair of hands fewer.`,
        effects: [
          { k: 'quiet', percent: 50 },
          { k: 'absent', who: 'h2', when: 1, paid: false },
        ],
      },
    ],
  },
  student: {
    id: 'student',
    title: () => 'A design student wants to help',
    text: () =>
      `${RULES.staff.student.name} can brief and finish for ${RULES.staff.student.days} days from tomorrow, slowly, for ${RULES.staff.student.dailyCost} a day, and has brought a portfolio and a very large scarf. No making: that still needs Ada, Tomas or an AI desk.`,
    eligible: (s, day) => day <= lastDay - 2 && !s.resources.some((r) => r.role === 'junior' && r.name === RULES.staff.student.name),
    options: () => [
      { label: 'Not now', detail: 'Nothing changes.', effects: [] },
      { label: `Take ${RULES.staff.student.name} on`, detail: `${RULES.staff.student.dailyCost} a day for ${RULES.staff.student.days} days.`, effects: [{ k: 'student' }] },
    ],
  },
  premiere: {
    id: 'premiere',
    title: (c) => `${c.castName} needs it tonight`,
    text: (c) => `${c.castName} has a premiere tonight and nobody to announce it. One careful launch, same day, 1,400 credits. They are at the window.`,
    cast: (s) => ['eli', 'mina', 'clem', 'yara'].filter((id) => !s.lostCast.includes(id) && s.requests.filter((r) => r.castId === id).length < RULES.maxVisits),
    eligible: () => true,
    options: (c) => [
      { label: 'Not today', detail: 'They find someone else.', effects: [] },
      {
        label: 'Hear them out',
        detail: 'Their order joins the queue. Same-day careful work needs both of you most of the day.',
        effects: [
          {
            k: 'request',
            castId: c.castId ?? 'eli',
            segment: 'moment',
            need: 'nuanced',
            offer: { name: 'Premiere rush', launches: 1, spacingDays: 3, turnaroundDays: 1, scope: 'any', style: 'custom', price: 1400 },
          },
        ],
      },
    ],
  },
  loan: {
    id: 'loan',
    title: () => 'The bank offers a credit line',
    text: () => '2,000 credits now, 2,300 repaid on the last morning of the season. The bank manager wore a tie with lanterns on it. Ada thinks that is a bad sign.',
    eligible: (s, day) => s.cash < 2000 && day <= lastDay - 2 && !s.modifiers.some((m) => m.kind === 'repay'),
    options: () => [
      { label: 'No thanks', detail: 'Nothing changes.', effects: [] },
      { label: 'Take the 2,000', detail: 'Repay 2,300 on the last morning.', effects: [{ k: 'loan', amount: 2000, interest: 300 }] },
    ],
  },
  referral: {
    id: 'referral',
    title: (c) => `${c.castName} has been telling friends`,
    text: (c) => `${c.castName} was happy with your work and keeps mentioning the studio, at some length. Two friends plan to drop by tomorrow.`,
    cast: (s) => {
      const delivered = new Map<string, number>();
      for (const c of s.contracts) if (c.jobIds.every((id) => s.jobs.find((j) => j.id === id)?.status === 'delivered')) delivered.set(c.castId, (delivered.get(c.castId) ?? 0) + 1);
      return [...delivered.keys()].filter((id) => id !== 'committee' && !s.lostCast.includes(id)).sort();
    },
    eligible: (_s, day) => day <= lastDay - 1,
    options: (c) => {
      const seg = (c.s.contracts.find((x) => x.castId === c.castId)?.segment ?? 'small') as SegmentId;
      return [
        { label: 'Say thanks', detail: 'Two of their friends come by tomorrow.', effects: [{ k: 'arrivals', segment: seg, count: 2 }] },
        {
          label: 'Send a thank-you gift (150)',
          detail: 'Two friends tomorrow, and word spreads among their kind of shop.',
          effects: [
            { k: 'cost', amount: 150, note: 'Thank-you gift' },
            { k: 'arrivals', segment: seg, count: 2 },
            { k: 'rep', segment: seg, delta: 10 },
          ],
        },
      ];
    },
  },
};
