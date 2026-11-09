import { useEffect, useRef, useState } from 'react';
import { ACCOUNTS } from '../data';
import { useApp } from '../store';
import { fmt, fmt0, Ms } from '../lib';
import { BankTable, Chart } from '../components/Tables';
import { StatValue } from '../MainView';
import { asOf, audit, money } from '../audit';
import { Pulse } from './Pulse';

const PERIODS = ['Листопад 2026', 'Жовтень 2026', 'IV квартал 2026', '2026 рік'];

function PeriodMenu() {
  const { s, upd } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', close); return () => document.removeEventListener('click', close);
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      <button className="btn btn-outlined sl" aria-haspopup="menu" onClick={() => setOpen(o => !o)}>
        <Ms>calendar_month</Ms>{s.period}<Ms style={{ margin: '0 -12px 0 0' }}>arrow_drop_down</Ms>
      </button>
      <div className="menu" id="periodMenu" role="menu" hidden={!open}>
        {PERIODS.map(x => (
          <button key={x} role="menuitemradio" aria-checked={x === s.period} className="sl" onClick={() => { upd(d => { d.period = x; }); setOpen(false); }}>
            <Ms>{x === s.period ? 'check' : ''}</Ms>{x}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StatCard({ ic, t, v, d, meta }: { ic: string; t: string; v: string; d: React.ReactNode; meta?: string }) {
  return (
    <div className="card card-filled stat">
      <div className="top"><Ms>{ic}</Ms><span className="title-s">{t}</span>{meta && <span className="meta body-s">{meta}</span>}</div>
      <StatValue v={v} />
      <div className="d body-s">{d}</div>
    </div>
  );
}

export function Overview() {
  const { s, upd, go, snack, openDialog } = useApp();
  const due = s.reports.filter(r => r.st === 'ready');
  const m = s.mode === 'mgmt';
  const accts = ACCOUNTS.filter(a => m || a.acc);
  const total = accts.reduce((sum, a) => sum + a.sum, 0);
  const cards: [string, string, string, React.ReactNode][] = m ? [
    ['account_balance_wallet', 'Усі гроші', fmt0(total) + ' ₴', `${accts.length} рахунків і кас · ТОВ і ФОП`],
    ['trending_up', 'Виручка, листопад', '612 400 ₴', <><span className="up">+8%</span> до жовтня</>],
    ['savings', 'Операційний прибуток', '84 300 ₴', 'маржа 13,8%'],
    ['local_cafe', 'Food cost', '31,2%', 'ціль 30% · найвищий на точці «Оболонь»']
  ] : [
    ['account_balance_wallet', 'Грошові кошти', fmt0(total) + ' ₴', 'рахунки 301, 311 · ТОВ «Приклад»'],
    ['call_received', 'Дебіторська заборгованість', '96 500 ₴', 'рахунок 361 · з них 38 200 ₴ понад 30 днів'],
    ['call_made', 'Кредиторська заборгованість', '54 210 ₴', 'рахунок 631 · найближча оплата 21.11'],
    ['receipt_long', 'Розрахунки з бюджетом', '31 840 ₴', 'рахунки 641, 651 · ПДВ, ЄСВ, ПДФО']
  ];
  const setMode = (mode: 'mgmt' | 'acc') => upd(d => { d.mode = mode; });
  const au = audit(s.docs, s.bank, { today: asOf() });

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-s">Добрий день, Андрію</h1>
        <span className="spacer" />
        <PeriodMenu />
      </div>
      <div className="tabs" role="tablist" aria-label="Вид обліку">
        <button className="tab" role="tab" aria-selected={m} onClick={() => setMode('mgmt')}><Ms className="sm">insights</Ms>Управлінський облік</button>
        <button className="tab" role="tab" aria-selected={!m} onClick={() => setMode('acc')}><Ms className="sm">account_tree</Ms>Бухгалтерський облік</button>
      </div>
      {s.questions.length > 0 && (
        <div className="banner"><span className="ms fill">contact_support</span>
          <div className="txt"><div className="title-s">{s.questions.length} питання чекають на вашу відповідь</div><div className="body-m">Без них система не може провести частину документів.</div></div>
          <button className="btn btn-filled sl" onClick={() => go('questions')}>Відповісти</button>
        </div>
      )}
      {s.role === 'owner' && <Pulse more />}
      {au.errors > 0 && s.role !== 'owner' && (
        <div className="banner"><span className="ms fill">fact_check</span>
          <div className="txt"><div className="title-s">Аудит знайшов {au.errors} {au.errors === 1 ? 'помилку' : au.errors < 5 ? 'помилки' : 'помилок'} на {money(au.atStake)} ₴</div><div className="body-m">Перевірено {au.checked} документів до копійки: суми, ПДВ, проводки, дублікати, оплати.</div></div>
          <button className="btn btn-filled sl" onClick={() => go('audit')}>Подивитися</button>
        </div>
      )}
      {/* у власника замість демо-показників — «Пульс», порахований з документів і банку */}
      {s.role !== 'owner' && <div className="grid g4">{cards.map(([ic, t, v, d]) => <StatCard key={t} ic={ic} t={t} v={v} d={d} />)}</div>}
      <div className="grid g2" style={{ marginTop: 12 }}>
        <div className="frame">
          <div className="frame-hd"><Ms>show_chart</Ms><span className="t">{m ? 'Усі гроші, листопад' : 'Грошові кошти (301, 311), листопад'}</span><span className="meta">17 днів</span></div>
          <div className="frame-bd"><Chart key={s.mode} add={m ? 54 : 0} /></div>
          <div className="frame-ft"><button className="btn btn-text sl" onClick={() => go('bank')}>Відкрити банк і каси<Ms>arrow_forward</Ms></button></div>
        </div>
        <div className="frame">
          <div className="frame-hd"><Ms>checklist</Ms><span className="t">Що треба зробити</span><span className="meta">{due.length + 2} задачі</span></div>
          <div className="frame-bd flush"><ul className="list">
            {due.map(r => (
              <li className="li" key={r.name + r.per}><span className="lead blue"><Ms>draw</Ms></span>
                <span className="txt"><div className="title-s">{r.name}</div><div className="s body-s">{r.per} · до {r.due}</div></span>
                <span className="trail"><button className="btn btn-text sl" onClick={() => openDialog({ kind: 'sign', name: r.name, per: r.per })}>Підписати</button></span></li>
            ))}
            <li className="li"><span className="lead yellow"><Ms>payments</Ms></span><span className="txt"><div className="title-s">Сплатити ЄСВ і ПДФО</div><div className="s body-s">9 440,00 ₴ · платіжки готові</div></span><span className="trail"><button className="btn btn-text sl" onClick={() => snack('Платіжки надіслано в ПриватБанк на підпис')}>Оплатити</button></span></li>
            <li className="li"><span className="lead"><Ms>handshake</Ms></span><span className="txt"><div className="title-s">3 акти звірки без підпису</div><div className="s body-s">Агроресурс, Логістик-Захід, Енергозбут</div></span><span className="trail"><button className="btn btn-text sl" onClick={() => snack('Нагадування надіслано контрагентам')}>Нагадати</button></span></li>
          </ul></div>
          <div className="frame-ft"><button className="btn btn-text sl" onClick={() => go('reports')}>Уся звітність<Ms>arrow_forward</Ms></button></div>
        </div>
      </div>
      <div className="grid g2eq" style={{ marginTop: 28 }}>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}><span className="title-m">Рахунки і каси</span><span className="body-s muted">{m ? 'Усі гроші групи' : 'Лише в обліку ТОВ'}</span></div>
          <div className="table-wrap"><table className="dt compact">
            <thead><tr><th>Рахунок або каса</th><th>Бухоблік</th><th>Управлінка</th><th className="r">Залишок, ₴</th></tr></thead>
            <tbody>{accts.map(a => (
              <tr key={a.name}><td><div className="doc"><Ms>{a.ic}</Ms><div><div className="title-s">{a.name}</div><div className="body-s muted">{a.co} · {a.sub}</div></div></div></td>
                <td>{a.acc ? <span className="status st-ok">рах. {a.acc}</span> : <span className="status st-mute">не входить</span>}</td>
                <td><span className="status st-new">{a.mg}</span></td><td className="r">{fmt(a.sum)}</td></tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={3}>Разом</td><td className="r">{fmt(total)}</td></tr></tfoot>
          </table></div>
        </div>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}><span className="title-m">Останні операції</span><button className="btn btn-text sl" onClick={() => go('bank')} style={{ height: 32 }}>Усі операції</button></div>
          <BankTable rows={s.bank.slice(-5).reverse()} compact />
        </div>
      </div>
    </div>
  );
}

