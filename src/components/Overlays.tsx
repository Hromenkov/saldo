import { useEffect } from 'react';
import { useApp } from '../store';
import { AssetSheet } from '../views/Assets';
import { cx } from '../lib';
import { DocSheet } from './overlays/DocSheet';
import { OpSheet } from './overlays/OpSheet';
import { ActDialog, PlanDialog, SignDialog, UploadDialog } from './overlays/dialogs';

export function Overlays() {
  const { s, closeSheet, hideDialog, snackState, closeSnack } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { closeSheet(); hideDialog(); } };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [closeSheet, hideDialog]);
  const dl = s.dialog;
  return (
    <>
      <div className={cx('scrim', (s.sheetOpen || s.drawerOpen) && 'open')} id="scrim" onClick={closeSheet} />
      <aside className={cx('sheet', s.sheetOpen && 'open')} id="sheet" aria-label="Документ">
        {s.sheet?.kind === 'doc' && <DocSheet key={s.overlaySeq} id={s.sheet.id} />}
        {s.sheet?.kind === 'op' && <OpSheet key={s.overlaySeq} i={s.sheet.i} />}
        {s.sheet?.kind === 'asset' && <AssetSheet key={s.overlaySeq} id={s.sheet.id} />}
      </aside>
      <div className={cx('scrim', s.dialogOpen && 'open')} id="dlgScrim" onClick={hideDialog} />
      <div className="dialog-wrap"><div className={cx('dialog', s.dialogOpen && 'open')} id="dialog" role="dialog" aria-modal="true">
        {dl?.kind === 'sign' && <SignDialog key={s.overlaySeq} name={dl.name} per={dl.per} />}
        {dl?.kind === 'upload' && <UploadDialog key={s.overlaySeq} />}
        {dl?.kind === 'plan' && <PlanDialog key={s.overlaySeq} />}
        {dl?.kind === 'act' && <ActDialog key={s.overlaySeq} cp={dl.cp} edrpou={dl.edrpou} />}
      </div></div>
      <div className={cx('snack', snackState.open && 'open')} id="snack" role="status">
        <span id="snackTxt">{snackState.text}</span>
        <button className="btn btn-text sl" id="snackUndo" hidden={!snackState.undo} onClick={() => closeSnack(true)}>Скасувати</button>
      </div>
    </>
  );
}
