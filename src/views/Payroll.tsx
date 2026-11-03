import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { cx, fmt, fmt0, Ms } from '../lib';
import { CHART, COST_ACCOUNTS } from '../recognize/chart';
import { dateUa, forMonth, monthName, runPayroll, type EmployeeResult } from '../payroll/engine';
import { paymentOrders, payrollPostings, summarize, type PaymentOrder } from '../payroll/postings';
import { build4DF, buildD1, csv4DF, csvD1, quarterOf } from '../payroll/report';
import { EMPLOYEES, INPUTS, PAY_COMPANY, PAY_MONTH } from '../payroll/demo';
import { TAX_INFO } from '../payroll/rates';
import { StatCard } from './Overview';

// Затверджений бухгалтером рахунок витрат по працівнику. Поки немає бекенду, зберігається в браузері.
const KEY = 'saldo-payroll-acc';
const loadAcc = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saveAcc = (a: Record<string, string>) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* приватний режим */ } };

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const amountOf = (r: EmployeeResult, k: string) => r.accruals.filter(a => a.kind === k).reduce((s, a) => s + a.amount, 0);
const cell = (v: number) => v ? fmt(v) : <span className="muted">—</span>;

export function Payroll() {
  const { snack } = useApp();
  const [acc, setAcc] = useState(loadAcc);
  const [posted, setPosted] = useState(false);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [tab, setTab] = useState<'calc' | 'post' | 'pay' | 'rep'>('calc');

  const emps = useMemo(() => EMPLOYEES.map(e => acc[e.id] ? { ...e, costAccount: acc[e.id] } : e), [acc]);
  const run = useMemo(() => runPayroll(PAY_MONTH, emps, INPUTS), [emps]);
  const lines = useMemo(() => payrollPostings(run), [run]);
  const blocking = run.issues.filter(t => !/перевірте|не застосована/.test(t));
  const warnings = run.issues.filter(t => /перевірте|не застосована/.test(t));

  const confirm = (id: string, a: string) => {
    if (posted) return;
    const next = { ...acc, [id]: a }; setAcc(next); saveAcc(next);
    snack(`Рахунок ${a} затверджено: наступні нарахування підуть на нього`);
  };
  const post = () => { setPosted(true); setTab('post'); snack(`Нарахування ${run.id} проведено: ${lines.length} проводок`, () => setPosted(false)); };
  const makeOrders = () => {
    const add = paymentOrders(run, PAY_COMPANY, '2026-11-05', orders);
    if (!add.length) { snack('Усе за цим нарахуванням уже оплачено'); return; }
    setOrders(o => [...o, ...add]); setTab('pay');
    snack(`Сформовано ${add.length} платіжки за нарахуванням ${run.id}`);
  };
  const q = quarterOf(PAY_MONTH), y = +PAY_MONTH.slice(0, 4);
  const df = build4DF([run], orders, y, q), d1 = buildD1([run]);

  const tabs: [typeof tab, string][] = [['calc', 'Розрахунок'], ['post', 'Проводки'], ['pay', 'Платіжки'], ['rep', '4ДФ і ЄСВ']];
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Зарплата {forMonth(PAY_MONTH).replace('за ', '· ')}</h1><span className="spacer" />
        <button className="btn btn-outlined sl" disabled={!posted} onClick={makeOrders}><Ms>payments</Ms>Платіжки</button>
        <button className="btn btn-filled sl" disabled={posted || !run.canPost} onClick={post}><Ms>check</Ms>{posted ? 'Проведено' : 'Провести нарахування'}</button></div>

      {blocking.length > 0 && <div className="banner" style={{ background: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }}><Ms>error</Ms>
        <div className="txt body-m"><b>Провести не можна.</b> {blocking.join('. ')}. Рахунок витрат система не обирає сама: оберіть його в таблиці.</div></div>}
      {warnings.length > 0 && <div className="banner"><Ms>info</Ms><div className="txt body-m">{warnings.join('. ')}.</div></div>}

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard ic="payments" t="Нараховано" v={fmt0(run.totals.gross) + ' ₴'} d={`${run.results.length} працівників · ${run.id}`} />
        <StatCard ic="receipt_long" t="ПДФО і військовий збір" v={fmt0(run.totals.pdfo + run.totals.vz) + ' ₴'} d={`6411: ${fmt(run.totals.pdfo)} · 642: ${fmt(run.totals.vz)}`} />
        <StatCard ic="account_balance" t="ЄСВ 22%" v={fmt0(run.totals.esv) + ' ₴'} d="651 · до 20 листопада" />
        <StatCard ic="wallet" t="До виплати" v={fmt0(run.totals.net) + ' ₴'} d="661 · ПДФО і ВЗ у день виплати" />
      </div>

      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}{k === 'pay' && orders.length > 0 && <span className="muted"> {orders.length}</span>}</button>)}</div>

      {tab === 'calc' && <div className="table-wrap"><table className="dt" style={{ minWidth: 1100 }}>
        <thead><tr><th>Працівник</th><th>Рахунок витрат</th><th className="r">Оплата часу</th><th className="r">Премія</th><th className="r">Відпускні</th><th className="r">Лікарняні</th><th className="r">Нараховано</th><th className="r">ПДФО</th><th className="r">ВЗ</th><th className="r">До виплати</th><th className="r">ЄСВ</th></tr></thead>
        <tbody>{run.results.map(r => (
          <tr key={r.emp.id} style={{ cursor: 'default' }}>
            <td style={{ minWidth: 260 }}><div className="title-s">{r.emp.name}</div><div className="body-s muted">{r.emp.position} · {r.emp.dept}</div>
              {r.accruals.filter(a => a.kind === 'vacation' || a.kind === 'sick').map(a => <div key={a.kind} className="body-s muted" title={a.basis}>{a.kind === 'sick' ? 'Лікарняні' : 'Відпускні'}: {a.note}</div>)}
              {r.fundSick > 0 && <div className="body-s muted">Решту лікарняного {fmt(r.fundSick)} ₴ виплачує ПФУ напряму</div>}</td>
            <td style={{ minWidth: 200 }}>
              <select className={cx('nom-sel')} aria-label={`Рахунок витрат для ${r.emp.name}`} disabled={posted} value={r.emp.costAccount ?? ''} onChange={e => confirm(r.emp.id, e.target.value)}>
                {!r.emp.costAccount && <option value="">Оберіть рахунок…</option>}
                {COST_ACCOUNTS.map(a => <option key={a} value={a}>{a} {CHART[a]}</option>)}
              </select>
              {!r.emp.costAccount && <div className="body-s" style={{ color: 'var(--md-error)', marginTop: 2 }}>Затвердьте рахунок</div>}</td>
            <td className="r">{cell(amountOf(r, 'salary'))}</td><td className="r">{cell(amountOf(r, 'bonus'))}</td>
            <td className="r">{cell(amountOf(r, 'vacation'))}</td><td className="r">{cell(amountOf(r, 'sick'))}</td>
            <td className="r title-s">{fmt(r.gross)}</td><td className="r">{fmt(r.pdfo)}{r.psp > 0 && <div className="body-s muted">ПСП {fmt(r.psp)}</div>}</td>
            <td className="r">{fmt(r.vz)}</td><td className="r title-s">{fmt(r.net)}</td>
            <td className="r">{fmt(r.esv)}{r.esvTopUp > 0 && <div className="body-s muted">з мінімальної</div>}</td></tr>
        ))}</tbody>
      </table></div>}

      {tab === 'post' && <>
        <div className="table-wrap"><table className="dt">
          <thead><tr><th>Дт</th><th>Кт</th><th className="r">Сума, ₴</th><th>Зміст</th></tr></thead>
          <tbody>{summarize(lines).map(l => <tr key={l[0] + l[1]} style={{ cursor: 'default' }}><td className="num">{l[0]} <span className="body-s muted">{CHART[l[0]]}</span></td><td className="num">{l[1]} <span className="body-s muted">{CHART[l[1]]}</span></td><td className="r">{fmt(l[2])}</td><td className="body-s muted">{lines.filter(x => x[0] === l[0] && x[1] === l[1]).length} рядк. по працівниках</td></tr>)}</tbody>
        </table></div>
        <p className="body-s muted" style={{ marginTop: 12 }}>{posted ? `Проведено нарахуванням ${run.id} від ${dateUa(run.date)}.` : 'Чернетка: проводки з’являться в ОСВ після проведення.'} Працівники без затвердженого рахунку витрат у проводки не потрапляють.</p>
      </>}

      {tab === 'pay' && (orders.length
        ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,460px),1fr))' }}>{orders.map(o => (
          <div key={o.id} className="card card-outlined" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><span className="title-m">{o.kind === 'net' ? 'Виплата зарплати' : TAX_INFO[o.kind].name}</span><span className="spacer" style={{ flex: 1 }} /><span className="title-m num">{fmt(o.amount)} ₴</span></div>
            <div className="body-s muted" style={{ marginTop: 4 }}>{o.recipient} · {dateUa(o.date)} · Дт {o.dt} Кт {o.kt} · {o.article}</div>
            <div className="body-m" style={{ marginTop: 8, fontFamily: o.kind === 'net' ? undefined : 'monospace', wordBreak: 'break-word' }}>{o.purpose}</div>
            <div className="body-s" style={{ marginTop: 8 }}><Ms style={{ fontSize: 16, verticalAlign: -3 }}>link</Ms> Підстава: нарахування {o.accrualId} {forMonth(PAY_MONTH)}, {o.perEmployee.length} осіб</div>
          </div>))}</div>
        : <div className="empty"><Ms>payments</Ms><div className="title-l" style={{ marginTop: 12, color: 'var(--md-on-surface)' }}>Платіжок ще немає</div><div className="body-m">{posted ? 'Натисніть «Платіжки»: зарплата, ПДФО, ВЗ і ЄСВ з посиланням на нарахування.' : 'Спершу проведіть нарахування.'}</div></div>)}

      {tab === 'rep' && <>
        <div className="section-title" style={{ marginTop: 0 }}><span className="title-m">Додаток 4ДФ · {q} квартал {y}</span><span className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-text sl" onClick={() => download(`4DF_${y}_Q${q}.csv`, csv4DF(df))}><Ms>download</Ms>CSV</button></div>
        <div className="table-wrap"><table className="dt" style={{ minWidth: 900 }}>
          <thead><tr><th>РНОКПП</th><th>ПІБ</th><th>Ознака</th><th className="r">Нараховано</th><th className="r">Виплачено</th><th className="r">ПДФО нар.</th><th className="r">ПДФО перерах.</th><th className="r">ВЗ нар.</th><th className="r">ВЗ перерах.</th><th>ПСП</th></tr></thead>
          <tbody>{df.map(r => <tr key={r.ipn} style={{ cursor: 'default' }}><td className="num">{r.ipn}</td><td>{r.name}</td><td>{r.sign}</td><td className="r">{fmt(r.accrued)}</td><td className="r">{cell(r.paid)}</td><td className="r">{fmt(r.pdfoAccrued)}</td><td className="r">{cell(r.pdfoPaid)}</td><td className="r">{fmt(r.vzAccrued)}</td><td className="r">{cell(r.vzPaid)}</td><td>{r.pspSign || '—'}</td></tr>)}</tbody>
        </table></div>
        <div className="section-title"><span className="title-m">Додаток 1 ЄСВ · {monthName(PAY_MONTH)}</span><span className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-text sl" onClick={() => download(`D1_ESV_${PAY_MONTH}.csv`, csvD1(d1))}><Ms>download</Ms>CSV</button></div>
        <div className="table-wrap"><table className="dt" style={{ minWidth: 900 }}>
          <thead><tr><th>РНОКПП</th><th>ПІБ</th><th>Категорія</th><th className="r">Загальна сума</th><th className="r">У межах макс.</th><th className="r">Різниця до мін.</th><th className="r">ЄСВ</th><th className="r">Днів непрацезд.</th><th className="r">Днів у труд. відн.</th></tr></thead>
          <tbody>{d1.map(r => <tr key={r.ipn} style={{ cursor: 'default' }}><td className="num">{r.ipn}</td><td>{r.name}</td><td>{r.category}</td><td className="r">{fmt(r.total)}</td><td className="r">{fmt(r.withinMax)}</td><td className="r">{cell(r.minDiff)}</td><td className="r">{fmt(r.esv)}</td><td className="r">{r.sickDays || '—'}</td><td className="r">{r.employedDays}</td></tr>)}</tbody>
        </table></div>
        <p className="body-s muted" style={{ marginTop: 12 }}>Виплачене й перераховане береться лише з платіжок, прив’язаних до нарахувань кварталу. Лікарняні від ПФУ не включаються: за ними податковий агент — ПФУ.</p>
      </>}
    </div>
  );
}
