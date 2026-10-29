// "Your seasons": saved runs with their outcome, progress and last played date. Deleting allows six seconds for an undo.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import type { RunConfig } from '../../engine/types';
import { deleteRun, loadRuns, subscribeRuns } from '../persist';
import type { SavedRun } from '../schema';
import { readSaveFacts, replayFingerprint } from '../resume';
import { lastPlayed, olderSaves, type OlderSave, type SaveFacts } from './saves';

export const UNDO_MS = 6000;
const PAGE_SIZE = 8;

const factKey = (r: SavedRun) => `${r.id}:${replayFingerprint(r)}`;

function resultSummary(f: SaveFacts | null | undefined): string {
  if (f === undefined) return 'Reading the season';
  if (f === null) return 'Could not read this season';
  if (!f.finished) return `${f.served} served so far`;
  if (f.ending) return `${f.ending}. ${f.served} served`;
  return `${f.medal ? `${f.medal[0]!.toUpperCase()}${f.medal.slice(1)}` : 'No medal'}, ${f.served} served`;
}

export function SavesList({ onResume, onStart, onRead }: { onResume: (run: SavedRun) => void; onStart: (config: RunConfig, label: string) => void; onRead: (run: SavedRun, facts: SaveFacts | null) => void }): JSX.Element | null {
  const [runs, setRuns] = useState<SavedRun[]>(loadRuns);
  const [older, setOlder] = useState<OlderSave[]>(olderSaves);
  const [facts, setFacts] = useState<Map<string, SaveFacts | null>>(() => new Map());
  const [pending, setPending] = useState<SavedRun | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [olderVisible, setOlderVisible] = useState(PAGE_SIZE);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [backup, setBackup] = useState<SavedRun | null>(null);
  const [ReplayBackup, setReplayBackup] = useState<typeof import('./ReplayBackup').ReplayBackup | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ id: string; loading: boolean; error?: string } | null>(null);
  const pendingRef = useRef<SavedRun | null>(null);
  const timer = useRef<number | null>(null);
  const undoBtn = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const olderList = useRef<HTMLUListElement>(null);
  const focusOlderAfter = useRef<number | null>(null);
  const focusAfter = useRef<string | null>(null);
  const pointerDown = useRef<number | null>(null);
  const releaseFacts = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingFacts = useRef<(() => void) | null>(null);

  // A finished read can resize both the row and title. Let an in-progress click finish first.
  useEffect(() => {
    const finish = (event: PointerEvent | FocusEvent) => {
      if ('pointerId' in event && event.pointerId !== pointerDown.current) return;
      clearTimeout(releaseFacts.current);
      releaseFacts.current = setTimeout(() => {
        pointerDown.current = null;
        const accept = pendingFacts.current;
        pendingFacts.current = null;
        accept?.();
      }, 0);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    return () => {
      clearTimeout(releaseFacts.current);
      pointerDown.current = null;
      pendingFacts.current = null;
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
    };
  }, []);

  // Another tab saved or deleted: show what is in storage now.
  useEffect(
    () =>
      subscribeRuns((next) => {
        setRuns(next);
        setOlder(olderSaves());
      }),
    [],
  );

  // Read one save at a time off the main thread. Replacement tapes get their own facts.
  useEffect(() => {
    const todo = runs.filter((r) => r.id !== pending?.id).slice(0, visible).filter((r) => !facts.has(factKey(r)));
    if (!todo.length) return;
    let live = true;
    const r = todo[0]!;
    const key = factKey(r);
    const task = readSaveFacts(r);
    const accept = (f: SaveFacts | null) => {
      if (!live) return;
      if (pointerDown.current !== null) {
        pendingFacts.current = () => accept(f);
        return;
      }
      const current = loadRuns().find((saved) => saved.id === r.id);
      if (!current || factKey(current) !== key) {
        setRuns(loadRuns());
        return;
      }
      setFacts((m) => new Map(m).set(key, f));
      onRead(current, f);
    };
    void task.promise.then(accept).catch(() => accept(null));
    return () => {
      live = false;
      task.cancel();
    };
  }, [runs, facts, onRead, visible, pending]);

  const commit = useCallback(() => {
    const p = pendingRef.current;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (!p) return;
    pendingRef.current = null;
    if (!deleteRun(p.id, p)) setDeleteError(`Could not delete ${p.label}. The saved season is still in this browser. It may have changed in another tab, or storage may be unavailable.`);
    setRuns(loadRuns());
    const hadFocus = undoBtn.current !== null && document.activeElement === undoBtn.current;
    setPending(null);
    if (hadFocus) focusAfter.current = 'heading';
  }, []);

  // Leaving the title, or closing the tab, finishes a delete that is waiting for its undo.
  useEffect(() => {
    window.addEventListener('pagehide', commit);
    return () => {
      window.removeEventListener('pagehide', commit);
      commit();
    };
  }, [commit]);

  // Resolve focus in the commit that reveals a row, before a later render can consume the request.
  useLayoutEffect(() => {
    if (focusOlderAfter.current !== null) {
      olderList.current?.children[focusOlderAfter.current]?.querySelector<HTMLButtonElement>('button')?.focus();
      focusOlderAfter.current = null;
    }
    const f = focusAfter.current;
    if (!f) return;
    focusAfter.current = null;
    if (f === 'undo') undoBtn.current?.focus();
    else if (f === 'heading') (list.current?.querySelector<HTMLElement>('button') ?? heading.current)?.focus();
    else list.current?.querySelector<HTMLElement>(`[data-run="${CSS.escape(f)}"] button`)?.focus();
  });

  const remove = (r: SavedRun) => {
    setDeleteError(null);
    commit();
    pendingRef.current = r;
    setPending(r);
    focusAfter.current = 'undo';
    timer.current = window.setTimeout(commit, UNDO_MS);
  };

  const keepReplay = async (run: SavedRun) => {
    if (backupStatus?.loading) return;
    if (ReplayBackup) return setBackup(run);
    setBackupStatus({ id: run.id, loading: true });
    try {
      const module = await import('./ReplayBackup');
      setReplayBackup(() => module.ReplayBackup);
      setBackup(run);
      setBackupStatus(null);
    } catch {
      setBackupStatus({ id: run.id, loading: false, error: 'The replay window could not load. Reconnect, then open a fresh tab using your browser’s controls and paste this address. It opens the title with this browser’s saved seasons. Only saved moves carry over.' });
    }
  };

  const undo = () => {
    const p = pendingRef.current;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pendingRef.current = null;
    setPending(null);
    if (p) focusAfter.current = p.id;
  };

  const available = runs.filter((r) => r.id !== pending?.id);
  const shown = available.slice(0, visible);
  if (!shown.length && !older.length && !pending && !deleteError) return null;
  return (
    <section className="saved" aria-labelledby="saved-h" onPointerDownCapture={event => {
      if (!event.isPrimary) return;
      clearTimeout(releaseFacts.current);
      pointerDown.current = event.pointerId;
    }}>
      <h2 id="saved-h" ref={heading} tabIndex={-1}>
        Your seasons
      </h2>
      <p className="muted small">All seasons are kept in this browser. If storage fills up, new moves cannot be saved.</p>
      {deleteError && <p className="banner" role="alert">{deleteError}</p>}
      {shown.length > 0 && (
        <ul className="saved-list" ref={list}>
          {shown.map((r) => {
            const f = facts.get(factKey(r));
            const done = f?.finished ?? false;
            return (
              <li key={r.id} data-run={r.id} className={`saved-row${done ? ' is-done' : ''}`}>
                <span className={`saved-medal medal-dot-${f?.medal ?? 'none'}`} aria-hidden="true" />
                <span className="saved-text">
                  <span className="saved-label">{r.label}</span>
                  <span className="saved-meta">
                    {f && `${f.progress}. `}{resultSummary(f)}. Last played {lastPlayed(r.savedAt)}.
                  </span>
                </span>
                <span className="saved-actions">
                  <button type="button" className="btn btn-small" onClick={() => onResume(r)} aria-label={`${done ? 'Look back at' : 'Continue'} ${r.label}`}>
                    {done ? 'Look back' : 'Continue'}
                  </button>
                  <button type="button" className="btn btn-small btn-quiet" disabled={!f} aria-label={`Keep replay of ${r.label}`} aria-haspopup="dialog" aria-busy={backupStatus?.id === r.id && backupStatus.loading || undefined} onClick={event => { event.currentTarget.focus({ preventScroll: true }); void keepReplay(r); }}>Keep replay</button>
                  <button type="button" className="btn btn-small btn-quiet" aria-label={`Delete ${r.label}`} onClick={() => remove(r)}>
                    Delete
                  </button>
                  {backupStatus?.id === r.id && <span className="small" role="status">{backupStatus.loading ? 'Opening replay window...' : backupStatus.error}</span>}
                  {backupStatus?.id === r.id && backupStatus.error && <>
                    <label className="field">
                      <span>Game address</span>
                      <input type="text" readOnly size={16} value={location.href} onFocus={event => event.currentTarget.select()} />
                    </label>
                    <button type="button" className="btn btn-small btn-quiet" onClick={() => location.reload()}>Reload this tab</button>
                  </>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {available.length > shown.length && <button type="button" className="btn btn-small" onClick={() => {
        focusAfter.current = available[visible]!.id;
        setVisible(count => count + PAGE_SIZE);
      }}>Show more seasons ({available.length - shown.length} remaining)</button>}
      {pending && (
        <div className="undo-bar" role="status">
          <span>Deleted {pending.label}.</span>
          <button ref={undoBtn} type="button" className="btn btn-small" onClick={undo}>
            Undo
          </button>
        </div>
      )}
      {older.length > 0 && (
        <>
          <h3 className="older-h">Made with an older version</h3>
          <p className="muted small">These seasons were played under earlier rules. They stay in this browser untouched; this version cannot replay them.</p>
          <ul className="saved-list" ref={olderList}>
            {older.slice(0, olderVisible).map((o) => (
              <li key={o.id} className="saved-row is-older">
                <span className="saved-medal medal-dot-none" aria-hidden="true" />
                <span className="saved-text">
                  <span className="saved-label">{o.label}</span>
                  <span className="saved-meta">
                    Made with an older version ({o.rules}). Last played {lastPlayed(o.savedAt)}.
                  </span>
                </span>
                <span className="saved-actions">
                  <button type="button" className="btn btn-small" onClick={() => onStart({ scenarioId: o.scenarioId, seed: o.seed }, o.label.replace(/ \(branch.*\)$/, ''))} aria-label={`Play the same street fresh: ${o.label}`}>
                    Play the same street fresh
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {older.length > olderVisible && <button type="button" className="btn btn-small" onClick={() => {
            focusOlderAfter.current = olderVisible;
            setOlderVisible(count => count + PAGE_SIZE);
          }}>Show more older seasons ({older.length - olderVisible} remaining)</button>}
        </>
      )}
      {backup && ReplayBackup && <ReplayBackup key={`${backup.id}:${replayFingerprint(backup)}`} run={backup} onClose={() => setBackup(null)} />}
    </section>
  );
}
