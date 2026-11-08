import { useEffect, useState } from 'react';
import { NAV, useApp, type View } from './store';
import { Avatar, Button, Label, ProgressBar, ToggleButton, ToggleButtonGroup } from '@heroui/react';
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
  const { s, upd, go, openDialog } = useApp();
  const total = 51, done = s.docs.filter(d => d.st === 'ok').length + 43;
  const pct = Math.round(done / total * 100);
  const setRole = (r: 'owner' | 'acc') => { upd(d => { d.role = r; }); go(r === 'owner' ? 'overview' : 'docs'); };
  const meta = s.biz ? `${s.biz.b.t} · ${s.biz.group}` : 'Кав’ярня · ТОВ, загальна система';
  return (
    <nav className={cx('drawer', s.drawerOpen && 'open')} id="drawer" aria-label="Навігація">
      <Button className="fab-h" id="uploadBtn" size="lg" onPress={() => openDialog({ kind: 'upload' })}><Ms>add</Ms>Завантажити</Button>
      <button className="company sl" onClick={() => upd(d => { d.onbOpen = true; })}>
        <span className="ic">ТП</span>
        <span className="t"><div className="title-s">ТОВ «Приклад»</div><div className="body-s muted" id="compMeta">{meta}</div></span>
        <Ms className="muted">unfold_more</Ms>
      </button>
      <ToggleButtonGroup className="role-toggle" aria-label="Роль" fullWidth selectionMode="single" disallowEmptySelection
        selectedKeys={[s.role]} onSelectionChange={k => { const r = [...k][0]; if (r) setRole(r as 'owner' | 'acc'); }}>
        <ToggleButton id="owner" size="sm">Власник</ToggleButton>
        <ToggleButton id="acc" size="sm">Бухгалтер</ToggleButton>
      </ToggleButtonGroup>
      <div id="navItems">
        {NAV[s.role].map(([k, ic, label, badge]) => (
          <button key={k} className="nav-item sl" data-view={k} aria-current={s.view === k ? 'page' : undefined} onClick={() => go(k as View)}>
            <Ms>{ic}</Ms>{label}<span className="nav-badge">{badge ? badge(s) : ''}</span>
          </button>
        ))}
      </div>
      <div className="drawer-foot">
        <ProgressBar className="month-progress" value={pct} size="sm" aria-label="Місяць оброблено">
          <Label className="label-m muted">ЛИСТОПАД 2026</Label>
          <ProgressBar.Output className="body-s muted" />
          <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
        </ProgressBar>
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
          <Button className="menu-btn" isIconOnly variant="ghost" id="menuBtn" aria-label="Меню" onPress={() => upd(d => { d.drawerOpen = true; })}><Ms>menu</Ms></Button>
          <div className="brand"><span className="brand-mark">С</span><span className="word"><b>Сальдо</b></span></div>
          <label className="search" aria-label="Пошук">
            <button className="icon-btn sl" tabIndex={-1} aria-hidden="true"><Ms>search</Ms></button>
            <input type="search" id="q" placeholder="Пошук документів, контрагентів, операцій"
              onKeyDown={e => { const v = e.currentTarget.value.trim(); if (e.key === 'Enter' && v) snack(`Пошук «${v}»: знайдено 3 документи і 2 операції`); }} />
            <button className="icon-btn sl" aria-label="Фільтри"><Ms>tune</Ms></button>
          </label>
          <div className="top-actions">
            <ToggleButton isIconOnly variant="ghost" id="assistBtn" aria-label="Помічник" isSelected={assistOpen} onChange={setAssistOpen}><Ms>forum</Ms></ToggleButton>
            <Button className="hide-sm" isIconOnly variant="ghost" aria-label="Довідка"><Ms>help</Ms></Button>
            <Button className="hide-sm" isIconOnly variant="ghost" aria-label="Налаштування"><Ms>settings</Ms></Button>
            <Avatar className="top-avatar" size="sm" color="success" title="Андрій"><Avatar.Fallback>А</Avatar.Fallback></Avatar>
          </div>
        </header>
        <div className={bodyCls}>
          <Drawer />
          <Main />
          <Assistant open={assistOpen} wide={wide} onClose={() => setAssistOpen(false)} />
        </div>
      </div>
      <Onboarding />
      <Overlays />
    </>
  );
}
