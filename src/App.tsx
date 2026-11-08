import { useEffect, useState } from 'react';
import { NAV, useApp, type View } from './store';
import { cx, Ms } from './lib';
import { Main } from './MainView';
import { Assistant } from './components/Assistant';
import { Overlays } from './components/Overlays';
import { Onboarding } from './components/Onboarding';

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
  const { s, upd, go, snack } = useApp();
  const total = 51, done = s.docs.filter(d => d.st === 'ok').length + 43;
  const pct = Math.round(done / total * 100);
  const setRole = (r: 'owner' | 'acc') => { upd(d => { d.role = r; }); go(r === 'owner' ? 'overview' : 'docs'); };
  const meta = s.biz ? `${s.biz.b.t} · ${s.biz.group}` : 'Кав’ярня · ТОВ, загальна система';
  return (
    <nav className={cx('drawer', s.drawerOpen && 'open')} id="drawer" aria-label="Навігація">
      <div className="brand"><span className="brand-mark">С</span><span className="word">Сальдо</span>
        <button className="icon-btn sl" aria-label="Сповіщення"><Ms>notifications</Ms></button></div>
      <label className="search" aria-label="Пошук">
        <Ms>search</Ms>
        <input type="search" id="q" placeholder="Пошук..."
          onKeyDown={e => { const v = e.currentTarget.value.trim(); if (e.key === 'Enter' && v) snack(`Пошук «${v}»: знайдено 3 документи і 2 операції`); }} />
        <span className="kbd">/</span>
      </label>
      <button className="company sl" onClick={() => upd(d => { d.onbOpen = true; })}>
        <span className="ic">ТП</span>
        <span className="t"><div className="title-s">ТОВ «Приклад»</div><div className="body-s muted" id="compMeta">{meta}</div></span>
        <Ms className="muted">unfold_more</Ms>
      </button>
      <div className="segmented block" role="group" aria-label="Роль">
        <button id="roleOwner" aria-pressed={s.role === 'owner'} onClick={() => setRole('owner')}><Ms>check</Ms>Власник</button>
        <button id="roleAcc" aria-pressed={s.role === 'acc'} onClick={() => setRole('acc')}><Ms>check</Ms>Бухгалтер</button>
      </div>
      <div className="nav-group">Робочий простір</div>
      <div id="navItems">
        {NAV[s.role].map(([k, ic, label, badge]) => (
          <button key={k} className="nav-item sl" data-view={k} aria-current={s.view === k ? 'page' : undefined} onClick={() => go(k as View)}>
            <Ms>{ic}</Ms>{label}<span className="badge">{badge ? badge(s) : ''}</span>
          </button>
        ))}
      </div>
      <div className="drawer-foot">
        <div className="month-frame">
          <div className="hd">Листопад 2026</div>
          <div className="bd">
            <div className="body-s muted" id="monthTxt">Місяць оброблено на {pct}%. Закриття до 5 грудня.</div>
            <div className="storage"><span id="monthBar" style={{ width: pct + '%' }} /></div>
            <div className="row"><span><b>{pct}%</b>оброблено</span><span><b>{100 - pct}%</b>лишилось</span></div>
          </div>
        </div>
        <div className="user-row"><span className="avatar">А</span><span className="t"><div>Андрій</div><div className="muted">ТОВ «Приклад»</div></span>
          <button className="icon-btn sl" aria-label="Налаштування"><Ms>more_horiz</Ms></button></div>
      </div>
    </nav>
  );
}

export default function App() {
  const { s, upd, openDialog } = useApp();
  const wide = useWide();
  const [assistOpen, setAssistOpen] = useState(wide);
  // при зміні ширини вікна: на широкому помічник відкритий, на вузькому схований
  useEffect(() => setAssistOpen(wide), [wide]);
  // На широкому екрані помічник займає колонку, на вузькому виїжджає поверх сторінки
  const bodyCls = cx('body', (!wide || assistOpen) && 'with-assist');
  const page = NAV[s.role].find(n => n[0] === s.view)?.[2] ?? NAV.owner.concat(NAV.acc).find(n => n[0] === s.view)?.[2] ?? '';

  return (
    <>
      <div className="app">
        <Drawer />
        <div className="main-col">
          <header className="topbar">
            <button className="icon-btn sl menu-btn" id="menuBtn" aria-label="Меню" onClick={() => upd(d => { d.drawerOpen = true; })}><Ms>menu</Ms></button>
            <nav className="crumbs" aria-label="Де ви">
              <span className="co"><i />ТОВ «Приклад»</span><Ms className="sep">chevron_right</Ms><span className="cur">{page}</span>
            </nav>
            <div className="top-actions">
              {s.view !== 'docs' && <button className="btn btn-filled sl" id="uploadBtn" onClick={() => openDialog({ kind: 'upload' })}><Ms>add</Ms><span className="lbl">Завантажити</span></button>}
              <button className="icon-btn sl" id="assistBtn" aria-label="Помічник" aria-pressed={assistOpen} title="Помічник" onClick={() => setAssistOpen(o => !o)}><Ms>forum</Ms></button>
              <button className="icon-btn sl hide-sm" aria-label="Довідка"><Ms>help</Ms></button>
            </div>
          </header>
          <div className={bodyCls}>
            <Main />
            <Assistant open={assistOpen} wide={wide} onClose={() => setAssistOpen(false)} />
          </div>
        </div>
      </div>
      <Onboarding />
      <Overlays />
    </>
  );
}
