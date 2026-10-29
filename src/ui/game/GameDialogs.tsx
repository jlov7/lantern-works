// The game screen's dialogs: the workshop, the books, settings, and the Claude key over any of them.
import { lazy, Suspense, useEffect, type JSX } from 'react';
import type { CompanyState, OfferSpec } from '../../engine/types';
import { BooksDialog, KeyDialog } from '../Dialogs';
import { SettingsDialog } from '../SettingsDialog';
import { deleteRun, loadRuns, type Prefs } from '../persist';
import type { DialogKind } from './useDialogs';

// The workshop is opened on demand, so its code (and the offline offer parser) stays out of the first load.
// It is fetched shortly after the game screen appears, so opening it does not wait on the network.
const loadWorkshop = () => import('../OfferWorkshop');
const OfferWorkshop = lazy(() => loadWorkshop().then((m) => ({ default: m.OfferWorkshop })));

interface Props {
  dialog: DialogKind | null;
  state: CompanyState;
  /** The state the books show: this morning's while the day plays. */
  booksState: CompanyState;
  prefs: Prefs;
  close: () => void;
  keyOpen: boolean;
  closeKey: () => void;
  onSaveOffer: (offer: OfferSpec, slot: number) => string | null;
  onOpenKey: () => void;
  onKeyClosed: () => void;
  onPrefs: (p: Prefs) => void;
  onReplayGuide: () => void;
}

export function GameDialogs({ dialog, keyOpen, closeKey, ...p }: Props): JSX.Element {
  useEffect(() => {
    const id = setTimeout(() => void loadWorkshop().catch(() => undefined), 1500);
    return () => clearTimeout(id);
  }, []);
  return (
    <>
      {dialog && <MainDialog dialog={dialog} {...p} />}
      {keyOpen && <KeyDialog onClose={() => (p.onKeyClosed(), closeKey())} />}
    </>
  );
}

function MainDialog({ dialog, state, booksState, prefs, close, onSaveOffer, onOpenKey, onPrefs, onReplayGuide }: Omit<Props, 'keyOpen' | 'closeKey' | 'dialog'> & { dialog: DialogKind }): JSX.Element {
  switch (dialog.kind) {
    case 'workshop':
      return (
        <Suspense fallback={null}>
          <OfferWorkshop state={state} slot={dialog.slot} onClose={close} onOpenKey={onOpenKey} onSave={(o, slot) => {
            const err = onSaveOffer(o, slot);
            if (err === null) close();
            return err;
          }} />
        </Suspense>
      );
    case 'books':
      return <BooksDialog state={booksState} onClose={close} />;
    case 'settings':
      return (
        <SettingsDialog
          prefs={prefs}
          onChange={onPrefs}
          onReplayTutorial={() => (onReplayGuide(), close())}
          onDeleteAllSaves={() => loadRuns().forEach((r) => deleteRun(r.id))}
          onClose={close}
        />
      );
  }
}
