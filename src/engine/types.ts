// Pure data types for the Lantern Works simulation. No DOM, no React.
import type { ApprovedProof, BriefCopy, CreativeIntention, DesignPiece, DesignSpec } from './design';

export type Need = 'simple' | 'nuanced';
export type Scope = 'simple' | 'any';
export type Style = 'custom' | 'templated';
export type AiTier = 'none' | 'solo' | 'duo';
/** Which production work goes to the AI desk: none, simple briefs only, or everything. */
export type Routing = 'human' | 'simple' | 'all';
/** How hard people work on a day: steady, pushed (quicker, more redos) or careful (slower, fewer redos). */
export type Pace = 'steady' | 'push' | 'careful';

export type SegmentId = 'small' | 'moment' | 'careful' | 'rush';
export type Care = 'low' | 'medium' | 'high';

/** A sellable unit of work. The player can invent any offer inside these bounds. */
export interface OfferSpec {
  name: string;
  /** Number of separate launches promised. */
  launches: number;
  /** Days between launch releases (ignored when launches is 1). */
  spacingDays: number;
  /** Each launch is due by the close of this many days after its release day (1 = same day). */
  turnaroundDays: number;
  scope: Scope;
  style: Style;
  /** Total price in whole credits, paid up front. */
  price: number;
  /** Work can start this many days after it is taken (a booking for tomorrow is 1). Window offers start the same day. */
  startsInDays?: number;
}

export interface Staffing {
  aiTier: AiTier;
  routing: Routing;
}

export interface Segment {
  id: SegmentId;
  label: string;
  /** How many launches this kind of neighbour would value over the season. */
  wantsLaunches: number;
  valuePerLaunch: number;
  /** Launches beyond what they want are worth this percent of valuePerLaunch. */
  extraLaunchPercent: number;
  maxWaitDays: number;
  care: Care;
  nuancedBp: number;
}

export interface CastMember {
  id: string;
  name: string;
  business: string;
  segment: SegmentId;
  /** Request lines, one picked per visit. */
  lines: string[];
  /** Colour hue for the miniature figure. */
  hue: number;
}

export interface Shock {
  id: string;
  label: string;
  startMinute: number;
  endMinute: number;
  kind: 'ai_outage';
}

export interface Phase {
  /** First day (index) this mix applies from. */
  fromDay: number;
  segmentWeights: Record<SegmentId, number>;
  /** A short line shown on the street when the phase begins. */
  note?: string;
}

export interface Scenario {
  id: string;
  name: string;
  blurb: string;
  arrivals: number[];
  /** Customer mix by day; the latest phase whose fromDay has passed applies. */
  phases: Phase[];
  shocks: Shock[];
  /** Weight of each street-news card on this street; cards not listed never appear. */
  news: Partial<Record<NewsCardId, number>>;
  /** The landlord's rent review: neighbours served needed by the morning of `day`, or the rent rises from then. */
  review: { day: number; served: number };
}

export interface RunConfig {
  scenarioId: string;
  seed: string;
  continuation?: ContinuationSnapshot;
}

export interface CarriedPieceData {
  id: string;
  sourceJobId: string;
  sourceSeason: number;
  castId: string;
  design: DesignPiece;
  title: string;
  copy: BriefCopy[];
}
export interface LegacyCarriedPiece extends CarriedPieceData {
  projectId: ProjectId;
  approach: ProjectApproach;
  source?: never;
}
export interface CurrentCarriedPiece extends CarriedPieceData {
  source: { kind: 'ordinary'; requestId: string; intention?: CreativeIntention; briefId?: string } | { kind: 'project'; projectId: ProjectId; approach: ProjectApproach; story?: ProjectStory };
  projectId?: never;
  approach?: never;
}
export type CarriedPiece = LegacyCarriedPiece | CurrentCarriedPiece;
/** The first completed authored ordinary promise, retained even when its print is not carried. */
export interface CreativePromise {
  sourceSeason: number;
  contractId: string;
  requestId: string;
  jobId: string;
  castId: string;
  deliveredAt: number;
  intention?: CreativeIntention;
  briefId?: string;
  design: DesignPiece;
  title: string;
  copy: BriefCopy[];
}
export interface RelationshipAggregate {
  castId: string;
  regular: boolean;
  lost: boolean;
  ordinaryDelivered: number;
  lastResolution: RelationshipMemory['kind'] | null;
  milestone?: { approach: ProjectApproach; outcome: 'delivered' | 'compromised' | 'partial' | 'failed' };
  creativePromise?: CreativePromise;
}
interface ContinuationData {
  season: number;
  relationships: RelationshipAggregate[];
  patterns: { id: string; sourceId: string; status: 'queued' | 'preparing' | 'ready'; remaining: number; noorKnows: boolean }[];
  cash: number;
  rep: Record<SegmentId, number>;
  upgrades: UpgradeId[];
  staffing: Staffing;
  kit: { status: KitStatus; remaining: number };
  rentExtra: number;
  noor?: { id: string; specialization?: Specialization };
}
export type ContinuationSnapshot = ContinuationData & (
  { version: 1; pieces: LegacyCarriedPiece[] } | { version: 2; pieces: CurrentCarriedPiece[] } | { version: 3; pieces: CurrentCarriedPiece[]; career: CareerSnapshot }
);
export type CareerStage = 'opening' | 'practice' | 'legacy' | 'open';
export type PrincipalNodeId = 'clem-opening' | 'mara-opening' | 'ivo-opening' | 'clem-practice' | 'mara-practice' | 'ivo-practice' | 'clem-legacy' | 'mara-legacy' | 'ivo-legacy';
export type StoryNodeId = PrincipalNodeId | 'clem-open' | 'mara-open' | 'ivo-open';
export type PrincipalOutcome = 'delivered' | 'compromised' | 'partial' | 'failed' | 'not-taken' | 'unknown';
export interface PrincipalStory { nodeId: PrincipalNodeId; season: number | null; outcome: PrincipalOutcome; approach?: ProjectApproach }
export interface CareerSnapshot { stage: CareerStage; stories: PrincipalStory[]; adaptedFrom?: { rules: 'lantern-6.0.0' | 'lantern-6.1.0'; season: number } }
export interface ProjectStory { nodeId: StoryNodeId; stage: CareerStage; season: number }
export interface ProjectContribution { host: boolean; materialsReduction: number; trailBriefReduction: number; courtyardFinishReduction: number }
export interface StudioPattern {
  id: string;
  sourceId: string;
  piece: DesignPiece;
  status: 'queued' | 'preparing' | 'ready';
  remaining: number;
  assignee: string | null;
}
export interface PatternTeaching {
  patternId: string;
  resourceId: string;
  day: number;
  completedAt: number | null;
}

export type RequestStatus = 'waiting' | 'accepted' | 'declined' | 'walked';
/** Why a neighbour is at the window: an ordinary walk-in, word of mouth, flyers, street news, or a second chance. */
export type RequestSource = 'walkin' | 'word' | 'flyer' | 'news' | 'amends' | 'premium' | 'booking' | 'project';

export type ProjectId = 'clem-ten' | 'mara-regular' | 'hugo-handover' | 'lantern-night';
export type ProjectApproach = 'first-night' | 'new-band' | 'weekly-rhythm' | 'market-debut' | 'quiet-sendoff' | 'open-bench' | 'courtyard' | 'trail';
export interface ProjectIdentity { id: ProjectId; approach: ProjectApproach }
/** Chosen stage profiles and earned reductions, before ordinary upgrades and worker modifiers. */
export interface WorkProfile { brief?: number; finish?: number; briefReduction?: number }
export interface ProjectTerms extends ProjectIdentity { materials: number; contributors: ProjectId[]; proof?: ApprovedProof; creativePromise?: CreativePromise; story?: ProjectStory; contribution?: ProjectContribution; lentPiece?: CurrentCarriedPiece }

export interface Request {
  id: string;
  day: number;
  index: number;
  castId: string;
  segment: SegmentId;
  need: Need;
  /** Per-visit willingness multiplier, percent (e.g. 85-115). */
  wtpPercent: number;
  lineIndex: number;
  status: RequestStatus;
  source: RequestSource;
  /** A fixed offer this neighbour brings (street-news orders, amends); otherwise they choose from the window. */
  offer?: OfferSpec;
  /** Reputation gained when this order is delivered (a favour the street hears about). */
  repOnDelivery?: number;
  contractId?: string;
  project?: ProjectIdentity;
  briefId?: string;
}

export type JobStatus = 'scheduled' | 'active' | 'delivered' | 'missed' | 'refunded';
export type Stage = 'brief' | 'produce' | 'finish' | 'rework' | 'done';
export type Method = 'human' | 'ai';

export interface Job {
  id: string;
  contractId: string;
  castId: string;
  launchIndex: number;
  releaseDay: number;
  /** Absolute minute by which delivery must complete (inclusive). Always a day boundary. */
  dueAt: number;
  allocation: number;
  need: Need;
  templated: boolean;
  status: JobStatus;
  stage: Stage;
  remaining: number;
  assignee: string | null;
  /** Effort scaling at this stage's assignment, retained across the next morning's training benefit. */
  assigneeSpeed?: number;
  method: Method | null;
  reworkFlag: boolean;
  deliveredAt: number | null;
  /** Extra finishing minutes the neighbour asked for in a change on the day (a snag). */
  snag?: number;
  /** Who the player chose to make it (a key of RULES.makers). It waits for them on days they are in. */
  maker?: string;
  effort?: WorkProfile;
  /** The original brief can still be delivered, but this customer declined to cooperate further. */
  changeDeclined?: true;
}

export interface Contract {
  id: string;
  seq: number;
  requestId: string;
  castId: string;
  segment: SegmentId;
  offer: OfferSpec;
  price: number;
  repOnDelivery?: number;
  acceptedDay: number;
  jobIds: string[];
  project?: ProjectTerms;
  proof?: ApprovedProof;
  intention?: CreativeIntention;
  briefId?: string;
  reserved?: true;
}

/** lead: Ada and Tomas. junior: briefs, finishing and rework only, slower. temp: a full-skill hand for one day. */
export type Role = 'lead' | 'junior' | 'temp' | 'ai';
export type Specialization = 'proofing' | 'templates';
export interface Mentorship {
  kind: Specialization;
  day: number;
  mentorId: string;
  completedAt: number | null;
}

export interface Resource {
  id: string;
  kind: 'human' | 'ai';
  role: Role;
  name: string;
  /** Effort taken, percent of normal (a junior takes 150). */
  speedPercent: number;
  /** First and last day (inclusive) this person works; null = open-ended. */
  fromDay: number;
  toDay: number | null;
  /** Daily wage while working, charged each morning (temps are paid when booked). */
  dailyCost: number;
  busyWith: string | null;
  /** AI slot retired by a downgrade: finishes its current task, takes no new work, costs nothing. */
  retired: boolean;
  busyMinutes: number;
  shiftMinutes: number;
  /** Belongs to this hiring spell; its benefit begins on the morning after completion. */
  mentorship?: Mentorship;
  inheritedSpecialization?: Specialization;
  inheritedPatterns?: string[];
}

export type KitStatus = 'none' | 'queued' | 'building' | 'ready';

export interface Kit {
  status: KitStatus;
  remaining: number;
  assignee: string | null;
}

export type JournalKind = 'capital' | 'pattern' | 'receipt' | 'earn' | 'refund' | 'fee' | 'wages' | 'shop' | 'ai' | 'upgrade' | 'marketing' | 'news' | 'loan' | 'interest' | 'materials';

export interface JournalEntry {
  /** The day this entry belongs to. Closing-minute entries belong to the day that is closing. */
  day: number;
  minute: number;
  kind: JournalKind;
  cash: number;
  unearned: number;
  revenue: number;
  ref: string;
  note: string;
}

export type SimEventType =
  | 'pattern_used'
  | 'pattern_ready'
  | 'pattern_teaching_start'
  | 'pattern_teaching_done'
  | 'day_start'
  | 'task_start'
  | 'task_done'
  | 'rework_found'
  | 'delivered'
  | 'project_completed'
  | 'project_change_declined'
  | 'missed'
  | 'refunded_horizon'
  | 'kit_ready'
  | 'outage_start'
  | 'outage_end'
  | 'walked'
  | 'news'
  | 'hired'
  | 'mentoring_start'
  | 'mentoring_done'
  | 'takeoff'
  | 'snag'
  | 'call'
  | 'review'
  | 'day_end';

export interface SimEvent {
  /** The day this event belongs to. Closing-minute events belong to the day that is closing. */
  day: number;
  minute: number;
  type: SimEventType;
  jobId?: string;
  resourceId?: string;
  stage?: Stage | 'kit' | 'pattern';
  requestId?: string;
  amount?: number;
  mentorId?: string;
  specialization?: Specialization;
  patternId?: string;
}

export type UpgradeId = 'library' | 'checklist' | 'styleGuide';

export type NewsCardId = 'ill' | 'gazette' | 'bulk' | 'rival' | 'aiPrice' | 'market' | 'maintenance' | 'rain' | 'student' | 'premiere' | 'loan' | 'referral' | 'maraGrows' | 'eliExtended' | 'hugoRetires' | 'clemTen' | 'oscarRescue' | 'streetParty' | 'crossroads' | 'poach' | 'blackout' | 'lastOffer';

/** A street-news card drawn for one morning. */
export interface News {
  id: string;
  day: number;
  card: NewsCardId;
  /** Chosen option index, or null until answered. Opening the shop applies option 0. */
  choice: number | null;
  /** Cast member the card is about, if any. */
  castId?: string;
}

/** A lasting consequence of a choice, read by the simulation on the days it covers. */
export type Modifier =
  | { kind: 'wtp'; segment: SegmentId; percent: number; fromDay: number; toDay: number }
  | { kind: 'absent'; who: string; day: number; paid: boolean }
  | { kind: 'quiet'; day: number; percent: number }
  | { kind: 'outage'; day: number }
  /** Priority access: the AI desk stays up that day, whatever else happens. */
  | { kind: 'noOutage'; day: number }
  /** A neighbour you let down comes back once, on this morning, for a chance to make amends. */
  | { kind: 'returns'; castId: string; segment: SegmentId; day: number }
  | { kind: 'arrivals'; segment: SegmentId; count: number; day: number; source: RequestSource }
  | { kind: 'aiCost'; delta: number; fromDay: number }
  | { kind: 'repay'; day: number; principal: number; interest: number }
  /** The customer list was sold: as the shop opens, everything still in the works goes to Bright Lantern. */
  | { kind: 'handover'; day: number }
  /** The rent review went against the studio: this much more rent every day from `fromDay`. */
  | { kind: 'rent'; fromDay: number; extra: number };

export interface FeaturePiecesCommand { type: 'featurePieces'; pieceIds: string[] }
export type Command =
  | FeaturePiecesCommand
  | { type: 'preparePattern'; sourceId: string; replacePatternId?: string }
  | { type: 'teachPattern'; patternId: string; resourceId: string }
  | { type: 'accept'; requestId: string; /** Take the neighbour's counter-offer instead of the window price. */ counter?: true; /** Who makes it (a key of RULES.makers); else whoever is free. */ maker?: string; design?: DesignSpec; intention?: CreativeIntention }
  | { type: 'acceptProject'; projectId: ProjectId; approach: ProjectApproach; maker?: string; design?: DesignSpec; sourceId?: string }
  | { type: 'reserve'; requestId: string; startsInDays: 1 | 2; design?: DesignSpec; intention?: CreativeIntention }
  | { type: 'mentor'; resourceId: string; specialization: Specialization }
  | { type: 'decline'; requestId: string }
  | { type: 'setMenu'; offers: OfferSpec[] }
  | { type: 'setStaff'; staffing: Staffing }
  | { type: 'choose'; newsId: string; option: number }
  | { type: 'hire' }
  | { type: 'letGo'; resourceId: string }
  | { type: 'temp' }
  | { type: 'overtime' }
  | { type: 'pace'; pace: Pace }
  | { type: 'buy'; item: UpgradeId }
  | { type: 'flyers'; segment: SegmentId }
  | { type: 'runDay'; /** Stop the day for a call when a promise due tonight is suddenly at risk. */ calls?: true }
  | { type: 'answer'; option: CallOption };

/** How to answer a call: everyone stays late, ship it without the change, ring the neighbour for a day's grace, or leave it. */
export type CallOption = 'late' | 'cut' | 'ring' | 'ride';

/** The day stopped: a promise due tonight is now forecast to miss, after a change asked for or a redo found. */
export interface Call {
  jobId: string;
  minute: number;
  cause: 'snag' | 'rework';
  /** For a snag: the finishing minutes the change adds. */
  minutes: number;
}

export interface CompanyState {
  rulesVersion: string;
  config: RunConfig;
  revision: number;
  /** Current day index. Equal to horizon days once the season is closed. */
  day: number;
  minute: number;
  finished: boolean;
  menu: OfferSpec[];
  staffing: Staffing;
  resources: Resource[];
  requests: Request[];
  contracts: Contract[];
  jobs: Job[];
  kit: Kit;
  cash: number;
  unearned: number;
  revenue: number;
  journal: JournalEntry[];
  events: SimEvent[];
  /** Cumulative minutes, kept even when an AI desk is removed. */
  usage: { humanBusy: number; humanShift: number; aiBusy: number; aiShift: number };
  /** Cast members who will not buy again after a missed promise. */
  lostCast: string[];
  /** Concrete dealings remembered by the people of the street. Added only in authored seasons. */
  relationshipMemory?: RelationshipMemory[];
  patterns?: StudioPattern[];
  patternTeaching?: PatternTeaching[];
  featuredPieceIds?: string[];
  /** Word of mouth per customer type. Kept promises raise it; misses and ignored neighbours lower it. */
  rep: Record<SegmentId, number>;
  news: News[];
  modifiers: Modifier[];
  upgrades: UpgradeId[];
  /** Days with overtime booked (people stay until 5pm). */
  overtimeDays: number[];
  /** Days run at a pace other than steady: pushed (quicker, more redos) or careful (slower, fewer). */
  paceDays: { day: number; pace: Exclude<Pace, 'steady'> }[];
  /** Days flyers were handed out. */
  flyerDays: number[];
  /** Days a temp was booked. */
  tempDays: number[];
  /** A call waiting for an answer, mid-day; nothing else can be done until it is answered. */
  call: Call | null;
  /** Days a call was taken: at most one a day. */
  callDays: number[];

  commands: Command[];
}

export interface RelationshipMemory {
  castId: string;
  day: number;
  minute: number;
  kind: 'declined-before-promise' | 'agreed-later-start' | 'renegotiated-with-discount' | 'promise-kept' | 'promise-missed' | 'amends-kept' | 'change-refused';
  requestId?: string;
  contractId?: string;
}

export interface CommandResult {
  state: CompanyState;
  error?: string;
}
