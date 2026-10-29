// One small ad from the street's noticeboard each morning, in the voice of the gazette's classifieds: the panel
// quoted those more than anything else, but they only appeared on the last screen. Pure and seeded by the day.
import { RULES } from '../../engine/rules';
import type { CompanyState } from '../../engine/types';
import { castBusiness, castName } from '../format';

const EVERYDAY = [
  'Found: one glove, left-handed, by the Lantern Works door. Ask Ada.',
  'Choir practice moves to Thursday. Lantern Works has been asked, kindly, not to sing.',
  'Lost: a cat called Biscuit, last seen in the Moonrise Bakery queue.',
  'Tomas would like whoever borrowed the good stapler to put it back. No questions asked.',
  'The Pocket Stage needs chairs. Lantern Works has offered three, two of them steady.',
  'Wanted: a name for the street\'s new pigeon. Ada suggests "Deadline".',
  'Clem Jazz Bar: open mic on Friday. Studios welcome, kettles not.',
  'For swap: one very large umbrella, for one normal umbrella and some peace.',
  'The bus to the square is late again. So, says Tomas, is everything else.',
  'Free to a good home: a box of fonts nobody can read. Lantern Works, side door.',
  'The flower stall now sells "launch bouquets". Nobody knows what they are. They are selling well.',
  'Someone has drawn a lantern in the steam on the bakery window. Mara is keeping it.',
];

const WITH_AI = ['The AI desk would like a name. Tomas has suggested "Desk".', 'Notice: the AI desk wrote a sonnet about deadlines overnight. It has been filed.'];
const WITH_NOOR = ['Noor has started a fonts club. Members so far: Noor.', 'Noor has labelled the kettle. Then the label. Then Tomas.'];

/** This morning's noticeboard line, or null on the first morning. Last night's news comes first, then the street. */
export function noticeOf(s: CompanyState): string | null {
  if (s.day === 0 || s.finished) return null;
  const y = s.day - 1;
  const last = (type: string) => s.events.find((e) => e.day === y && e.type === type && e.jobId);
  const castOf = (jobId: string | undefined) => s.jobs.find((j) => j.id === jobId)?.castId;
  const missed = castOf(last('missed')?.jobId);
  if (missed) {
    const n = castName(missed);
    return [`Lantern Works says sorry to ${n}. A biscuit is on its way.`, `Apology, public: Lantern Works to ${n}, for yesterday. Ada wrote it, Tomas spelled it.`, `${n} has been sent flowers by Lantern Works. The flowers were on time.`][s.day % 3]!;
  }
  const took = castOf(last('takeoff')?.jobId);
  if (took) return [`${castBusiness(took)} has run out of nearly everything. Neighbours are blaming a launch.`, `Queue outside ${castBusiness(took)} now reaches the bus stop. The bus is not pleased.`][s.day % 2]!;
  if (s.overtimeDays.includes(y)) return 'A late lamp at Lantern Works was mistaken for a lighthouse. Again.';
  const noor = s.resources.find((r) => r.role === 'junior' && r.name === RULES.staff.junior.name);
  if (noor?.fromDay === s.day) return 'Noor starts at Lantern Works today. She has brought her own fonts.';
  const pool = [...EVERYDAY, ...(s.staffing.aiTier !== 'none' ? WITH_AI : []), ...(noor && noor.fromDay < s.day ? WITH_NOOR : [])];
  return pool[(s.day * 5 + s.config.seed.length) % pool.length]!;
}
