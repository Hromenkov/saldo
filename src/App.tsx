import { useEffect, useState } from 'react';
import { NAV, useApp, type View } from './store';
import { cx, Ms } from './lib';
import { Main } from './MainView';
import { Assistant } from './components/Assistant';
import { Overlays } from './components/Overlays';
import { Onboarding } from './components/Onboarding';
import { Capture } from './mobile/Capture';
import { BottomBar, InstallItem, QueueRunner } from './mobile/Mobile';

const useWide = () => {
  const q = '(min-width: 1201px)';
  const [wide, setWide] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q); const on = () => setWide(m.matches);
    m.addEventListener('change', on); return () => m.removeEventListener('change', on);
  }, []);
  return wide;
};

function Drawer() {
  const { s, upd, go, openDialog } = useApp();
  const total = 51, done = s.docs.filter(d => d.st === 'ok').length + 43;
  const pct = Math.round(done / total * 100);
  const setRole = (r: 'owner' | 'acc') => { upd(d => { d.role = r; }); go(r === 'owner' ? 'overview' : 'docs'); };
  const meta = s.biz ? `${s.biz.b.t} · ${s.biz.group}` : 'Кав’ярня · ТОВ, загальна система';
  return (
    <nav className={cx('drawer', s.drawerOpen && 'open')} id="drawer" aria-label="Навігація">
      <button className="fab" id="uploadBtn" onClick={() => openDialog({ kind: 'upload' })}><Ms>add</Ms>Завантажити</button>
      <button className="company sl" onClick={() => upd(d => { d.onbOpen = true; })}>
        <span className="ic">ТП</span>
        <span className="t"><div className="title-s">ТОВ «Приклад»</div><div className="body-s muted" id="compMeta">{meta}</div></span>
        <Ms className="muted">unfold_more</Ms>
      </button>
      <div className="segmented block" role="group" aria-label="Роль">
        <button id="roleOwner" aria-pressed={s.role === 'owner'} onClick={() => setRole('owner')}><Ms>check</Ms>Власник</button>
        <button id="roleAcc" aria-pressed={s.role === 'acc'} onClick={() => setRole('acc')}><Ms>check</Ms>Бухгалтер</button>
      </div>
      <div id="navItems">
        {NAV[s.role].map(([k, ic, label, badge]) => (
          <button key={k} className="nav-item sl" data-view={k} aria-current={s.view === k ? 'page' : undefined} onClick={() => go(k as View)}>
            <Ms>{ic}</Ms>{label}<span className="badge">{badge ? badge(s) : ''}</span>
          </button>
        ))}
        <InstallItem />
      </div>
      <div className="drawer-foot">
        <div className="label-m muted">ЛИСТОПАД 2026</div>
        <div className="storage"><span id="monthBar" style={{ width: pct + '%' }} /></div>
        <div className="body-s muted" id="monthTxt">Місяць оброблено на {pct}%</div>
      </div>
    </nav>
  );
}

export default function App() {
  const { upd, snack } = useApp();
  const wide = useWide();
  const [assistOpen, setAssistOpen] = useState(wide);
  // при зміні ширини вікна: на широкому помічник відкритий, на вузькому схований
  useEffect(() => setAssistOpen(wide), [wide]);
  // На широкому екрані помічник займає колонку, на вузькому виїжджає поверх сторінки
  const bodyCls = cx('body', (!wide || assistOpen) && 'with-assist');

  return (
    <>
      <div className="app">
        <header className="topbar">
          <button className="icon-btn sl menu-btn" id="menuBtn" aria-label="Меню" onClick={() => upd(d => { d.drawerOpen = true; })}><Ms>menu</Ms></button>
          <div className="brand"><span className="brand-mark">С</span><span className="word"><b>Сальдо</b></span></div>
          <label className="search" aria-label="Пошук">
            <button className="icon-btn sl" tabIndex={-1} aria-hidden="true"><Ms>search</Ms></button>
            <input type="search" id="q" placeholder="Пошук документів, контрагентів, операцій"
              onKeyDown={e => { const v = e.currentTarget.value.trim(); if (e.key === 'Enter' && v) snack(`Пошук «${v}»: знайдено 3 документи і 2 операції`); }} />
            <button className="icon-btn sl" aria-label="Фільтри"><Ms>tune</Ms></button>
          </label>
          <div className="top-actions">
            <button className="icon-btn sl" id="assistBtn" aria-label="Помічник" aria-pressed={assistOpen} title="Помічник" onClick={() => setAssistOpen(o => !o)}><Ms>forum</Ms></button>
            <button className="icon-btn sl hide-sm" aria-label="Довідка"><Ms>help</Ms></button>
            <button className="icon-btn sl hide-sm" aria-label="Налаштування"><Ms>settings</Ms></button>
            <span className="avatar" title="Андрій">А</span>
          </div>
        </header>
        <div className={bodyCls}>
          <Drawer />
          <Main />
          <Assistant open={assistOpen} wide={wide} onClose={() => setAssistOpen(false)} />
        </div>
      </div>
      <BottomBar />
      <Onboarding />
      <Overlays />
      <Capture />
      <QueueRunner />
    </>
  );
}
