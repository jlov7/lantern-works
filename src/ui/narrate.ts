// Plain-language lines for the day log, built only from engine events.
import { RULES } from '../engine/rules';
import type { CompanyState, SimEvent } from '../engine/types';
import { castName, credits, hours } from './format';
import { clockLabel } from './timeline';

const DOING = { brief: 'briefing', produce: 'making', finish: 'finishing', rework: 'reworking', done: '', kit: 'building the template kit' } as const;

export interface LogLine {
  key: string;
  time: string;
  text: string;
  tone: 'plain' | 'good' | 'bad';
}

export function narrate(s: CompanyState, e: SimEvent, i: number): LogLine | null {
  const time = clockLabel(e.minute - e.day * RULES.minutesPerDay);
  const job = e.jobId ? s.jobs.find((j) => j.id === e.jobId) : undefined;
  const who = job ? castName(job.castId) : '';
  const res = e.resourceId ? s.resources.find((r) => r.id === e.resourceId)?.name ?? (e.resourceId.startsWith('ai') ? 'The AI desk' : e.resourceId) : '';
  const key = `${e.minute}-${i}`;
  switch (e.type) {
    case 'task_start':
      if (e.stage === 'kit') return { key, time, text: `${res} started building the template kit.`, tone: 'plain' };
      if (e.stage === 'pattern') return { key, time, text: `${res} started preparing a reusable studio pattern.`, tone: 'plain' };
      return { key, time, text: `${res} started ${DOING[e.stage as keyof typeof DOING]} ${who}'s launch.`, tone: 'plain' };
    case 'pattern_ready':
      return { key, time, text: 'The studio pattern is ready. Matching work takes 15 fewer briefing minutes.', tone: 'good' };
    case 'pattern_teaching_start':
      return { key, time, text: `${res} and Tomas have an hour together to learn the pattern.`, tone: 'plain' };
    case 'pattern_teaching_done':
      return { key, time, text: `${res} finished the pattern lesson. She can use it from tomorrow morning.`, tone: 'good' };
    case 'kit_ready':
      return { key, time, text: 'The template kit is ready. Templated work is now faster.', tone: 'good' };
    case 'rework_found':
      return { key, time, text: `${who}'s launch didn't pass finishing. It needs rework.`, tone: 'bad' };
    case 'delivered':
      return { key, time, text: `${who}'s launch delivered. ${credits(e.amount ?? 0)} earned.`, tone: 'good' };
    case 'missed':
      return { key, time, text: `Missed ${who}'s deadline. ${credits(e.amount ?? 0)} refunded, plus a fee.`, tone: 'bad' };
    case 'refunded_horizon':
      return { key, time, text: `${who}'s later launch falls after the season. ${credits(e.amount ?? 0)} refunded.`, tone: 'plain' };
    case 'snag':
      return { key, time, text: `${who} rang with a change: ${hours(e.amount ?? 0)} more finishing.`, tone: 'plain' };
    case 'call':
      return { key, time, text: `${who}'s launch would miss 5pm as things stood. You took the call.`, tone: 'bad' };
    case 'outage_start':
      return { key, time, text: 'The AI desk is down. Its work is paused, not lost.', tone: 'bad' };
    case 'outage_end':
      return { key, time, text: 'The AI desk is back up.', tone: 'good' };
    default:
      return null;
  }
}

export function dayEvents(s: CompanyState, day: number): SimEvent[] {
  return s.events.filter((e) => e.day === day && e.type !== 'day_start' && e.type !== 'day_end' && e.type !== 'walked');
}
