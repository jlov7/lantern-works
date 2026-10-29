import type { Request } from '../../engine/types';

/** Advance in arrival order, wrapping to unanswered neighbours before the current one. */
export function nextCustomer(requests: readonly Pick<Request, 'id' | 'status'>[], current: string | null): string | null {
  const at = requests.findIndex(r => r.id === current);
  return [...requests.slice(at + 1), ...requests.slice(0, at + 1)].find(r => r.status === 'waiting')?.id ?? null;
}
