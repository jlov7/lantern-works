import { useCallback, useEffect, useRef, useState } from 'react';
import { applyCommand, createRun, replay } from '../engine/sim';
import type { Command, CompanyState, RunConfig } from '../engine/types';
import { newRunId, trySaveRun, type SaveResult } from './persist';
import { canUndoRun } from './game/careerIdentity';

export interface RunMeta {
  id: string;
  label: string;
  parentId?: string;
  branchDay?: number;
  /** Replays opened from a link stay unsaved until the player keeps a separate copy. */
  readOnly?: boolean;
  /** The guided first season: the game screen walks the player through the first day. */
  guided?: boolean;
}

export interface RunHandle {
  state: CompanyState;
  meta: RunMeta;
  apply: (cmd: Command) => string | null;
  /** The latest state, including commands applied since the last render. */
  current: () => CompanyState;
  undo: () => void;
  canUndo: boolean;
  storageOk: boolean;
  keepCopy: () => void;
  /** 'stale' once another tab has carried this season further; this tab then stops saving over it. */
  saved: SaveResult;
  history?: ResumeHistory;
}

export interface ResumeHistory {
  commandCount: number;
  commandFingerprint: string;
  beforeDay: CompanyState | null;
}

export interface RunInitial {
  state: CompanyState;
  meta: RunMeta;
  history?: ResumeHistory;
}

export function startRun(config: RunConfig, label: string, rulesVersion?: string): { state: CompanyState; meta: RunMeta } {
  return { state: createRun(config, rulesVersion), meta: { id: newRunId(), label } };
}

/** Rewind to the morning of `day` as a new, labelled branch. The original run is left as it was. */
export function branchFrom(state: CompanyState, meta: RunMeta, day: number): { state: CompanyState; meta: RunMeta } {
  let s = createRun(state.config, state.rulesVersion);
  for (const command of state.commands) {
    if (s.day >= day) break;
    s = applyCommand(s, command).state;
  }
  const suffix = ` (branch from day ${day + 1})`;
  const label = `${meta.label.replace(/ \(branch.*\)$/, '').slice(0, 60 - suffix.length)}${suffix}`;
  return { state: s, meta: { id: newRunId(), label, parentId: meta.id, branchDay: day } };
}

export function useRun(initial: RunInitial): RunHandle {
  const [state, setState] = useState(initial.state);
  const [meta, setMeta] = useState(initial.meta);
  const [saved, setSaved] = useState<SaveResult>('saved');
  // apply() and undo() are the only writers, so the ref never lags the rendered state.
  const stateRef = useRef(state);
  const historyRef = useRef(initial.history);

  const persist = useCallback(
    (s: CompanyState, target = meta): SaveResult =>
      trySaveRun({ v: 1, rules: s.rulesVersion, id: target.id, label: target.label, savedAt: new Date().toISOString(), config: s.config, commands: s.commands, ...(target.parentId ? { parentId: target.parentId } : {}), ...(target.branchDay !== undefined ? { branchDay: target.branchDay } : {}) }),
    [meta],
  );

  // Once another tab has moved this season on, this tab stops saving over it.
  const stale = useRef(false);
  const save = useCallback(
    (s: CompanyState) => {
      if (meta.readOnly || stale.current) return;
      const r = persist(s);
      stale.current = r === 'stale';
      setSaved(r);
    },
    [persist, meta.readOnly],
  );

  const keepCopy = useCallback(() => {
    if (!meta.readOnly) return;
    const copy: RunMeta = { id: newRunId(), label: `Copy: ${meta.label.replace(/^Shared: /, '')}` };
    const result = persist(stateRef.current, copy);
    setSaved(result);
    if (result === 'saved') setMeta(copy);
  }, [meta, persist]);

  // Save once on open so a new season shows up in the list, and say at once if this browser is not saving.
  useEffect(() => {
    save(initial.state);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback((cmd: Command) => {
    const res = applyCommand(stateRef.current, cmd);
    if (res.error) return res.error;
    const beforeDay = cmd.type === 'runDay' ? stateRef.current : historyRef.current?.beforeDay;
    if (beforeDay) historyRef.current = { beforeDay, commandCount: res.state.commands.length, commandFingerprint: JSON.stringify(res.state.commands) };
    stateRef.current = res.state;
    setState(res.state);
    save(res.state);
    return null;
  }, [save]);

  // Answering a call completes the opened day, so Undo cannot cross that simulation boundary either.
  const canUndo = canUndoRun(state);

  const undo = useCallback(() => {
    const s = stateRef.current;
    if (!canUndoRun(s)) return;
    const { state: prev } = replay(s.config, s.commands.slice(0, -1), s.rulesVersion);
    if (historyRef.current) historyRef.current = { ...historyRef.current, commandCount: prev.commands.length, commandFingerprint: JSON.stringify(prev.commands) };
    stateRef.current = prev;
    setState(prev);
    save(prev);
  }, [save]);

  const current = useCallback(() => stateRef.current, []);
  return { state, meta, apply, current, undo, canUndo, storageOk: saved !== 'unavailable', keepCopy, saved, history: historyRef.current };
}
