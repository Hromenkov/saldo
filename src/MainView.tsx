import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from './store';
import { reduceMotion } from './lib';
import { Overview } from './views/Overview';
import { Questions, Docs, Bank, Ledger, Close, Reports } from './views/Pages';
import { Ops } from './views/Ops';
import { Assets } from './views/Assets';
import { Structure } from './views/Structure';
import { Payroll } from './views/Payroll';
import { Vat } from './views/Vat';
import { Stock } from './views/Stock';
import { Credit } from './views/Credit';
import { Audit } from './views/Audit';
import { PulsePage } from './views/Pulse';

const VIEWS = { overview: Overview, pulse: PulsePage, questions: Questions, docs: Docs, bank: Bank, ledger: Ledger, close: Close, reports: Reports, ops: Ops, assets: Assets, structure: Structure, stock: Stock, vat: Vat, payroll: Payroll, credit: Credit, audit: Audit };

export function Main() {
  const { s } = useApp();
  const ref = useRef<HTMLElement>(null);
  const View = VIEWS[s.view];

  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [s.nav, s.mode, s.period, s.docTab, s.structTab]);

  // Поява сторінки: картки й заголовки піднімаються по черзі
  useLayoutEffect(() => {
    const main = ref.current;
    if (!main || reduceMotion()) return;
    main.querySelectorAll<HTMLElement>('.page-head, .banner, .card, .frame, .tabs, h1').forEach((el, i) => {
      el.classList.remove('enter-anim'); void el.offsetWidth;
      el.style.animationDelay = Math.min(i * 45, 450) + 'ms'; el.classList.add('enter-anim');
      el.addEventListener('animationend', () => { el.classList.remove('enter-anim'); el.style.animationDelay = ''; }, { once: true });
    });
  }, [s.nav]);

  return <main className="main" id="main" ref={ref}><View /></main>;
}

/** Значення картки-показника: ціле число «набігає» від нуля при переході на сторінку */
export function StatValue({ v }: { v: string }) {
  const { s } = useApp();
  const [shown, setShown] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (reduceMotion()) return;
    const m = v.match(/^([\d\s ]+)(,\d+)?(.*)$/);
    if (!m) return;
    const target = +m[1].replace(/[\s ]/g, ''), rest = m[3];
    if (!target || m[2]) return;
    const sep = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const t0 = performance.now(), dur = 700; let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      if (k < 1) { setShown(sep(Math.round(target * e)) + rest); raf = requestAnimationFrame(step); } else setShown(null);
    };
    setShown(sep(0) + rest);
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); setShown(null); };
    // анімація лише при переході, а не при кожній зміні значення
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.nav]);
  return <div className="v">{shown ?? v}</div>;
}
