import { RULES } from './rules';
import type { CompanyState, Job, Resource, Specialization } from './types';

export const MENTORING: Record<Specialization, { name: string; mentorId: string; mentor: string; minutes: number; detail: string }> = {
  proofing: { name: 'Proofing with Ada', mentorId: 'h1', mentor: 'Ada', minutes: 90, detail: 'From tomorrow, Noor briefs, finishes and redoes work at 115% of normal time, down from 150%. She still does not make launches.' },
  templates: { name: 'Templates with Tomas', mentorId: 'h2', mentor: 'Tomas', minutes: 120, detail: 'From tomorrow, Noor can make simple templated work at 125% of normal time. Her other tasks still take 150%.' },
};

export function specializationOn(r: Resource, day: number): Specialization | null {
  const m = r.mentorship;
  return r.inheritedSpecialization ?? (m && m.completedAt !== null && m.day < day ? m.kind : null);
}

export function effortPercent(r: Resource, j: Pick<Job, 'stage'>, day: number): number {
  const kind = specializationOn(r, day);
  if (kind === 'proofing' && j.stage !== 'produce') return 115;
  if (kind === 'templates' && j.stage === 'produce') return 125;
  return r.speedPercent;
}

export function canProduce(r: Resource, j: Pick<Job, 'templated' | 'need'>, day: number): boolean {
  return r.role !== 'junior' || (specializationOn(r, day) === 'templates' && j.templated && j.need === 'simple');
}

/** Fixed appointments occupy both people, even if either carried unfinished work from yesterday. */
export function mentoringAppointments(s: CompanyState, day: number): { learnerId: string; mentorId: string; kind: Specialization; minutes: number }[] {
  return s.resources.filter(r => r.mentorship?.day === day).map(r => ({ learnerId: r.id, mentorId: r.mentorship!.mentorId, kind: r.mentorship!.kind, minutes: MENTORING[r.mentorship!.kind].minutes }));
}

export function mentoringMinutes(s: CompanyState, day: number): number {
  return mentoringAppointments(s, day).reduce((n, m) => n + 2 * m.minutes, 0);
}

/** Only actual use by the same, still-employed Noor qualifies as independent work. */
export function noorWork(s: CompanyState): { resource: Resource; kind: Specialization; completed: number } | null {
  const day = Math.min(s.day, RULES.days - 1);
  const resource = s.resources.find(r => r.name === RULES.staff.junior.name && r.fromDay <= day && (r.toDay === null || r.toDay >= s.day) && specializationOn(r, day));
  if (!resource) return null;
  const kind = specializationOn(resource, day)!;
  const starts = s.events.filter(e => e.type === 'task_start' && e.resourceId === resource.id && e.day > (resource.mentorship?.day ?? -1) && (kind === 'templates' ? e.stage === 'produce' : e.stage === 'brief' || e.stage === 'finish' || e.stage === 'rework'));
  const completed = s.events.filter(done => done.type === 'task_done' && starts.some(e => done.resourceId === e.resourceId && done.jobId === e.jobId && done.stage === e.stage && done.minute >= e.minute)).length;
  return { resource, kind, completed };
}
