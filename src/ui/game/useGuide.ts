import { useCallback, useMemo, useState } from 'react';
import type { RunMeta } from '../useRun';
import { GUIDE_STEPS, type GuideApi } from './guideSteps';
import { guideState, markGuideSeen } from './storage';

/** The guided first season (or a replay asked for in settings), on its first morning. Never on a shared link. */
function startsOn(meta: RunMeta, fresh: boolean): number | null {
  if (meta.readOnly || !fresh) return null;
  return meta.guided || guideState() === 'replay' ? 0 : null;
}

export function useGuide(meta: RunMeta, fresh: boolean, answered: boolean): GuideApi & { reach: (step: number) => void; restart: () => void } {
  const [step, setStep] = useState<number | null>(() => startsOn(meta, fresh));
  const [wasAnswered, setWasAnswered] = useState(answered);
  if (answered !== wasAnswered) {
    setWasAnswered(answered);
    if (!answered && step === 2) setStep(1);
  }
  // Any first answer fixes the window, including a refusal or a grouped sale.
  if (answered && step !== null && step < 2) setStep(2);
  const finish = useCallback(() => {
    markGuideSeen();
    setStep(null);
  }, []);
  const next = useCallback(() => setStep((s) => (s === null ? null : s + 1 >= GUIDE_STEPS.length ? (markGuideSeen(), null) : s + 1)), []);
  // A real action can complete a step early; the guide never goes backwards.
  const reach = useCallback((n: number) => setStep((s) => (s === null || s >= n ? s : n)), []);
  const restart = useCallback(() => setStep(0), []);
  return useMemo(() => ({ step, next, skip: finish, reach, restart }), [step, next, finish, reach, restart]);
}
