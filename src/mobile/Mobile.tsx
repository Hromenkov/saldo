// Телефонна частина: нижня панель навігації з камерою, черга фото без зв’язку, інструкція встановлення.
import { useEffect, useRef } from 'react';
import { NAV, useApp, type View } from '../store';
import { Ms } from '../lib';
import { useRecognize } from '../components/useRecognize';
import { dropQueued, listQueued, refreshCount, toFile, useQueued } from './queue';
import { canPrompt, isIos, promptInstall, useInstallable } from './pwa';

const TABS: Record<'owner' | 'acc', [View, View]> = { owner: ['overview', 'docs'], acc: ['docs', 'bank'] };

/** Нижня панель на телефоні (Material 3 navigation bar): дві сторінки, камера посередині, питання і меню */
export function BottomBar() {
  const { s, go, upd } = useApp();
  const queued = useQueued();
  const items = NAV[s.role];
  const tab = (v: View) => {
    const n = items.find(x => x[0] === v); if (!n) return null;
    const badge = n[3]?.(s);
    return (
      <button key={v} className="bb-item" aria-current={s.view === v && !s.drawerOpen ? 'page' : undefined} onClick={() => go(v, { top: true })}>
        <span className="bb-ic"><Ms>{n[1]}</Ms>{badge ? <i className="bb-badge">{badge}</i> : null}</span>
        <span className="bb-l">{v === 'docs' && s.role === 'acc' ? 'Документи' : n[2]}</span>
      </button>
    );
  };
  const [a, b] = TABS[s.role];
  return (
    <nav className="bottombar" aria-label="Швидкі дії">
      {tab(a)}{tab(b)}
      <button className="bb-cam" aria-label="Сфотографувати накладну" onClick={() => upd(d => { d.cameraOpen = true; })}>
        <Ms>photo_camera</Ms>{queued ? <i className="bb-badge" title="Фото чекають на зв’язок">{queued}</i> : null}
      </button>
      {tab('questions')}
      <button className="bb-item" aria-current={s.drawerOpen ? 'page' : undefined} onClick={() => upd(d => { d.drawerOpen = true; })}>
        <span className="bb-ic"><Ms>menu</Ms></span><span className="bb-l">Меню</span>
      </button>
    </nav>
  );
}

/** Надсилає фото з черги, щойно з’являється зв’язок (і при запуску застосунку) */
export function QueueRunner() {
  const { snack } = useApp();
  const recognize = useRecognize();
  const fn = useRef({ recognize, snack }); fn.current = { recognize, snack };
  const busy = useRef(false);

  useEffect(() => {
    const flush = async () => {
      if (busy.current || navigator.onLine === false) return;
      busy.current = true;
      try {
        const q = await listQueued();
        if (!q.length) return;
        await dropQueued(q.map(x => x.id));
        // ті, що знову не пройшли через зв’язок, повертаються в чергу
        const msgs = await fn.current.recognize(q.map(toFile), { queueOffline: true, openOne: false });
        fn.current.snack(['З черги надіслано фото: ' + q.length, ...msgs].join(' · '));
      } finally { busy.current = false; }
    };
    refreshCount().then(flush);
    addEventListener('online', flush);
    return () => removeEventListener('online', flush);
  }, []);
  return null;
}

/** Пункт меню «Встановити на телефон»: системний запит, а де його немає (iPhone) — інструкція */
export function InstallItem() {
  const { openDialog, upd } = useApp();
  const can = useInstallable();
  if (!can) return null;
  const click = async () => {
    upd(d => { d.drawerOpen = false; });
    if (canPrompt()) await promptInstall(); else openDialog({ kind: 'install' });
  };
  return <button className="nav-item sl install-item" onClick={click}><Ms>install_mobile</Ms>Встановити на телефон</button>;
}

export function InstallDialog() {
  const { hideDialog } = useApp();
  const ios = isIos();
  const phone = matchMedia('(pointer: coarse)').matches;
  return (
    <>
      <Ms className="d-ic">install_mobile</Ms>
      <h2 className="headline-s">Сальдо на телефоні</h2>
      <p className="body-m muted" style={{ margin: 0, textAlign: 'center' }}>Без App Store: іконка на головному екрані, камера для накладних, фото без зв’язку надсилаються пізніше.</p>
      <ol className="install-steps body-m">
        {!phone && <li>Відкрийте <b>finance.ukrai.org</b> на телефоні</li>}
        {ios ? <>
          <li>У Safari натисніть <Ms>ios_share</Ms> <b>Поділитися</b></li>
          <li>Оберіть <b>На початковий екран</b>, потім <b>Додати</b></li>
        </> : <>
          <li>У Chrome відкрийте меню <Ms>more_vert</Ms></li>
          <li>Оберіть <b>Встановити застосунок</b> або <b>Додати на головний екран</b></li>
          <li>Утримуйте іконку Сальдо, щоб одразу відкрити <b>Сфотографувати накладну</b></li>
        </>}
      </ol>
      <div className="actions"><button className="btn btn-text sl" onClick={hideDialog}>Зрозуміло</button></div>
    </>
  );
}
