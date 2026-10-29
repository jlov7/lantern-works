// Authored, fictional assumptions. None of this is observed business data.
import type { CastMember, OfferSpec, Scenario, Segment, SegmentId } from './types';
import { CURRENT_RULES_VERSION } from './versions';

export const RULES = {
  version: CURRENT_RULES_VERSION,
  tapeVersion: 'lantern-tape-3',
  days: 12,
  minutesPerDay: 480,
  humanShift: 360,
  aiShift: 480,
  initialCash: 3000,
  humans: [
    { id: 'h1', name: 'Ada' },
    { id: 'h2', name: 'Tomas' },
  ],
  /**
   * Who makes what. Ada is careful: she takes 110% of the production time, and tricky briefs she makes are redone a
   * quarter as often. Tomas is quick: he makes in 85% of the time, but tricky briefs he makes are redone half as often
   * again. The player can choose who makes a tricky brief when taking it; otherwise whoever is free makes it. Ada
   * takes on one chosen job at a time, so two tricky buyers in a morning compete for her.
   */
  makers: {
    h1: { trait: 'careful', producePercent: 110, trickyReworkPercent: 25, slots: 1 },
    h2: { trait: 'quick', producePercent: 85, trickyReworkPercent: 150 },
  } as Record<string, { trait: string; producePercent: number; trickyReworkPercent: number; slots?: number }>,
  humanDailyCost: 400,
  shopDailyCost: 120,
  ai: {
    none: { slots: 0, dailyCost: 0 },
    solo: { slots: 1, dailyCost: 220 },
    duo: { slots: 2, dailyCost: 400 },
  },
  effort: {
    brief: 75,
    templatedBrief: 35,
    finish: 60,
    rework: 120,
    kitSetup: 240,
    produce: {
      human: { simple: 180, nuanced: 300 },
      ai: { simple: 30, nuanced: 75 },
    },
  },
  /** Production effort with a ready template kit, percent of normal. */
  templatePercent: 50,
  reworkBp: {
    // People's work needs redoing often enough to be a risk worth weighing (the harsh panel: "Fits" was never wrong,
    // so taking a job was never a bet). AI drafts stay riskier.
    human: { simple: 800, nuanced: 1600 },
    ai: { simple: 1000, nuanced: 5000 },
  },
  missedFeePercent: 20,
  maxMenu: 2,
  /** A neighbour visits at most this many times a season. */
  maxVisits: 4,
  staff: {
    junior: { name: 'Noor', dailyCost: 250, speedPercent: 150 },
    /** A temp does not know the studio's ways: what they make is redone this much more often (percent). */
    temp: { name: 'Sol', cost: 350, reworkPercent: 200 },
    student: { name: 'Remi', dailyCost: 100, speedPercent: 175, days: 4 },
    /** Overtime keeps everyone until 5pm, per person, and not two days running. */
    overtimePerPerson: 120,
    /** The day after overtime people are tired: work they start takes this share of the usual time. The harsh panel
     * read overtime as a free rescue. */
    tiredPercent: 110,
  },
  upgrades: {
    library: { cost: 800, label: 'Brief library', detail: 'Templated briefs take 20 minutes instead of 35.' },
    checklist: { cost: 700, label: 'Finishing checklist', detail: 'Halves the chance that people-made work needs rework.' },
    styleGuide: { cost: 600, label: 'AI style guide', detail: 'Halves the chance that AI-drafted work needs rework.' },
  },
  libraryBrief: 20,
  flyers: { cost: 250, count: 2 },
  /**
   * Counter-offers (GD-11): a neighbour put off only by price, who would pay at least minPercent of it, names the
   * price they would pay. Taking it gets round: that kind of customer expects wtpDropPercent less for `days` days.
   */
  counter: { minPercent: 85, wtpDropPercent: 6, days: 3 },
  rep: {
    min: -30,
    max: 50,
    perLevel: 12,
    delivered: 2,
    missed: -10,
    declinedBuyer: -1,
    ignoredBuyer: -2,
    amends: 8,
    /** Each night every reputation drifts this much toward zero. */
    decay: 1,
    wtpPerLevel: 4,
    /** Chance per level, in basis points, of an extra word-of-mouth neighbour of that type each morning. */
    wordBpPerLevel: 1500,
    /** Chance per negative level that an ordinary arrival of that type stays away. */
    skipBpPerLevel: 2500,
  },
  /** Chance in basis points that a morning from day 3 to day 11 brings street news. Every morning: the panel read quiet middles as routine. */
  newsBp: 10000,
  /** Now and then a launch delivered today takes off: shared all over the street, it brings neighbours of its kind tomorrow. */
  takeoff: { bp: 2500, max: 3, arrivals: 2, rep: 6 },
  /** Most mornings from Day 2 (80%), one neighbour in a hurry brings a same-day order at 230% of the window price: taking them spends
   * today's hours that could serve two ordinary buyers. The panel found buyers interchangeable ("take what fits"). */
  rushPremium: { bp: 8000, percent: 230 },
  /** A neighbour ringing ahead for tomorrow: as many launches of their pick from the window as come to about `minutes`
   * of hand-making (1 to `maxLaunches`), at `percent` of its price per launch, each due `turnaroundDays` after tomorrow's
   * start. Delivered in full, the big night is talked about: `rep` with big-moment neighbours (a level is 12), so more
   * of them come and pay more. Tomorrow's hours now, against buyers later in the season. */
  booking: { bp: 5000, minutes: 900, maxLaunches: 4, percent: 140, turnaroundDays: 2, rep: 12 },
  /** Today's pace, chosen each morning: work people start that day takes this share of the usual time. A push makes
   * any making (the AI desk's too) need redoing this share as often, and not two days running; care applies to
   * people's own making. The panel read mornings as "take what fits"; pace makes fitting a choice. */
  pace: { push: { effortPercent: 85, reworkPercent: 300 }, careful: { effortPercent: 110, reworkPercent: 34 } },
  /** From Day 2, half of days a neighbour rings late morning with a change to a launch due tonight: 1.5
   * to 3 hours of finishing. If that puts the promise at risk the day stops for a call. The harsh panel: "never close to
   * losing anything", "misses felt like bad luck, not a near miss". */
  snag: { bp: 5000, fromDay: 1, minutes: [90, 180], from: 90, to: 300 },
  /** Ringing a neighbour for a day's grace: this share of the launch back as a discount, and a small dent in word of mouth. */
  ring: { discountPercent: 25, rep: -3 },
  /** The rent review (each street sets its day and target): under the target, rent and supplies cost this much more a day. */
  rentRise: 180,
  /** Shipping on time without the change asked for: no money back, but that neighbour won't buy again and word of mouth suffers. */
  cut: { rep: -6 },
  wtpJitterPercent: 15,
  limits: {
    launches: [1, 4],
    spacingDays: [2, 6],
    turnaroundDays: [1, 5],
    price: [50, 5000],
    nameLength: 28,
  },
} as const;

export type Rules = typeof RULES;

export const SEGMENTS: Record<SegmentId, Segment> = {
  small: {
    id: 'small',
    label: 'Small and often',
    wantsLaunches: 3,
    valuePerLaunch: 340,
    extraLaunchPercent: 20,
    maxWaitDays: 2,
    care: 'low',
    nuancedBp: 0,
  },
  moment: {
    id: 'moment',
    label: 'One big moment',
    wantsLaunches: 1,
    valuePerLaunch: 1080,
    extraLaunchPercent: 15,
    maxWaitDays: 4,
    care: 'medium',
    nuancedBp: 4000,
  },
  careful: {
    id: 'careful',
    label: 'A careful voice',
    wantsLaunches: 1,
    valuePerLaunch: 980,
    extraLaunchPercent: 10,
    maxWaitDays: 5,
    care: 'high',
    nuancedBp: 8000,
  },
  rush: {
    id: 'rush',
    label: 'Last minute',
    wantsLaunches: 1,
    valuePerLaunch: 480,
    extraLaunchPercent: 10,
    maxWaitDays: 1,
    care: 'low',
    nuancedBp: 1000,
  },
};

export const PRESETS: Record<'bespoke' | 'club' | 'launchlet', OfferSpec> = {
  bespoke: {
    name: 'Bespoke Launch',
    launches: 1,
    spacingDays: 3,
    turnaroundDays: 3,
    scope: 'any',
    style: 'custom',
    price: 900,
  },
  club: {
    name: 'Launch Club',
    launches: 3,
    spacingDays: 3,
    turnaroundDays: 2,
    scope: 'simple',
    style: 'templated',
    price: 960,
  },
  launchlet: {
    name: 'Launchlet',
    launches: 1,
    spacingDays: 3,
    turnaroundDays: 1,
    scope: 'simple',
    style: 'templated',
    price: 340,
  },
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'main-street',
    name: 'Main Street',
    blurb: 'An ordinary fortnight. Market stalls in the middle, openings and anniversaries at the end.',
    arrivals: [5, 6, 6, 7, 8, 9, 9, 8, 8, 8, 8, 8],
    phases: [
      { fromDay: 0, segmentWeights: { small: 4, moment: 2, careful: 2, rush: 2 } },
      { fromDay: 4, segmentWeights: { small: 6, moment: 1, careful: 1, rush: 3 }, note: 'Market fortnight: the small shops are busy and want things quickly.' },
      { fromDay: 8, segmentWeights: { small: 2, moment: 3, careful: 4, rush: 1 }, note: 'Anniversary season: openings and careful voices come back to the window.' },
    ],
    shocks: [],
    news: { ill: 3, gazette: 3, bulk: 2, rival: 3, aiPrice: 2, market: 2, maintenance: 2, rain: 2, student: 2, premiere: 2, loan: 3, referral: 3 },
    review: { day: 8, served: 18 },
  },
  {
    id: 'festival-week',
    name: 'Festival Week',
    blurb: 'The street festival lands mid-season. Lots of small, quick, cheerful requests, all at once.',
    arrivals: [4, 5, 6, 9, 11, 12, 12, 11, 7, 6, 6, 6],
    phases: [
      { fromDay: 0, segmentWeights: { small: 5, moment: 1, careful: 1, rush: 3 } },
      { fromDay: 3, segmentWeights: { small: 5, moment: 2, careful: 0, rush: 5 }, note: 'Festival week: everyone wants it now.' },
      { fromDay: 8, segmentWeights: { small: 4, moment: 2, careful: 2, rush: 2 }, note: 'The bunting comes down. The street gets back to normal.' },
    ],
    shocks: [],
    review: { day: 8, served: 17 },
    news: { ill: 3, gazette: 2, bulk: 4, rival: 2, aiPrice: 2, market: 1, maintenance: 2, rain: 3, student: 3, premiere: 2, loan: 3, referral: 2 },
  },
  {
    id: 'bespoke-rush',
    name: 'Careful Season',
    blurb: 'Openings and anniversaries that need a careful hand. The AI desk is down for day 5.',
    arrivals: [3, 3, 4, 4, 4, 5, 4, 5, 5, 5, 5, 5],
    phases: [
      { fromDay: 0, segmentWeights: { small: 1, moment: 4, careful: 5, rush: 0 } },
      { fromDay: 6, segmentWeights: { small: 2, moment: 5, careful: 3, rush: 1 }, note: 'Opening season: big nights, fewer quiet ones.' },
    ],
    shocks: [
      { id: 'outage', label: 'AI desk outage', startMinute: 4 * 480, endMinute: 5 * 480, kind: 'ai_outage' },
    ],
    news: { ill: 3, gazette: 3, rival: 1, aiPrice: 3, maintenance: 1, rain: 2, student: 2, premiere: 4, loan: 3, referral: 3 },
    review: { day: 8, served: 17 },
  },
];

export const CAST: CastMember[] = [
  {
    id: 'mara',
    name: 'Mara',
    business: 'Moonrise Bakery',
    segment: 'small',
    hue: 28,
    lines: [
      'Friday bake sale. I need a little launch, not a whole agency.',
      'New sourdough on Saturday. Same again, but quick?',
      'Pie stall at the market. Could you let the regulars know?',
    ],
  },
  {
    id: 'ines',
    name: 'Ines',
    business: 'Saturday Flower Cart',
    segment: 'small',
    hue: 340,
    lines: ['Peonies are in. Can people hear about it by the weekend?', 'Wreath workshop next week. Small and sweet.', 'Sunflowers by the crate this week. Spread the word?'],
  },
  {
    id: 'kofi',
    name: 'Kofi',
    business: 'Corner Coffee Cart',
    segment: 'small',
    hue: 18,
    lines: ['Trying a new cold brew. Just a nudge to the regulars.', 'Loyalty cards are back. Tell the street?', 'Open mic in front of the cart on Friday. Quick heads-up?'],
  },
  {
    id: 'bea',
    name: 'Bea',
    business: "Bea's Knit Shop",
    segment: 'small',
    hue: 280,
    lines: ['A beginners circle on Tuesdays. Something cosy.', 'Winter yarn arrived. A small shout, please.', 'Knit-and-natter night is full. Announce the second one?'],
  },
  {
    id: 'eli',
    name: 'Eli',
    business: 'Pocket Stage',
    segment: 'moment',
    hue: 210,
    lines: ['Opening night is everything. Make it feel like an event.', 'The show moved venues. We need a proper relaunch.', 'Closing week of the run. One last push.'],
  },
  {
    id: 'odile',
    name: 'Odile',
    business: 'Gallery Nine',
    segment: 'moment',
    hue: 190,
    lines: ['A new exhibition opens. It needs to look the part.', 'Artist talk on Thursday. Worth doing well.', 'A late-night opening. It should feel special.'],
  },
  {
    id: 'sam',
    name: 'Sam',
    business: 'Night Market',
    segment: 'moment',
    hue: 45,
    lines: ['First night market of the year. Big energy.', 'We are adding a second street. Announce it properly.', 'Lantern parade through the market. This one matters.'],
  },
  {
    id: 'ravi',
    name: 'Ravi',
    business: 'Hillside Climbing Gym',
    segment: 'moment',
    hue: 150,
    lines: ['Grand opening. One shot to get it right.', 'New bouldering wall. Make people want to try it.', 'First competition at the gym. Make it feel big.'],
  },
  {
    id: 'nell',
    name: 'Nell',
    business: 'The Next Chapter',
    segment: 'careful',
    hue: 12,
    lines: ['Our reading night has a very particular voice.', 'A poet is visiting. Please handle it gently.', 'A book club for slow readers. It needs the right tone.'],
  },
  {
    id: 'hugo',
    name: 'Hugo',
    business: 'Hugo Watch Repair',
    segment: 'careful',
    hue: 230,
    lines: ['Forty years in this shop. The anniversary should feel earned.', 'Restoration workshop. Precise, like the work.', 'I am retiring one bench to an apprentice. A quiet announcement.'],
  },
  {
    id: 'priya',
    name: 'Priya',
    business: 'Steep Tea Room',
    segment: 'careful',
    hue: 100,
    lines: ['A tasting evening. Quiet, considered, nothing loud.', 'New seasonal menu. It has a story behind it.', 'A tea from a single estate. The story is the point.'],
  },
  {
    id: 'wren',
    name: 'Wren',
    business: 'Wren Records',
    segment: 'careful',
    hue: 310,
    lines: ['Record Day. The regulars can smell a template a mile off.', 'An in-store session. It has to sound like us.', 'A rare pressing arrived. The regulars will want the details right.'],
  },
  {
    id: 'juno',
    name: 'Juno',
    business: 'Pop-up Vintage',
    segment: 'rush',
    hue: 50,
    lines: ['We open tomorrow. Tomorrow! Can you help?', 'Surprise rail of coats came in. Today, ideally.', 'Rail of party dresses, tonight only.'],
  },
  {
    id: 'theo',
    name: 'Theo',
    business: 'Theo Food Truck',
    segment: 'rush',
    hue: 0,
    lines: ['Parking by the park tonight only. Quick one?', 'Rain cancelled us. New spot, same day.', 'New sauce, one evening, by the river.'],
  },
  {
    id: 'lu',
    name: 'Lu',
    business: 'Lu Dumplings',
    segment: 'rush',
    hue: 330,
    lines: ['Dumpling special, one day only.', 'We sold out early. Tell people the new batch is ready.', 'Kitchen open late tonight. Tell the night owls.'],
  },
  {
    id: 'ash',
    name: 'Ash',
    business: 'Ash Bike Fix',
    segment: 'rush',
    hue: 170,
    lines: ['Free tune-ups this afternoon. Short notice, I know.', 'Pop-up repair stand by the station. Today.', 'Puncture clinic at lunch. Today.'],
  },
  {
    id: 'dev',
    name: 'Dev',
    business: 'Corner Plant Stall',
    segment: 'small',
    hue: 120,
    lines: ['Cuttings swap on Sunday. Small and friendly.', 'Cactus sale, everything must go.', 'Repotting help this weekend. A little shout?'],
  },
  {
    id: 'rosa',
    name: 'Rosa',
    business: 'Rosa Bakes',
    segment: 'small',
    hue: 15,
    lines: ['Saturday cinnamon buns are back.', 'Gluten-free loaves now. Tell people gently.', 'Birthday cake orders open for the month.'],
  },
  {
    id: 'mina',
    name: 'Mina',
    business: 'The Little Cinema',
    segment: 'moment',
    hue: 260,
    lines: ['A premiere with the director in the room.', 'Our anniversary screening. It deserves a fuss.', 'Outdoor screening in the square. Big night.'],
  },
  {
    id: 'oscar',
    name: 'Oscar',
    business: 'Oscar Brewing',
    segment: 'moment',
    hue: 35,
    lines: ['Tap room opening. We have waited two years.', 'Our first festival beer. Make it an occasion.', 'Brewery tour launch. Proper event.'],
  },
  {
    id: 'florence',
    name: 'Florence',
    business: 'Florence Framing',
    segment: 'careful',
    hue: 200,
    lines: ['A show of old maps. It needs a careful eye.', 'We now restore frames. Quietly, precisely.', 'A talk on gilding. Not for everyone, and that is fine.'],
  },
  {
    id: 'idris',
    name: 'Idris',
    business: 'Idris Tailoring',
    segment: 'careful',
    hue: 285,
    lines: ['Made-to-measure week. It should feel like the suits.', 'Fifty years of the shop. Understated, please.', 'An apprentice joins. Say it with care.'],
  },
  {
    id: 'pip',
    name: 'Pip',
    business: 'Pip Pop-up Prints',
    segment: 'rush',
    hue: 320,
    lines: ['Print stall at the station, today only.', 'Sold out of posters, new batch in an hour.', 'Flash sale before the rain.'],
  },
  {
    id: 'yusuf',
    name: 'Yusuf',
    business: 'Yusuf Fruit Barrow',
    segment: 'rush',
    hue: 90,
    lines: ['Mangoes came in early. Today.', 'Last of the cherries this afternoon.', 'Barrow moved to the square for the day.'],
  },
  {
    id: 'tilly',
    name: 'Tilly',
    business: 'Tilly Tea Cart',
    segment: 'small',
    hue: 60,
    lines: ['Iced tea is back for the warm days. A little nudge?', 'Two new blends this week. Nothing fancy.', 'Tea tasting by the fountain on Sunday. Small crowd, ideally.'],
  },
  {
    id: 'gus',
    name: 'Gus',
    business: 'Gus Hardware',
    segment: 'small',
    hue: 210,
    lines: ['Paint sale this weekend. Tell the street.', 'We cut keys now. Quick mention?', 'Spring bulbs in. Just the regulars, really.'],
  },
  {
    id: 'amara',
    name: 'Amara',
    business: 'Amara Hair',
    segment: 'small',
    hue: 300,
    lines: ['Walk-ins on Wednesdays now. A small shout?', 'New stylist starts Monday. Introduce her?', 'Half-price fringe trims this week.'],
  },
  {
    id: 'bo',
    name: 'Bo',
    business: 'Bo Bubble Tea',
    segment: 'small',
    hue: 160,
    lines: ['Taro is back. People keep asking.', 'Student discount all week. Spread it around?', 'Open late on Fridays now.'],
  },
  {
    id: 'clem',
    name: 'Clem',
    business: 'Clem Jazz Bar',
    segment: 'moment',
    hue: 240,
    lines: ['A trio from out of town, one night only. Make it feel rare.', 'Our tenth birthday. A proper night.', 'Late jam session with a famous guest. Big one.'],
  },
  {
    id: 'yara',
    name: 'Yara',
    business: 'Yara Dance School',
    segment: 'moment',
    hue: 330,
    lines: ['Our summer showcase. The parents need to be there.', 'A new adult class opens. Make it an event.', 'A dance-off in the square. It has to feel big.'],
  },
  {
    id: 'finn',
    name: 'Finn',
    business: 'Finn Bike Club',
    segment: 'moment',
    hue: 120,
    lines: ['The first group ride of the year. Get everyone out.', 'A sunrise ride to the coast. Make it special.', 'Our hundredth ride. Celebrate it properly.'],
  },
  {
    id: 'lorna',
    name: 'Lorna',
    business: 'Lorna Pottery',
    segment: 'moment',
    hue: 20,
    lines: ['Kiln opening day. The whole studio will be there.', 'A pottery market in the yard. One afternoon.', 'A visiting potter does a live throw. Make people come.'],
  },
  {
    id: 'agnes',
    name: 'Agnes',
    business: 'Agnes Bindery',
    segment: 'careful',
    hue: 30,
    lines: ['A small run of hand-bound journals. It needs the right words.', 'We repair old books now. Gently, please.', 'A talk on marbled paper. Not a crowd, the right people.'],
  },
  {
    id: 'tobias',
    name: 'Tobias',
    business: 'Tobias Violins',
    segment: 'careful',
    hue: 15,
    lines: ['An old violin restored. The owner wants it known, quietly.', 'A recital in the workshop. Thirty chairs.', 'An apprentice made her first violin. Say it well.'],
  },
  {
    id: 'saoirse',
    name: 'Saoirse',
    business: 'Saoirse Perfumery',
    segment: 'careful',
    hue: 290,
    lines: ['A scent made for the street. The words must smell right.', 'A blending class for six. Exactly six.', 'A rare oil came in. The story matters more than the price.'],
  },
  {
    id: 'malik',
    name: 'Malik',
    business: 'Malik Cheese Room',
    segment: 'careful',
    hue: 50,
    lines: ['An aged cheese from a tiny farm. It deserves care.', 'A tasting with the cheesemaker. Small and proper.', 'We now age our own. Say it plainly, say it right.'],
  },
  {
    id: 'rory',
    name: 'Rory',
    business: 'Rory Popcorn',
    segment: 'rush',
    hue: 40,
    lines: ['Cinema crowd at seven. Can people hear about us by then?', 'Caramel batch just done. Today only.', 'Moved the cart to the park for the afternoon.'],
  },
  {
    id: 'hana',
    name: 'Hana',
    business: 'Hana Sushi Stand',
    segment: 'rush',
    hue: 350,
    lines: ['Fresh delivery, lunch special today.', 'We have extra salmon. Tonight, please.', 'Pop-up at the station until we sell out.'],
  },
  {
    id: 'ollie',
    name: 'Ollie',
    business: 'Ollie Shoe Repair',
    segment: 'rush',
    hue: 190,
    lines: ['Heel fixes while you wait, this afternoon only.', 'Rain boots patched today. Quick word?', 'Half price on laces until close.'],
  },
  {
    id: 'zainab',
    name: 'Zainab',
    business: 'Zainab Flowers',
    segment: 'rush',
    hue: 320,
    lines: ['A wedding cancelled. Fifty bouquets, today.', 'Tulips need to go by tonight.', 'Flash sale on roses before the weekend.'],
  },
];

/** Neighbours who only appear through street news; never drawn as ordinary walk-ins. */
export const SPECIAL_CAST: CastMember[] = [
  { id: 'ivo', name: 'Ivo', business: 'Ivo Watch Workshop', segment: 'careful', hue: 145, lines: ['My own name above the door. I still use the bench Hugo gave me.', 'A workshop for first repairs. Let people know they can learn here.'] },
  {
    id: 'committee',
    name: 'Festival committee',
    business: 'Street Festival',
    segment: 'small',
    hue: 45,
    lines: ['Four quick launches for the festival weekend, please. We pay up front.'],
  },
  {
    id: 'association',
    name: 'The street association',
    business: 'Summer street party',
    segment: 'moment',
    hue: 200,
    lines: ['The whole street will be there. Make it feel like summer.'],
  },
];

export const CAST_BY_ID: Record<string, CastMember> = Object.fromEntries([...CAST, ...SPECIAL_CAST].map((c) => [c.id, c]));

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** The customer mix on a given day. */
export function phaseFor(scenario: Scenario, day: number): Scenario['phases'][number] {
  let p = scenario.phases[0]!;
  for (const ph of scenario.phases) if (ph.fromDay <= day) p = ph;
  return p;
}
