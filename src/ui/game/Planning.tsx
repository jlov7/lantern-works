// The studio, the AI desk, the street and the promises, as tabs that start closed.
import { useContext, useEffect, useRef, useState, type JSX, type KeyboardEvent, type ReactNode } from 'react';
import { GuideContext } from './guideSteps';

export type PanelId = 'studio' | 'desk' | 'street' | 'promises';
const TABS: { id: PanelId; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'desk', label: 'AI desk' },
  { id: 'street', label: 'Street' },
  { id: 'promises', label: 'Promises' },
];
/** Ask the planning area to show a panel (on a phone, switch to its tab). */
export const SHOW_PANEL = 'lantern:panel';

export function Planning({ panels }: { panels: Record<PanelId, ReactNode> }): JSX.Element {
  // The panels start closed: the morning's decisions come first, and a tab opens its panel on demand. Side by side
  // and open, they made every desktop morning three screens long.
  const [chosen, setTab] = useState<PanelId | null>('studio');
  // The guide's last step points into the studio, so it opens while that step shows.
  const tab = useContext(GuideContext).step === 4 ? 'studio' : chosen;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const on = (e: Event) => setTab((e as CustomEvent<PanelId>).detail);
    window.addEventListener(SHOW_PANEL, on);
    return () => window.removeEventListener(SHOW_PANEL, on);
  }, []);

  const move = (e: KeyboardEvent, i: number) => {
    const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!k && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + k + TABS.length) % TABS.length;
    setTab(TABS[n]!.id);
    tabs.current[n]?.focus();
  };
  return (
    <div className="planning planning-tabs" role="region" aria-label="Plan the studio">
      <div role="tablist" aria-label="Studio, AI desk, street and promises" className="tablist">
        {TABS.map((t, i) => (
          <button key={t.id} ref={(el) => void (tabs.current[i] = el)} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={tab === t.id ? `tp-${t.id}` : undefined} tabIndex={tab === t.id || (tab === null && i === 0) ? 0 : -1} onClick={() => setTab((x) => (x === t.id ? null : t.id))} onKeyDown={(e) => move(e, i)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab && (
        <div role="tabpanel" id={`tp-${tab}`} aria-labelledby={`tab-${tab}`}>
          {panels[tab]}
        </div>
      )}
    </div>
  );
}
