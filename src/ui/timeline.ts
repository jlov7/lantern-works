// Projects engine state plus the day's event log into what the miniature should show at a given minute.
// The animation reads only this; it never invents or reorders business state.
import { react, type WalkReason } from '../engine/demand';
import { RULES } from '../engine/rules';
import { getScenario, workingOn } from '../engine/sim';
import { mentoringAppointments } from '../engine/mentoring';
import { patternAppointments } from '../engine/patterns';
import type { CompanyState, OfferSpec, SegmentId, Specialization, Stage } from '../engine/types';

export type Station = 'brief' | 'make' | 'ai' | 'finish' | 'kit' | 'idle' | 'home';

export interface WorkerFrame {
  id: string;
  name: string;
  kind: 'human' | 'ai';
  station: Station;
  jobId: string | null;
  /** Actually working this minute (not paused, off shift, or in an outage). */
  working: boolean;
  retired: boolean;
  mentoring?: Specialization | 'pattern';
  patternId?: string;
}

export interface FolderFrame {
  jobId: string;
  castId: string;
  stage: Exclude<Stage, 'done'>;
  /** Waiting for someone to pick it up, as opposed to on a desk being worked. */
  waiting: boolean;
  dueToday: boolean;
  templated: boolean;
  /** The folder's last move today: where it was (stage and holder) and the day offset it moved at. */
  moved?: { stage: Exclude<Stage, 'done'>; holder: string | null; at: number };
}

export interface NeighbourFrame {
  requestId: string;
  castId: string;
  segment: SegmentId;
  mood: 'waiting' | 'buying' | 'leaving' | 'served' | 'declined';
  /** Why they will not buy from this window (absent when they would buy or have been served). */
  reason?: WalkReason;
}

/** A one-off moment of the day the miniature plays as a short animation. */
export interface Beat {
  kind: 'delivered' | 'missed' | 'kit_ready';
  /** Day offset in minutes. */
  at: number;
  jobId?: string;
  castId?: string;
  /** For a miss: the stage the folder was in. */
  stage?: Exclude<Stage, 'done'>;
}

export interface WorldFrame {
  day: number;
  minute: number;
  offset: number;
  clock: string;
  peopleOnShift: boolean;
  outage: boolean;
  workers: WorkerFrame[];
  folders: FolderFrame[];
  packagesToday: string[];
  packagesTotal: number;
  missedToday: string[];
  kit: 'none' | 'building' | 'ready';
  menu: OfferSpec[];
  neighbours: NeighbourFrame[];
  /** True when the frame comes from a day being played (or just closed), false for the planning morning. */
  played?: boolean;
  /** Today's deliveries, misses and kit completions up to this minute, oldest first. */
  beats?: Beat[];
  scenarioId?: string;
}

const DAY = RULES.minutesPerDay;

export function clockLabel(offset: number): string {
  const total = 9 * 60 + offset;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
}

function outageAt(state: CompanyState, minute: number): boolean {
  const day = Math.floor(state.minute / DAY);
  if (minute >= (day + 1) * DAY || state.modifiers.some((m) => m.kind === 'noOutage' && m.day === day)) return false;
  return state.modifiers.some((m) => m.kind === 'outage' && m.day === day) || getScenario(state.config.scenarioId).shocks.some((k) => k.kind === 'ai_outage' && minute >= k.startMinute && minute < k.endMinute);
}

/**
 * @param before the state at the moment the day was opened (morning, after planning)
 * @param after the state after the day ran; its events carry what happened
 * @param minute an absolute minute inside the day being animated, or before.minute for a still frame
 */
export function frameAt(before: CompanyState, after: CompanyState, minute: number): WorldFrame {
  const day = Math.floor(before.minute / DAY);
  const dayStart = day * DAY;
  const offset = Math.max(0, Math.min(DAY, minute - dayStart));
  const animating = after !== before;
  const people = new Set(workingOn(before, day).map((r) => r.id));

  const jobs = new Map(
    before.jobs.map((j) => [
      j.id,
      { id: j.id, castId: j.castId, stage: j.stage, status: j.status === 'scheduled' && j.releaseDay <= day ? 'active' : j.status, assignee: j.assignee, method: j.method, dueAt: j.dueAt, templated: j.templated, moved: undefined as FolderFrame['moved'] },
    ]),
  );
  const beats: Beat[] = [];
  const holders = new Map(before.resources.map((r) => [r.id, r.busyWith]));
  let kit: WorldFrame['kit'] = before.kit.status === 'ready' ? 'ready' : before.kit.status === 'building' ? 'building' : 'none';
  const packagesToday: string[] = [];
  const missedToday: string[] = [];

  // Opening puts down carried work for people who are not in, without emitting a task event.
  for (const r of before.resources) {
    if (r.kind !== 'human' || people.has(r.id)) continue;
    const held = holders.get(r.id);
    if (held === 'kit') kit = 'none';
    else if (held) {
      const j = jobs.get(held);
      if (j) j.assignee = null;
    }
    holders.set(r.id, null);
  }

  if (animating) {
    for (const e of after.events) {
      if (e.day !== day || e.minute > dayStart + offset) continue;
      const j = e.jobId ? jobs.get(e.jobId) : undefined;
      const at = e.minute - dayStart;
      if (j && (e.type === 'task_start' || e.type === 'task_done') && j.stage !== 'done') j.moved = { stage: j.stage, holder: j.assignee, at };
      switch (e.type) {
        case 'task_start':
          if (e.stage === 'kit') {
            kit = 'building';
            holders.set(e.resourceId!, 'kit');
          } else if (e.stage === 'pattern') {
            holders.set(e.resourceId!, e.jobId!);
          } else if (j) {
            j.assignee = e.resourceId!;
            holders.set(e.resourceId!, j.id);
          }
          break;
        case 'task_done':
          if (e.stage === 'pattern') holders.set(e.resourceId!, null);
          if (j) {
            holders.set(e.resourceId!, null);
            j.assignee = null;
            j.stage = j.stage === 'brief' ? 'produce' : j.stage === 'produce' ? 'finish' : j.stage === 'finish' ? 'finish' : j.stage;
          }
          break;
        case 'rework_found':
          if (j) j.stage = 'rework';
          break;
        case 'kit_ready':
          kit = 'ready';
          holders.set(e.resourceId!, null);
          beats.push({ kind: 'kit_ready', at });
          break;
        case 'delivered':
          if (j) {
            beats.push({ kind: 'delivered', at, jobId: j.id, castId: j.castId });
            j.status = 'delivered';
            j.stage = 'done';
            packagesToday.push(j.id);
          }
          break;
        case 'missed':
        case 'refunded_horizon':
          if (j) {
            j.status = e.type === 'missed' ? 'missed' : 'refunded';
            if (e.type === 'missed') {
              missedToday.push(j.id);
              if (j.stage !== 'done') beats.push({ kind: 'missed', at, jobId: j.id, castId: j.castId, stage: j.stage });
            }
            for (const [r, h] of holders) if (h === j.id) holders.set(r, null);
          }
          break;
        default:
          break;
      }
    }
  }

  const late = before.overtimeDays.includes(day) || (animating && after.journal.some((e) => e.day === day && e.minute <= dayStart + offset && e.kind === 'wages' && e.note.startsWith('Overtime until 5pm (')));
  const peopleOnShift = offset < (late ? RULES.aiShift : RULES.humanShift);
  const outage = outageAt(before, dayStart + offset);
  // The morning roster: staffing only changes before a day opens, and a retired desk stays in view while it drains.
  const workers: WorkerFrame[] = before.resources
    .map((r) => {
      const lesson = animating ? [...mentoringAppointments(before, day), ...patternAppointments(before, day)].find(m => (m.learnerId === r.id || m.mentorId === r.id) && offset < m.minutes) : undefined;
      if (lesson) return { id: r.id, name: r.name, kind: r.kind, station: 'brief' as const, jobId: null, working: true, retired: r.retired, mentoring: 'kind' in lesson ? lesson.kind : 'pattern' as const };
      const h = holders.get(r.id) ?? null;
      const j = h && h !== 'kit' ? jobs.get(h) : undefined;
      let station: Station = 'idle';
      if (h === 'kit') station = 'kit';
      else if (before.patterns?.some(p => p.id === h)) station = 'brief';
      else if (j) station = j.stage === 'brief' ? 'brief' : j.stage === 'produce' ? (r.kind === 'ai' ? 'ai' : 'make') : 'finish';
      else if (r.kind === 'ai') station = 'ai';
      if (r.kind === 'human' && (!people.has(r.id) || (animating && !peopleOnShift))) station = 'home';
      const working = h !== null && (r.kind === 'human' ? people.has(r.id) && peopleOnShift && animating : offset < RULES.aiShift && !outage && animating);
      return { id: r.id, name: r.name, kind: r.kind, station, jobId: j?.id ?? null, working, retired: r.retired, ...(before.patterns?.some(p => p.id === h) ? { patternId: h! } : {}) };
    });

  const folders: FolderFrame[] = [];
  for (const j of jobs.values()) {
    if (j.status !== 'active' || j.stage === 'done') continue;
    const f: FolderFrame = { jobId: j.id, castId: j.castId, stage: j.stage, waiting: j.assignee === null, dueToday: j.dueAt <= dayStart + DAY, templated: j.templated };
    if (j.moved) f.moved = j.moved;
    folders.push(f);
  }

  const neighbours: NeighbourFrame[] = before.requests
    .filter((r) => r.day === day && r.source !== 'project')
    .map((r) => {
      let mood: NeighbourFrame['mood'];
      let reason: WalkReason | undefined;
      if (r.status === 'accepted') mood = 'served';
      else if (r.status === 'declined') mood = 'declined';
      else {
        const re = react(r, before.menu, before.lostCast);
        if (re.kind === 'walk') reason = re.reason;
        mood = r.status === 'walked' ? 'leaving' : re.kind === 'buy' ? 'buying' : 'waiting';
      }
      if (animating && (mood === 'buying' || mood === 'waiting')) mood = 'leaving';
      const n: NeighbourFrame = { requestId: r.id, castId: r.castId, segment: r.segment, mood };
      if (reason) n.reason = reason;
      return n;
    });

  const packagesTotal = before.jobs.filter((j) => j.status === 'delivered').length + packagesToday.length;
  return {
    day,
    minute: dayStart + offset,
    offset,
    clock: clockLabel(offset),
    peopleOnShift: animating ? peopleOnShift : true,
    outage,
    workers,
    folders,
    packagesToday,
    packagesTotal,
    missedToday,
    kit,
    menu: before.menu,
    neighbours,
    played: animating,
    beats,
    scenarioId: before.config.scenarioId,
  };
}
