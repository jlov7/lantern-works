import { useState } from 'react';

type Handbook = typeof import('./StudioHandbook').StudioHandbook;
let ready: Handbook | null = null;

/** Keep the handbook and its paper styles out of the title's first load. */
export function HandbookButton() {
  const [Handbook, setHandbook] = useState<Handbook | null>(() => ready);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const show = async () => {
    if (loading) return;
    setError(false);
    if (Handbook) return setOpen(true);
    setLoading(true);
    try {
      const module = await import('./StudioHandbook');
      ready = module.StudioHandbook;
      setHandbook(() => module.StudioHandbook);
      setOpen(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  return <>
    <button type="button" className="btn" aria-haspopup="dialog" aria-busy={loading || undefined} onClick={event => { event.currentTarget.focus({ preventScroll: true }); void show(); }}>
      Studio handbook
    </button>
    {loading && <p className="small" role="status">Opening the handbook...</p>}
    {error && <>
      <p className="small" role="status">The handbook could not load. Reconnect, then open a fresh tab using your browser’s controls and paste this address. It opens the title with this browser’s saved seasons. Only saved moves carry over.</p>
      <label className="field">
        <span>Game address</span>
        <input type="text" readOnly size={16} value={location.href} onFocus={event => event.currentTarget.select()} />
      </label>
      <button type="button" className="btn btn-small btn-quiet" onClick={() => location.reload()}>Reload this tab</button>
    </>}
    {open && Handbook && <Handbook onClose={() => setOpen(false)} />}
  </>;
}
