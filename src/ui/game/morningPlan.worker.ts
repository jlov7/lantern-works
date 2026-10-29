import { computeMorningPlan, type MorningPlanRequest, type MorningPlanResponse } from './morningPlan';

self.onmessage = (event: MessageEvent<MorningPlanRequest>) => {
  const { generation, key, state, selected, drafts } = event.data;
  let response: MorningPlanResponse;
  try { response = { generation, key, ok: true, plan: computeMorningPlan(state, selected, drafts) }; }
  catch { response = { generation, key, ok: false }; }
  self.postMessage(response);
};
