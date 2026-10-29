// Pure placement: decides where each frame item is drawn. No React here so it stays easy to test.
import type { WalkReason } from '../../engine/demand';
import type { FolderFrame, NeighbourFrame, WorkerFrame, WorldFrame } from '../timeline';
import { AI_DESKS, AI_PILE, AISLE, DOOR_OUT, MAKE_DESKS, MAKE_PILE, PILES, SPOTS, STREET } from './iso';

export type Pose = 'back' | 'front' | 'side';
export type Pt2 = readonly [number, number];

export interface PlacedPerson {
  worker: WorkerFrame;
  /** Place in the morning roster of people (0 is Ada, 1 Tomas, then anyone else on today), up to 3. */
  index: number;
  x: number;
  y: number;
  pose: Pose;
  /** Gone home: walks out of the door, then is hidden. */
  gone: boolean;
}

export function placeHumans(frame: WorldFrame): PlacedPerson[] {
  const humans = frame.workers.filter((w) => w.kind === 'human');
  const out: PlacedPerson[] = [];
  humans.forEach((worker, index) => {
    const slot = Math.min(index, SPOTS.idle.length - 1);
    const st = worker.station;
    if (st === 'ai') return;
    if (st === 'home') {
      out.push({ worker, index: slot, x: DOOR_OUT[0] + slot * 6, y: DOOR_OUT[1], pose: 'front', gone: true });
      return;
    }
    const spot = SPOTS[st][slot]!;
    out.push({ worker, index: slot, x: spot[0], y: spot[1], pose: st === 'idle' ? 'front' : 'back', gone: false });
  });
  return out;
}

/** Points a person walks through inside the shop: down to the front aisle, along it, and up to the spot. */
export function staffRoute(from: Pt2, to: Pt2): Pt2[] {
  // From a spot out to the aisle.
  const leg = (p: Pt2): Pt2[] => {
    // The kit board sits behind the tray: reach it by the gap between the brief table and the tray.
    if (p[1] < 60 && p[0] > 276 && p[0] < 362) return [[282, p[1] + 8], [282, AISLE]];
    // Outside: through the door.
    if (p[1] > 214) return [[DOOR_OUT[0], 214], [DOOR_OUT[0], AISLE]];
    return [[p[0], AISLE]];
  };
  if (Math.abs(from[0] - to[0]) < 1 && Math.abs(from[1] - to[1]) < 1) return [from, to];
  return [from, ...leg(from), ...leg(to).reverse(), to];
}

export function aiWorkers(frame: WorldFrame): WorkerFrame[] {
  return frame.workers.filter((w) => w.kind === 'ai').slice(0, 2);
}

export interface FolderGroups {
  brief: FolderFrame[];
  tray: FolderFrame[];
  finish: FolderFrame[];
  /** Folders on a specific worker's desk, keyed by worker id. */
  desk: Map<string, FolderFrame[]>;
}

/** Which surface a folder lies on: 'brief', 'tray', 'finish' or 'desk:<worker id>'. */
export function folderSpot(stage: FolderFrame['stage'], holderId: string | null, workers: WorkerFrame[]): string {
  if (stage === 'brief') return 'brief';
  if (stage === 'finish' || stage === 'rework') return 'finish';
  const w = holderId ? workers.find((x) => x.id === holderId) : undefined;
  return w ? `desk:${w.id}` : 'tray';
}

export function groupFolders(frame: WorldFrame): FolderGroups {
  const holder = new Map<string, WorkerFrame>();
  for (const w of frame.workers) if (w.jobId) holder.set(w.jobId, w);
  const g: FolderGroups = { brief: [], tray: [], finish: [], desk: new Map() };
  for (const f of frame.folders) {
    if (f.stage === 'brief') g.brief.push(f);
    else if (f.stage === 'finish' || f.stage === 'rework') g.finish.push(f);
    else {
      const w = holder.get(f.jobId);
      const onDesk = w && !f.waiting && (w.station === 'make' || w.station === 'ai');
      if (onDesk) g.desk.set(w.id, [...(g.desk.get(w.id) ?? []), f]);
      else g.tray.push(f);
    }
  }
  return g;
}

/** World point (x, y) of a surface's first pile, for folders flying between surfaces. */
export function spotAnchor(spot: string, workers: WorkerFrame[]): Pt2 | null {
  if (spot === 'brief') return PILES.brief[0];
  if (spot === 'tray') return PILES.tray[0];
  if (spot === 'finish') return PILES.finish[0];
  const id = spot.slice(5);
  const humans = workers.filter((w) => w.kind === 'human');
  const hi = humans.findIndex((w) => w.id === id);
  if (hi >= 0) {
    const s = MAKE_DESKS[hi % MAKE_DESKS.length]!;
    return [s.x + MAKE_PILE[0], s.y + MAKE_PILE[1]];
  }
  const ai = aiWorkers({ workers } as WorldFrame);
  const ai2 = ai.findIndex((w) => w.id === id);
  if (ai2 >= 0) return [AI_DESKS[ai2]!.x + AI_PILE[0], AI_DESKS[ai2]!.y + AI_PILE[1]];
  return null;
}

/** Split n items over a fixed set of piles, keeping piles even and filling the first piles first. */
export function pileOf(i: number, n: number, piles: number): { pile: number; level: number } {
  const per = Math.max(1, Math.ceil(n / piles));
  return { pile: Math.floor(i / per), level: i % per };
}

// ---- Neighbours ----------------------------------------------------------------------------------------------

/** What a neighbour's bubble shows: coin = would buy; otherwise the one reason they will not. */
export type Glyph = 'coin' | WalkReason | 'dots';

export interface PlacedNeighbour {
  n: NeighbourFrame;
  x: number;
  y: number;
  pose: Pose;
  /** Facing left (the side pose faces right). */
  flip: boolean;
  /** 'walk' glides to x, y in real time; 'step' means x, y already follow the clock and are drawn as given. */
  move: 'walk' | 'step';
  /** Legs swinging (step mode). */
  walking: boolean;
  /** Hidden once the walk ends (they have left the street). */
  gone: boolean;
  bubble: Glyph | null;
  /** Place in the morning queue, for staggered arrivals; -1 when not queueing. */
  queue: number;
}

/** At most this many served neighbours wait by the door; earlier ones have gone on their way. */
export const SERVED_SHOWN = 4;
/** Minutes after opening by which every walk-away has left the street. */
export const LEAVE_BY = 80;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function queueSpot(i: number): Pt2 {
  const cap = STREET.queuePerRow * STREET.queueRows.length;
  const k = i % cap;
  const row = Math.floor(k / STREET.queuePerRow);
  const col = k % STREET.queuePerRow;
  // Later rows shift half a step so heads don't hide behind heads.
  return [STREET.queueX0 + col * STREET.queueStep + (row % 2) * (STREET.queueStep / 2), STREET.queueRows[row]!];
}

function servedSpot(i: number): Pt2 {
  return [STREET.servedX0 + i * STREET.servedStep, STREET.servedY0 + (i % 2) * 4];
}

/**
 * Morning: a queue at the window, the latest few served by the door, the turned-away walking off.
 * Once the day is open: walk-aways turn left and leave, the served head off with their tickets, all by the clock.
 */
export function placeNeighbours(frame: WorldFrame): PlacedNeighbour[] {
  const played = frame.played === true;
  const offset = frame.offset ?? 0;
  const servedTotal = frame.neighbours.filter((n) => n.mood === 'served').length;
  let q = 0;
  let s = 0;
  let a = 0;
  const out: PlacedNeighbour[] = [];
  for (const n of frame.neighbours) {
    const base = { n, flip: false, walking: false, gone: false, queue: -1 };
    if (n.mood === 'buying' || n.mood === 'waiting') {
      const i = q++;
      const [x, y] = queueSpot(i);
      out.push({ ...base, x, y, pose: 'back', move: 'walk', bubble: n.mood === 'buying' ? 'coin' : (n.reason ?? 'price'), queue: i });
    } else if (n.mood === 'leaving') {
      const i = q++;
      const [x0, y] = queueSpot(i);
      if (!played) {
        out.push({ ...base, x: x0 - 320 - i * 20, y, pose: 'side', flip: true, move: 'walk', gone: true, bubble: 'dots' });
        continue;
      }
      const p = clamp01((offset - Math.min(i * 4, LEAVE_BY - 40)) / 36);
      if (p >= 1) continue;
      out.push({ ...base, x: x0 - p * 260, y, pose: p > 0 ? 'side' : 'back', flip: p > 0, move: 'step', walking: p > 0, bubble: 'dots' });
    } else if (n.mood === 'served') {
      const i = s++;
      const shown = i - Math.max(0, servedTotal - SERVED_SHOWN);
      if (shown < 0) {
        // Handed over earlier: on their way down the street, each to a spot of their own.
        out.push({ ...base, x: 1000 + i * 30, y: STREET.servedY0, pose: 'side', move: 'walk', gone: true, bubble: null });
        continue;
      }
      const [x0, y] = servedSpot(shown);
      if (!played) {
        out.push({ ...base, x: x0, y, pose: 'front', move: 'walk', bubble: null });
        continue;
      }
      const p = clamp01((offset - 4 - shown * 6) / 40);
      if (p >= 1) continue;
      out.push({ ...base, x: x0 + p * 820, y, pose: p > 0 ? 'side' : 'front', move: 'step', walking: p > 0, bubble: null });
    } else {
      // Turned away at the window: they walk off along the far pavement.
      const i = a++;
      if (played) continue;
      out.push({ ...base, x: -320 - i * 24, y: STREET.awayY + (i % 2) * 10, pose: 'side', flip: true, move: 'walk', gone: true, bubble: 'dots' });
    }
  }
  return out;
}

const VERB: Record<WorkerFrame['station'], string> = {
  brief: 'briefing',
  make: 'making',
  ai: 'at the AI desk',
  finish: 'finishing',
  kit: 'building the template kit',
  idle: 'free',
  home: 'gone home',
};

const REASON: Record<WalkReason, string> = {
  price: 'price',
  slow: 'too slow',
  scope: 'not the right fit',
  care: 'wants it made by hand',
  lost: 'let down before',
  empty: 'nothing on the window',
};

/** Short mood for a neighbour's accessible name. */
export function moodLabel(n: NeighbourFrame): string {
  if (n.mood === 'buying') return 'would buy';
  if (n.mood === 'waiting') return `won't buy (${REASON[n.reason ?? 'price']})`;
  if (n.mood === 'served') return 'order taken';
  return 'walking away';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function describeFrame(frame: WorldFrame): string {
  const parts: string[] = [];
  const closed = frame.played === true && frame.offset >= 480;
  for (const w of frame.workers.filter((w) => w.kind === 'human')) parts.push(w.mentoring ? w.mentoring === 'pattern' ? `${w.name} in a studio pattern lesson` : `${w.name} mentoring in ${w.mentoring === 'proofing' ? 'proofing' : 'template making'}` : w.patternId ? `${w.name} preparing a studio pattern` : `${w.name} ${VERB[w.station]}`);
  const ai = aiWorkers(frame).filter((w) => !w.retired);
  if (ai.length > 0) {
    if (frame.outage) parts.push(ai.length === 1 ? 'AI desk down' : 'AI desks down');
    else for (const w of ai) parts.push(`${w.name} ${w.working ? 'working' : 'idle'}`);
  }
  if (frame.kit === 'building') parts.push('template kit half built');
  if (frame.kit === 'ready') parts.push('template kit ready');
  const waiting = frame.folders.filter((f) => f.waiting).length;
  parts.push(frame.folders.length ? `${plural(frame.folders.length, 'folder')} open, ${waiting} waiting` : 'no folders open');
  parts.push(frame.packagesTotal ? `${plural(frame.packagesTotal, 'parcel')} delivered` + (frame.packagesToday.length ? `, ${frame.packagesToday.length} today` : '') : 'no parcels delivered yet');
  if (frame.missedToday.length) parts.push(`${plural(frame.missedToday.length, 'promise')} missed today`);
  const buy = frame.neighbours.filter((n) => n.mood === 'buying').length;
  const at = frame.neighbours.filter((n) => n.mood === 'waiting').length + buy;
  const taken = frame.neighbours.filter((n) => n.mood === 'served').length;
  const away = frame.neighbours.length - at - taken;
  if (at) parts.push(`${plural(at, 'neighbour')} at the window, ${buy} would buy`);
  if (taken) parts.push(`${plural(taken, 'order')} taken`);
  if (away) {
    const inView = frame.played ? placeNeighbours(frame).filter((p) => p.n.mood === 'leaving').length : away;
    parts.push(inView ? `${away} walking away` : `${away} walked away`);
  }
  const menu = closed ? 'The sign on the window says Closed.' : frame.menu.length ? `On the window: ${frame.menu.map((o) => `${o.name} ${o.price} cr`).join(', ')}.` : 'Nothing on the window.';
  return `Lantern Works, day ${frame.day + 1} at ${frame.clock}${frame.outage ? ', AI outage' : ''}: ${parts.join(', ')}. ${menu}`;
}
