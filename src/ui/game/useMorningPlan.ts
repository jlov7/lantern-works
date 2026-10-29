import { useEffect, useMemo, useState } from 'react';
import type { CompanyState } from '../../engine/types';
import { startMorningPlan, type MorningPlan, type MorningDrafts } from './morningPlan';

const NO_DRAFTS: MorningDrafts = {};

interface Frame {
  token: { state: CompanyState; selected: string | null; enabled: boolean; scope: string; drafts: MorningDrafts };
  snapshot: { state: CompanyState; selected: string | null; plan: MorningPlan } | null;
  error: string | null;
}

/** Scope changes cancel planning, for example when navigating away from the morning. */
export function useMorningPlan(state: CompanyState, selected: string | null, enabled = true, scope = '', drafts: MorningDrafts = NO_DRAFTS) {
  const [frame, setFrame] = useState<Frame | null>(null);
  // A new token also prevents a previous A frame resurfacing after A -> B -> A navigation or Undo.
  const token = useMemo(() => ({ state, selected, enabled, scope, drafts }), [state, selected, enabled, scope, drafts]);
  const matches = enabled && frame?.token === token;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const task = startMorningPlan(state, selected, { drafts });
    void task.promise.then(result => {
      if (active && result) setFrame({ token, snapshot: { state, selected, plan: result }, error: null });
    }, () => {
      if (active) setFrame(previous => ({ token, snapshot: previous?.snapshot ?? null, error: 'This morning could not be planned. Please try again.' }));
    });
    return () => { active = false; task.cancel(); };
  }, [state, selected, enabled, scope, drafts, token]);
  // Draft edits keep their controls mounted; commitments wait for the matching quote.
  const draftPending = enabled && !matches && !frame?.error && frame?.token.state === state && frame.token.selected === selected && frame.token.scope === scope && frame.token.drafts !== drafts;
  return { result: matches && !frame.error ? frame.snapshot?.plan ?? null : null, retained: frame?.snapshot ?? null, draftPending, pending: enabled && (!matches || (frame.snapshot === null && frame.error === null)), error: matches ? frame.error : null };
}
