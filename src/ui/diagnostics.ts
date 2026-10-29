// Crash handling. Nothing here touches the network: the report is shown to the player and only leaves
// the page if they copy it themselves.
import { RULES } from '../engine/rules';

export interface DiagnosticReport {
  rulesVersion: string;
  tapeVersion: string;
  message: string;
  stack: string;
  userAgent: string;
  time: string;
}

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

/** What the "Copy diagnostic report" button copies. No saves, no URL (share links carry a season), no key. */
export function diagnosticReport(error: unknown, now = new Date()): DiagnosticReport {
  const e = error instanceof Error ? error : null;
  return {
    rulesVersion: RULES.version,
    tapeVersion: RULES.tapeVersion,
    message: (e ? `${e.name}: ${e.message}` : String(error)).slice(0, MAX_MESSAGE),
    stack: (e?.stack ?? '').slice(0, MAX_STACK),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    time: now.toISOString(),
  };
}

type Listener = (error: unknown) => void;
const listeners = new Set<Listener>();
let firstFatal: { error: unknown } | null = null;

/** Hands an error that escaped React (a throw in a timer, an unhandled rejection) to the recovery screen. */
export function reportFatal(error: unknown): void {
  firstFatal ??= { error };
  for (const l of listeners) l(error);
}

/** Subscribes to fatal errors, replaying one that happened before the subscriber mounted. */
export function onFatal(listener: Listener): () => void {
  listeners.add(listener);
  if (firstFatal) listener(firstFatal.error);
  return () => listeners.delete(listener);
}

export function installGlobalHandlers(): void {
  window.addEventListener('error', (e) => {
    // Benign browser notices (e.g. ResizeObserver loop warnings) and cross-origin "Script error." carry no error object.
    if (e.error != null) reportFatal(e.error);
  });
  window.addEventListener('unhandledrejection', (e) => reportFatal(e.reason));
}
