import { Fragment, useMemo, useState } from 'react';
import { CHART, checkLines } from '../recognize/chart';
import { loanAccounts, loanBalances, loanPostings, schedule, toLines, type Loan, type LoanMethod, type Posting } from '../finance/loans';
import { fxReport, movementsFrom, toUah, type FxItem, type Rates } from '../finance/fx';
import { loadRates, ratesFrom, type RateTable } from '../finance/nbu';
import { monthEnds, r2, ua } from '../finance/dates';
import { DEMO_EUR_CASH, DEMO_FX_DOCS, DEMO_LOANS, demoRates } from '../finance/demo';
import { useApp } from '../store';
import { cx, fmt, fmt0, Ms } from '../lib';
import { StatCard } from './Overview';

const FROM = '2026-11-01', TO = '2026-11-30';
const MONTHS: [string, string][] = [['2026-09-30', 'Вересень'], ['2026-10-31', 'Жовтень'], ['2026-11-30', 'Листопад']];
const METHOD: Record<LoanMethod, string> = { annuity: 'Ануїтет', equal: 'Класичний', bullet: 'Тіло в кінці' };
const CUR: Record<string, string> = { UAH: '₴', EUR: '€', USD: '$' };
const money = (n: number, c: string) => fmt(n) + ' ' + (CUR[c] ?? c);
const inp: React.CSSProperties = { width: '100%', font: 'inherit', fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-container-lowest)', color: 'var(--md-on-surface)' };

type Tab = 'loans' | 'fx';

export function Credit() {
  const { snack } = useApp();
  const [tab, setTab] = useState<Tab>('loans');
  const [loans, setLoans] = useState<Loan[]>(DEMO_LOANS);
  const [table, setTable] = useState<RateTable>(demoRates);
  const [src, setSrc] = useState<'demo' | 'nbu'>('demo');
  const [busy, setBusy] = useState(false);
  const rates = useMemo<Rates>(() => ratesFrom(table), [table]);

  const all = useMemo(() => loans.map(l => ({ l, ps: loanPostings(l) })), [loans]);
  const items = useMemo<FxItem[]>(() => {
    const eurLoanCash = all.filter(x => x.l.currency === 'EUR').flatMap(x => movementsFrom(x.ps, '312'));
    return [
      ...DEMO_FX_DOCS,
      { doc: 'Валютний рахунок EUR', account: '312', currency: 'EUR', movements: [...DEMO_EUR_CASH, ...eurLoanCash] },
      ...all.filter(x => x.l.currency !== 'UAH').flatMap(x => {
        const a = loanAccounts(x.l);
        return [a.body, a.current, a.interest].map(acc => ({ doc: `${x.l.bank}, ${x.l.contract}`, account: acc, currency: x.l.currency, movements: movementsFrom(x.ps, acc) }))
          .filter(i => i.movements.length);
      })
    ];
  }, [all]);

  const refresh = async () => {
    // курс НБУ відомий лише на сьогодні й завтра; на пізніші дати береться останній відомий
    const today = new Date().toISOString().slice(0, 10);
    const dates = new Set<string>();
    for (const i of items) for (const m of i.movements) if (m.date <= today) dates.add(i.currency + '|' + m.date);
    for (const e of monthEnds('2026-09-01', TO)) if (e <= today) ['EUR', 'USD'].forEach(c => dates.add(c + '|' + e));
    for (const x of all) if (x.l.currency !== 'UAH') x.ps.forEach(p => p.date <= today && dates.add(x.l.currency + '|' + p.date));
    setBusy(true);
    try {
      const t = await loadRates([...dates].map(k => { const [currency, date] = k.split('|'); return { currency, date }; }));
      setTable(t); setSrc('nbu');
      snack(`Завантажено ${dates.size} курсів НБУ`);
    } catch (e) {
      snack('Курси НБУ не завантажено: ' + (e instanceof Error ? e.message : 'помилка мережі'));
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Кредити і валюта</h1><span className="spacer" />
        <span className="body-s muted">{src === 'demo' ? 'Курси прикладу' : 'Офіційні курси НБУ'}</span>
        <button className="btn btn-outlined sl" disabled={busy} onClick={refresh}><Ms>{busy ? 'hourglass_top' : 'currency_exchange'}</Ms>Курси НБУ</button></div>
      <div className="m-tabs" role="tablist">
        {([['loans', 'Кредити'], ['fx', 'Курсові різниці']] as [Tab, string][]).map(([k, l]) =>
          <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'loans' ? <Loans all={all} rates={rates} add={l => setLoans(x => [...x, l])} /> : <Fx items={items} rates={rates} />}
      {src === 'nbu' && <p className="body-s muted" style={{ marginTop: 12 }}>На майбутні дати курсу НБУ ще немає: для них узято останній відомий курс. Після настання дати розрахунок оновиться.</p>}
    </div>
  );
}

/* ——— Кредити ——— */

function Loans({ all, rates, add }: { all: { l: Loan; ps: Posting[] }[]; rates: Rates; add: (l: Loan) => void }) {
  const [sel, setSel] = useState(all[0]?.l.id ?? '');
  const [form, setForm] = useState(false);
  const k = (c: string) => rates(c, TO);
  const bal = all.map(x => ({ ...x, b: loanBalances(x.l, TO, x.ps), month: x.ps.filter(p => p.date >= FROM && p.date <= TO) }));
  const body = r2(bal.reduce((s, x) => s + (x.b.longTerm + x.b.current) * k(x.l.currency), 0));
  const current = r2(bal.reduce((s, x) => s + x.b.current * k(x.l.currency), 0));
  const interest = r2(bal.reduce((s, x) => s + x.month.filter(p => p.dt === '951').reduce((a, p) => a + p.amount * rates(x.l.currency, p.date), 0), 0));
  const due = r2(bal.reduce((s, x) => s + x.b.interest * k(x.l.currency), 0));
  const cur = bal.find(x => x.l.id === sel);
  return <>
    <div className="grid g4" style={{ marginBottom: 20 }}>
      <StatCard ic="account_balance" t="Тіло кредитів" v={fmt0(body) + ' ₴'} d={`на ${ua(TO)}, валюта за курсом НБУ`} />
      <StatCard ic="event_upcoming" t="До погашення за 12 міс." v={fmt0(current) + ' ₴'} d="611 / 612 і короткострокові 60x" />
      <StatCard ic="percent" t="Відсотки за листопад" v={fmt0(interest) + ' ₴'} d="Дт 951 Кт 684" />
      <StatCard ic="pending_actions" t="Нараховано, не сплачено" v={fmt0(due) + ' ₴'} d="сальдо 684 на кінець місяця" />
    </div>
    <div className="table-wrap"><table className="dt">
      <thead><tr><th>Банк, договір</th><th>Рахунок</th><th className="r">Сума</th><th className="r">Ставка</th><th>Строк</th><th>Графік</th><th className="r">Залишок на {ua(TO)}</th></tr></thead>
      <tbody>{bal.map(({ l, b }) => {
        const a = loanAccounts(l);
        return <tr key={l.id} onClick={() => setSel(l.id)} style={l.id === sel ? { background: 'var(--md-surface-container-low)' } : undefined}>
          <td><div className="title-s">{l.bank}</div><div className="body-s muted">№ {l.contract} від {ua(l.start)}</div></td>
          <td className="num" title={CHART[a.body]}>{a.body}{a.long && <span className="muted"> / {a.current}</span>}</td>
          <td className="r">{money(l.principal, l.currency)}</td><td className="r">{l.rate}%</td><td>{l.months} міс.</td><td>{METHOD[l.method]}</td>
          <td className="r">{money(r2(b.longTerm + b.current), l.currency)}</td></tr>;
      })}</tbody>
    </table></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
      <button className="btn btn-tonal sl" onClick={() => setForm(!form)}><Ms>{form ? 'close' : 'add'}</Ms>{form ? 'Скасувати' : 'Новий кредит'}</button></div>
    {form && <NewLoan onAdd={l => { add(l); setSel(l.id); setForm(false); }} />}
    {cur && <LoanCard l={cur.l} ps={cur.ps} rates={rates} />}
  </>;
}

function NewLoan({ onAdd }: { onAdd: (l: Loan) => void }) {
  const [f, setF] = useState({ bank: '', contract: '', currency: 'UAH', principal: '100000', rate: '20', start: '2026-11-05', months: '24', method: 'equal' as LoanMethod });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const loan: Loan = { id: 'n' + Date.now(), bank: f.bank || 'Банк', contract: f.contract || 'б/н', currency: f.currency, principal: +f.principal, rate: +f.rate, start: f.start, months: Math.round(+f.months), method: f.method };
  const err = !(loan.principal > 0) ? 'Сума має бути більшою за нуль' : !(loan.months >= 1 && loan.months <= 360) ? 'Строк від 1 до 360 місяців' : !(loan.rate >= 0 && loan.rate < 100) ? 'Ставка від 0 до 100%' : !/^\d{4}-\d{2}-\d{2}$/.test(loan.start) ? 'Дата у форматі РРРР-ММ-ДД' : '';
  const fld = (label: string, el: React.ReactNode) => <label className="body-s"><div className="muted" style={{ marginBottom: 4 }}>{label}</div>{el}</label>;
  return <div className="m-card card-outlined" style={{ marginTop: 12 }}>
    <div className="title-m" style={{ marginBottom: 12 }}>Новий кредитний договір</div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
      {fld('Банк', <input style={inp} value={f.bank} onChange={set('bank')} placeholder="ПриватБанк" />)}
      {fld('Договір №', <input style={inp} value={f.contract} onChange={set('contract')} />)}
      {fld('Валюта', <select style={inp} value={f.currency} onChange={set('currency')}><option>UAH</option><option>EUR</option><option>USD</option></select>)}
      {fld('Сума', <input style={inp} inputMode="decimal" value={f.principal} onChange={set('principal')} />)}
      {fld('Ставка, % річних', <input style={inp} inputMode="decimal" value={f.rate} onChange={set('rate')} />)}
      {fld('Дата отримання', <input style={inp} type="date" value={f.start} onChange={set('start')} />)}
      {fld('Строк, міс.', <input style={inp} inputMode="numeric" value={f.months} onChange={set('months')} />)}
      {fld('Графік', <select style={inp} value={f.method} onChange={set('method')}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
    </div>
    <div className="body-s muted" style={{ marginTop: 12 }}>{loan.months > 12 ? `Довгостроковий: ${loanAccounts(loan).body}, частина до погашення за 12 місяців на ${loanAccounts(loan).current}` : `Короткостроковий: ${loanAccounts(loan).body}`}. Відсотки {loan.method === 'annuity' ? '30/360' : 'за фактичними днями, база 365'}.</div>
    {err && <div className="body-s" style={{ marginTop: 6, color: 'var(--md-error)' }}>{err}</div>}
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-filled sl" disabled={!!err} onClick={() => onAdd(loan)}><Ms>check</Ms>Додати</button></div>
  </div>;
}

function LoanCard({ l, ps, rates }: { l: Loan; ps: Posting[]; rates: Rates }) {
  const [view, setView] = useState<'sched' | 'post'>('sched');
  const rows = useMemo(() => schedule(l), [l]);
  const month = ps.filter(p => p.date >= FROM && p.date <= TO);
  const uah = l.currency === 'UAH' ? month : toUah(month, l.currency, rates);
  const issues = checkLines(toLines(uah));
  const tot = (k: 'interest' | 'principal' | 'payment') => r2(rows.reduce((s, r) => s + r[k], 0));
  return <div className="m-card card-outlined" style={{ marginTop: 16 }}>
    <div className="section-title" style={{ marginTop: 0 }}>
      <div><div className="title-m">{l.bank} · № {l.contract}</div>
        <div className="body-s muted">{money(l.principal, l.currency)} під {l.rate}% на {l.months} міс. з {ua(l.start)} · {METHOD[l.method]}</div></div>
      <div className="segmented" role="group" aria-label="Подання">
        <button aria-pressed={view === 'sched'} onClick={() => setView('sched')}><Ms>check</Ms>Графік</button>
        <button aria-pressed={view === 'post'} onClick={() => setView('post')}><Ms>check</Ms>Проводки за листопад</button>
      </div>
    </div>
    {view === 'sched' ? <div className="table-wrap" style={{ maxHeight: 460, overflow: 'auto' }}><table className="dt">
      <thead><tr><th>№</th><th>Дата платежу</th><th className="r">Днів</th><th className="r">Залишок на початок</th><th className="r">Відсотки</th><th className="r">Тіло</th><th className="r">Платіж</th><th className="r">Залишок</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.n} className={cx(r.date >= FROM && r.date <= TO && 'title-s')} style={r.date >= FROM && r.date <= TO ? { background: 'var(--md-surface-container-low)' } : undefined}>
        <td className="num">{r.n}</td><td className="num">{ua(r.date)}</td><td className="r">{r.days}</td><td className="r">{fmt(r.opening)}</td>
        <td className="r">{fmt(r.interest)}</td><td className="r">{fmt(r.principal)}</td><td className="r">{fmt(r.payment)}</td><td className="r">{fmt(r.closing)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={4}>Разом, {CUR[l.currency] ?? l.currency}</td><td className="r">{fmt(tot('interest'))}</td><td className="r">{fmt(tot('principal'))}</td><td className="r">{fmt(tot('payment'))}</td><td /></tr></tfoot>
    </table></div> : <>
      {month.length ? <div className="posting"><table><thead><tr><th>Дата</th><th>Дт</th><th>Кт</th>{l.currency !== 'UAH' && <th className="r">{l.currency}</th>}<th className="r">Сума, ₴</th><th>Зміст</th></tr></thead>
        <tbody>{month.map((p, i) => <tr key={i}><td className="num">{ua(p.date)}</td><td title={CHART[p.dt]}>{p.dt}</td><td title={CHART[p.kt]}>{p.kt}</td>
          {l.currency !== 'UAH' && <td className="r">{fmt(p.amount)}</td>}<td className="r">{fmt(uah[i].amount)}</td><td className="body-s muted">{p.text}</td></tr>)}</tbody></table></div>
        : <div className="body-s muted">У листопаді проводок за цим кредитом немає</div>}
      {issues.length > 0 && <div className="body-s" style={{ marginTop: 6, color: 'var(--md-error)' }}>{issues.map(x => x.t).join('. ')}</div>}
      <p className="body-s muted" style={{ marginTop: 12 }}>Відсотки нараховуються наприкінці місяця і на дату платежу, тож після сплати 684 закрито. Частина тіла до погашення протягом 12 місяців переноситься на {loanAccounts(l).current} при отриманні і щокварталу.{l.currency !== 'UAH' && ' Валютні суми переведено за курсом НБУ на дату проводки; курсові різниці за кредитом — на вкладці «Курсові різниці».'}</p>
    </>}
  </div>;
}

/* ——— Курсові різниці ——— */

function Fx({ items, rates }: { items: FxItem[]; rates: Rates }) {
  const [end, setEnd] = useState(TO);
  const from = end.slice(0, 8) + '01';
  const rep = useMemo(() => {
    const r = fxReport(items, rates, monthEnds('2026-09-01', end));
    const diffs = r.diffs.filter(d => d.date >= from && d.date <= end);
    const sum = (acc: string) => r2(diffs.filter(d => (d.gain ? d.posting.kt : d.posting.dt) === acc).reduce((s, d) => s + d.posting.amount, 0));
    return { diffs, s714: sum('714'), s945: sum('945'), s744: sum('744'), s974: sum('974') };
  }, [items, rates, end, from]);
  const issues = checkLines(rep.diffs.map(d => [d.posting.dt, d.posting.kt, d.posting.amount, d.posting.text]));
  const advances = items.filter(i => i.advance);
  return <>
    <div className="chips" style={{ marginBottom: 12 }}>{MONTHS.map(([d, n]) => <button key={d} className="m-chip sl" aria-pressed={end === d} onClick={() => setEnd(d)}>{end === d && <Ms>check</Ms>}{n} 2026</button>)}</div>
    <div className="grid g4" style={{ marginBottom: 20 }}>
      <StatCard ic="trending_up" t="Дохід, операційні" v={fmt0(rep.s714) + ' ₴'} d="Кт 714: розрахунки, валютний рахунок" />
      <StatCard ic="trending_down" t="Втрати, операційні" v={fmt0(rep.s945) + ' ₴'} d="Дт 945" />
      <StatCard ic="trending_up" t="Дохід, неопераційні" v={fmt0(rep.s744) + ' ₴'} d="Кт 744: валютні кредити" />
      <StatCard ic="trending_down" t="Втрати, неопераційні" v={fmt0(rep.s974) + ' ₴'} d="Дт 974" />
    </div>
    {rep.diffs.length ? <div className="table-wrap"><table className="dt">
      <thead><tr><th>Дата</th><th>Документ</th><th>Рахунок</th><th className="r">Залишок у валюті</th><th className="r">Курс НБУ</th><th className="r">Різниця, ₴</th><th>Проводка</th><th>Підстава</th></tr></thead>
      <tbody>{rep.diffs.map((d, i) => <Fragment key={i}><tr>
        <td className="num">{ua(d.date)}</td><td className="title-s">{d.doc}</td><td className="num" title={CHART[d.account]}>{d.account}</td>
        <td className="r">{money(d.balance, d.currency)}</td><td className="r">{d.oldRate.toFixed(4)} → {d.newRate.toFixed(4)}</td>
        <td className={'r ' + (d.gain ? 'pos' : 'neg')}>{d.gain ? '+' : '−'}{fmt(d.posting.amount)}</td>
        <td className="acc">Дт {d.posting.dt} · Кт {d.posting.kt}</td><td className="muted">{d.reason === 'balance' ? 'Дата балансу' : 'Дата операції'}</td></tr></Fragment>)}</tbody>
    </table></div> : <div className="empty"><Ms>currency_exchange</Ms><div className="body-m">У цьому місяці курсових різниць немає</div></div>}
    {issues.length > 0 && <div className="body-s" style={{ marginTop: 6, color: 'var(--md-error)' }}>{issues.map(x => x.t).join('. ')}</div>}
    <p className="body-s muted" style={{ marginTop: 12 }}>Монетарні статті в валюті перераховуються за курсом НБУ на дату кожної оплати й на кінець місяця (П(С)БО 21). Розрахунки з постачальниками й покупцями та валютний рахунок: 945 / 714. Валютні кредити й відсотки за ними: 974 / 744.
      {advances.length > 0 && ` Аванси не перераховуються: ${advances.map(a => a.doc).join(', ')}.`}</p>
  </>;
}
