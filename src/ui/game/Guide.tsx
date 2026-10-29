// The guided first day: five coachmarks placed beside the real controls. Never modal, always skippable.
import { useContext, type JSX } from 'react';
import { flushSync } from 'react-dom';
import { GUIDE_STEPS, GuideContext } from './guideSteps';

export const GUIDE_EXIT_TARGETS = ['[data-customer-heading], .reply-receipt', '[data-customer-heading], .reply-receipt, .actionbar .btn-open', '.actionbar .btn-open', '#evening-h', '#tab-studio'];

/** Renders the coachmark for `step` when the guide is on that step. `manual` adds a Next/Done button. */
export function Coach({ step, manual = false, className = '', text }: { step: number; manual?: boolean; className?: string; text?: string }): JSX.Element | null {
  const g = useContext(GuideContext);
  if (g.step !== step) return null;
  const s = GUIDE_STEPS[step]!;
  const last = step === GUIDE_STEPS.length - 1;
  const next = () => {
    flushSync(g.next);
    const heading = document.querySelector<HTMLElement>('.coach-title');
    if (heading) {
      heading.closest('.coach')?.scrollIntoView({ block: 'center' });
      heading.focus({ preventScroll: true });
    } else document.getElementById('tab-studio')?.focus();
  };
  const skip = () => {
    flushSync(g.skip);
  };
  return (
    <aside className={`coach ${className}`} aria-label={`Guide, step ${step + 1} of ${GUIDE_STEPS.length}`}>
      <p className="coach-step">
        Step {step + 1} of {GUIDE_STEPS.length}
      </p>
      <h3 id={`guide-step-${step}`} className="coach-title" tabIndex={-1}>{s.title}</h3>
      <p>{text ?? s.text}</p>
      <div className="coach-actions">
        {manual && (
          <button type="button" className="btn btn-small btn-coach" onClick={next}>
            {last ? 'Done' : 'Next'}
          </button>
        )}
        <button type="button" className="btn btn-small btn-quiet" onClick={skip}>
          {last ? 'Close the guide' : 'Skip the guide'}
        </button>
      </div>
    </aside>
  );
}
