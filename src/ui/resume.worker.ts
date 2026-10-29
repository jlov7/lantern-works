import { reconstruct } from './resumeReplay';
import type { ReplayRequest, ReplayResponse } from './resume';
import { factsForState } from './screens/saves';

self.onmessage = (event: MessageEvent<ReplayRequest>) => {
  let response: ReplayResponse;
  try {
    const steps = reconstruct(event.data.run);
    let result = steps.next();
    while (!result.done) result = steps.next();
    const rebuilt = result.value;
    response = { ok: true, value: rebuilt && event.data.kind === 'facts' ? factsForState(rebuilt.state) : rebuilt };
  } catch {
    response = { ok: false };
  }
  self.postMessage(response);
};
