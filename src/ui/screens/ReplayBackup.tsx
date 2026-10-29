import { useEffect, useId, useState } from 'react';
import { Modal } from '../Dialogs';
import { encodeShare } from '../persist';
import type { SavedRun } from '../schema';
import '../../styles/replay-backup.css';

export function ReplayBackup({ run, onClose }: { run: SavedRun; onClose: () => void }) {
  const [prepared, setPrepared] = useState<{ url: string } | { error: true } | null>(null);
  const [status, setStatus] = useState('');
  const note = useId();
  useEffect(() => {
    let live = true;
    void encodeShare(run.config, run.commands, run.label.slice(0, 40), run.rules).then(
      encoded => { if (live) setPrepared({ url: `${location.origin}${location.pathname}#s=${encoded}` }); },
      () => { if (live) setPrepared({ error: true }); },
    );
    return () => { live = false; };
  }, [run]);
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Replay link copied. Keep the complete link somewhere safe.');
    } catch {
      setStatus('Copying is blocked here. Select the complete replay link above and copy it yourself.');
    }
  };
  return <Modal title="Keep a replay" onClose={onClose}>
    <div className="replay-backup">
      <p className="replay-backup-season">{run.label || 'Your season'}</p>
      <p id={note}>The link is prepared on your device. It includes your moves, artwork and any text you put on prints. Anyone with the link can view them.</p>
      {prepared === null ? <p role="status">Preparing your replay link...</p> : 'error' in prepared ?
        <p role="status">This season could not be made into a replay link. Long histories can exceed the link limits. Your saved season has not been changed.</p> : <>
          <label className="field">
            <span>Complete replay link</span>
            <textarea readOnly rows={4} value={prepared.url} aria-describedby={note} onFocus={event => event.currentTarget.select()} />
          </label>
          <p className="small">Keep the complete link in a note or bookmark. Open it to look back, then save a copy if you want to keep that season in the browser.</p>
          <button type="button" className="btn" onClick={() => void copy(prepared.url)}>Copy replay link</button>
        </>}
      {status && <p className="small" role="status">{status}</p>}
    </div>
  </Modal>;
}
