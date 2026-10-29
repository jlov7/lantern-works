import { useEffect, useId, useRef, useState, type JSX } from 'react';
import { Modal } from './Dialogs';
import { HandbookButton } from './HandbookButton';

export type Speed = 0.5 | 1 | 2 | 4;
export type MotionPref = 'system' | 'reduce' | 'full';

/** Player settings shown in SettingsDialog. Storage is the caller's job. */
export interface SettingsPrefs {
  speed: Speed;
  sound: boolean;
  motion: MotionPref;
  studioView?: 'miniature' | 'illustrated';
}

const SPEEDS: Speed[] = [0.5, 1, 2, 4];
const MOTIONS: { id: MotionPref; label: string }[] = [
  { id: 'system', label: 'Follow this device' },
  { id: 'reduce', label: 'Reduce motion' },
  { id: 'full', label: 'Full motion' },
];

export interface SettingsDialogProps {
  prefs: SettingsPrefs;
  /** Called with the whole new settings object on every change. */
  onChange: (prefs: SettingsPrefs) => void;
  onReplayTutorial: () => void;
  /** Called after the player confirms. */
  onDeleteAllSaves: () => void;
  onClose: () => void;
}

export function SettingsDialog({ prefs, onChange, onReplayTutorial, onDeleteAllSaves, onClose }: SettingsDialogProps): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  const del = useRef<HTMLButtonElement>(null);
  const name = useId();
  useEffect(() => {
    if (confirming) keep.current?.focus();
  }, [confirming]);
  return (
    <Modal title="Settings" onClose={onClose}>
      <fieldset className="setting">
        <legend>Day speed</legend>
        <div className="seg-row">
          {SPEEDS.map((s) => (
            <label key={s} className={`seg-pill${prefs.speed === s ? ' is-on' : ''}`}>
              <input type="radio" name={`${name}-speed`} checked={prefs.speed === s} onChange={() => onChange({ ...prefs, speed: s })} />
              {s === 0.5 ? 'Half' : `${s}x`}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="setting">
        <legend>Motion</legend>
        <div className="seg-row">
          {MOTIONS.map((m) => (
            <label key={m.id} className={`seg-pill${prefs.motion === m.id ? ' is-on' : ''}`}>
              <input type="radio" name={`${name}-motion`} checked={prefs.motion === m.id} onChange={() => onChange({ ...prefs, motion: m.id })} />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="setting setting-check">
        <input type="checkbox" checked={prefs.sound} onChange={(e) => onChange({ ...prefs, sound: e.target.checked })} />
        Sound
      </label>
      <fieldset className="setting">
        <legend>Studio view</legend>
        <div className="seg-row">
          {([undefined, 'miniature', 'illustrated'] as const).map(view => <label key={view ?? 'automatic'} className={`seg-pill${prefs.studioView === view ? ' is-on' : ''}`}>
            <input type="radio" name={`${name}-studio`} checked={prefs.studioView === view} onChange={() => onChange({ ...prefs, studioView: view })} />
            {view === 'miniature' ? 'Miniature room' : view === 'illustrated' ? 'Illustrated studio' : 'Automatic'}
          </label>)}
        </div>
        <p>Automatic chooses a view for this device. The illustration uses less graphics power.</p>
      </fieldset>
      <div className="setting">
        <HandbookButton />
      </div>
      <div className="setting">
        <button type="button" className="btn" onClick={onReplayTutorial}>
          Show the tutorial again
        </button>
      </div>
      <div className="setting setting-danger">
        {deleted ? (
          <p role="status">All saves deleted.</p>
        ) : confirming ? (
          <div role="group" aria-labelledby={`${name}-confirm`}>
            <p id={`${name}-confirm`}>Delete every saved season in this browser? This cannot be undone. Stamps are kept.</p>
            <div className="row wrap">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  onDeleteAllSaves();
                  setConfirming(false);
                  setDeleted(true);
                }}
              >
                Delete all saves
              </button>
              <button
                ref={keep}
                type="button"
                className="btn"
                onClick={() => {
                  setConfirming(false);
                  requestAnimationFrame(() => del.current?.focus());
                }}
              >
                Keep them
              </button>
            </div>
          </div>
        ) : (
          <button ref={del} type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
            Delete all saves...
          </button>
        )}
      </div>
    </Modal>
  );
}
