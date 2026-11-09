import { Fragment, useMemo, useState } from 'react';
import { COST_ACCOUNTS, CHART, checkLines } from '../recognize/chart';
import { activeItems, catalog } from '../recognize/nomenclature';
import { balances, cardCost, explode, r2, r3, tryAdd, type CostMethod, type Movement, type Posting, type StockAcc, type TechCard } from '../stock/engine';
import { getStock, addMovement, canChangeMethod, ledger, nameOf, newId, opts, removeMovement, saveCard, archiveCard, setMethod, unitOf, useStock } from '../stock/store';
import { useApp } from '../store';
import { cx, fmt, fmt0, Ms, plural } from '../lib';
import { StatCard } from './Overview';
import { Prices } from './Prices';

type Tab = 'bal' | 'prices' | 'sale' | 'ops' | 'cards' | 'journal';
const TABS: [Tab, string][] = [['bal', 'Залишки'], ['prices', 'Ціни постачальників'], ['sale', 'Списання за продажами'], ['ops', 'Переміщення і інвентаризація'], ['cards', 'Техкарти'], ['journal', 'Журнал рухів']];
const TYPE: Record<Movement['type'], [string, string]> = { in: ['Надходження', 'move_to_inbox'], move: ['Переміщення', 'swap_horiz'], prod: ['Списання за техкартами', 'restaurant'], out: ['Списання на витрати', 'outbox'], count: ['Інвентаризація', 'fact_check'] };
/** Дата за замовчуванням: сьогодні, але не раніше останнього руху (демо-журнал іде наперед). */
const today = () => [new Date().toISOString().slice(0, 10), ...getStock().movements.map(m => m.date)].sort().pop()!;
const dm = (d: string) => d.slice(8, 10) + '.' + d.slice(5, 7);
const qfmt = (n: number) => n.toLocaleString('uk-UA', { maximumFractionDigits: 3 });
const inp: React.CSSProperties = { width: '100%', font: 'inherit', fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-container-lowest)', color: 'var(--md-on-surface)' };
const Err = ({ t }: { t?: string | null }) => t ? <div className="body-s" style={{ marginTop: 6, color: 'var(--md-error)' }}>{t}</div> : null;

function Postings({ lines }: { lines: Posting[] }) {
  if (!lines.length) return <div className="body-s muted">Проводок немає: надходження проводить сама накладна</div>;
  const iss = checkLines(lines);
  return <>
    <div className="posting"><table><thead><tr><th>Дт</th><th>Кт</th><th className="r">Сума, ₴</th><th>Зміст</th></tr></thead>
      <tbody>{lines.map((l, i) => <tr key={i}><td>{l[0]}</td><td>{l[1]}</td><td className="r">{fmt(l[2])}</td><td className="body-s muted">{l[3]}</td></tr>)}</tbody></table></div>
    <Err t={iss.length ? iss.map(x => x.t).join('. ') : null} />
  </>;
}

export function Stock() {
  const st = useStock();
  const { snack } = useApp();
  const [tab, setTab] = useState<Tab>('bal');
  const L = useMemo(() => ledger(st), [st]);
  const bal = useMemo(() => balances(L.lots), [L]);
  const total = r2(bal.reduce((s, b) => s + b.value, 0));
  const errors = Object.values(L.results).filter(r => !r.ok).length;
  const changeMethod = (m: CostMethod) => { const e = setMethod(m); snack(e || (m === 'fifo' ? 'Метод оцінки: FIFO' : 'Метод оцінки: середньозважена собівартість')); };
  const locked = !canChangeMethod(st);
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Склад</h1><span className="spacer" />
        <div className="segmented" role="group" aria-label="Метод оцінки вибуття" title={locked ? 'Метод змінюється з нового року: вже є списання' : 'Облікова політика, П(С)БО 9'}>
          {(['avg', 'fifo'] as CostMethod[]).map(m => <button key={m} aria-pressed={st.method === m} disabled={locked && st.method !== m} onClick={() => changeMethod(m)}><Ms>check</Ms>{m === 'avg' ? 'Середня' : 'FIFO'}</button>)}
        </div></div>
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard ic="inventory_2" t="Запаси за обліком" v={fmt0(total) + ' ₴'} d={`${bal.length} ${plural(bal.length, 'залишок', 'залишки', 'залишків')} на ${st.locations.length} ${plural(st.locations.length, 'складі', 'складах', 'складах')}`} />
        <StatCard ic="layers" t="Партій" v={String(L.lots.length)} d={st.method === 'fifo' ? 'списуються від найстарішої' : 'оцінка за середньою по складу'} />
        <StatCard ic="menu_book" t="Техкарт" v={String(st.cards.filter(c => !c.archived).length)} d="з напівфабрикатами" />
        <StatCard ic={errors ? 'error' : 'verified'} t="Від’ємних залишків" v="0" d={errors ? `${errors} ${plural(errors, 'рух не проведено', 'рухи не проведено', 'рухів не проведено')}` : 'рух без залишку не проводиться'} />
      </div>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'bal' && <Balances bal={bal} lots={L.lots} />}
      {tab === 'prices' && <Prices />}
      {tab === 'sale' && <SaleForm />}
      {tab === 'ops' && <OpsForm />}
      {tab === 'cards' && <Cards lots={L.lots} />}
      {tab === 'journal' && <Journal results={L.results} />}
    </div>
  );
}

function Balances({ bal, lots }: { bal: ReturnType<typeof balances>; lots: ReturnType<typeof ledger>['lots'] }) {
  const st = useStock();
  const [loc, setLoc] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const rows = bal.filter(b => !loc || b.loc === loc).sort((a, b) => nameOf(a.item).localeCompare(nameOf(b.item)) || a.loc.localeCompare(b.loc));
  return <>
    <div className="chips" style={{ marginBottom: 12 }}>
      {[['', 'Усі склади'], ...st.locations.map(l => [l.id, l.name])].map(([id, n]) => <button key={id} className="chip sl" aria-pressed={loc === id} onClick={() => setLoc(id)}>{loc === id && <Ms>check</Ms>}{n}</button>)}
    </div>
    {rows.length ? <div className="table-wrap"><table className="dt">
      <thead><tr><th>Позиція</th>{!loc && <th>Склад</th>}<th>Рахунок</th><th className="r">Кількість</th><th className="r">Ціна, ₴</th><th className="r">Сума, ₴</th><th className="r">Партій</th></tr></thead>
      <tbody>{rows.map(b => { const k = `${b.loc}|${b.item}|${b.acc}`; return <Fragment key={k}>
        <tr onClick={() => setOpen(open === k ? null : k)}><td className="title-s">{nameOf(b.item)}</td>{!loc && <td>{nameOf(b.loc)}</td>}<td className="num" title={CHART[b.acc]}>{b.acc}</td>
          <td className="r">{qfmt(b.qty)} {unitOf(b.item)}</td><td className="r">{fmt(b.value / b.qty)}</td><td className="r">{fmt(b.value)}</td><td className="r">{b.lots}<Ms className="muted" style={{ fontSize: 18, verticalAlign: 'middle' }}>{open === k ? 'expand_less' : 'expand_more'}</Ms></td></tr>
        {open === k && lots.filter(l => l.loc === b.loc && l.item === b.item && l.acc === b.acc).map(l =>
          <tr key={l.id} className="body-s"><td className="muted" colSpan={loc ? 2 : 3}>Партія від {dm(l.date)} · {l.src}</td><td className="r muted">{qfmt(l.qty)}</td><td className="r muted">{fmt(l.value / l.qty)}</td><td className="r muted">{fmt(l.value)}</td><td /></tr>)}
      </Fragment>; })}</tbody>
    </table></div> : <div className="empty"><Ms>inventory_2</Ms><div className="body-m">На цьому складі залишків немає</div></div>}
    <p className="body-s muted" style={{ marginTop: 12 }}>Залишки рахуються з журналу рухів, тож документ заднім числом чи скасування одразу перераховує собівартість усіх наступних списань. Надходження з’являються, коли бухгалтер проводить товарну накладну з прив’язаною номенклатурою.</p>
  </>;
}

/** Списання сировини за проданими стравами (дані зміни з ПРРО). */
function SaleForm() {
  const st = useStock();
  const { snack } = useApp();
  const [date, setDate] = useState(today());
  const [loc, setLoc] = useState(st.locations.find(l => l.id === 'kitchen')?.id || st.locations[0]?.id || '');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const cards = st.cards.filter(c => !c.archived && c.unit !== 'кг');
  const sales = cards.map(c => ({ card: c.id, name: c.name, qty: +(qty[c.id] || 0) })).filter(x => x.qty > 0);
  const ex = explode(st.cards, sales);
  const mv: Movement = { id: newId('p'), type: 'prod', date, loc, note: `Продажі за ПРРО, зміна ${dm(date)}`, sales, rows: ex.rows };
  const pre = sales.length && !ex.error ? tryAdd(st.movements, mv, st.method, opts()) : null;
  const post = () => {
    const e = addMovement(mv); setErr(e);
    if (!e) { setQty({}); snack(`Списано сировину за ${sales.length} ${plural(sales.length, 'стравою', 'стравами', 'стравами')}`, () => removeMovement(mv.id)); }
  };
  return <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', alignItems: 'start' }}>
    <div className="card card-outlined">
      <div className="title-m" style={{ marginBottom: 12 }}>Продано за зміну</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input type="date" style={inp} value={date} onChange={e => setDate(e.target.value)} aria-label="Дата" />
        <select className="nom-sel" value={loc} onChange={e => setLoc(e.target.value)} aria-label="Звідки списати">{st.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      </div>
      <table className="dt compact"><tbody>{cards.map(c => <tr key={c.id}><td>{c.name}</td>
        <td style={{ width: 110 }}><input style={{ ...inp, textAlign: 'right' }} inputMode="decimal" placeholder="0" value={qty[c.id] || ''} onChange={e => setQty(q => ({ ...q, [c.id]: e.target.value.replace(',', '.') }))} aria-label={`Продано: ${c.name}`} /></td><td className="muted body-s">{c.unit}</td></tr>)}</tbody></table>
      <div className="body-s muted" style={{ marginTop: 8 }}>Кількість — з Z-звіту ПРРО. Напівфабрикати розкладаються на сировину за своїми картками.</div>
    </div>
    <div className="card card-outlined">
      <div className="title-m" style={{ marginBottom: 12 }}>Буде списано</div>
      {!sales.length ? <div className="body-m muted">Вкажіть кількість проданих страв</div> : ex.error ? <Err t={ex.error} /> : <>
        <table className="dt compact"><thead><tr><th>Сировина</th><th className="r">Кількість</th><th className="r">Собівартість, ₴</th></tr></thead>
          <tbody>{ex.rows.map(r => { const got = pre?.ok ? pre.result.rows.find(x => x.item === r.item) : undefined; return <tr key={r.item}><td>{nameOf(r.item)}</td><td className="r">{qfmt(r.qty)} {unitOf(r.item)}</td><td className="r">{got ? fmt(got.value) : '—'}</td></tr>; })}</tbody></table>
        <div style={{ marginTop: 12 }}>{pre?.ok ? <Postings lines={pre.result.postings} /> : <Err t={pre && !pre.ok ? pre.error : null} />}</div>
      </>}
      <Err t={err} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-filled sl" disabled={!pre?.ok} onClick={post}><Ms>check</Ms>Провести списання</button></div>
    </div>
  </div>;
}

type OpKind = 'move' | 'out' | 'count';
function OpsForm() {
  const st = useStock();
  const { snack } = useApp();
  const [kind, setKind] = useState<OpKind>('move');
  const [date, setDate] = useState(today());
  const [loc, setLoc] = useState(st.locations[0]?.id || '');
  const [to, setTo] = useState(st.locations[1]?.id || '');
  const [cost, setCost] = useState('');
  const [rows, setRows] = useState<{ item: string; qty: string }[]>([{ item: '', qty: '' }]);
  const [err, setErr] = useState<string | null>(null);
  const L = useMemo(() => ledger(st, date), [st, date]);
  const book = (item: string) => balances(L.lots).filter(b => b.loc === loc && b.item === item);
  const items = activeItems(catalog());
  const good = rows.filter(r => r.item && r.qty !== '' && !Number.isNaN(+r.qty));
  const acc = (item: string): StockAcc => book(item)[0]?.acc || '201';
  const id = useMemo(() => newId('m'), [kind, st]);
  const mv: Movement | null = !good.length ? null
    : kind === 'move' ? { id, type: 'move', date, loc, to, rows: good.map(r => ({ item: r.item, qty: +r.qty })) }
      : kind === 'out' ? (cost ? { id, type: 'out', date, loc, cost, rows: good.map(r => ({ item: r.item, qty: +r.qty })) } : null)
        : { id, type: 'count', date, loc, rows: good.map(r => ({ item: r.item, acc: acc(r.item), fact: +r.qty })) };
  const pre = mv ? tryAdd(st.movements, mv, st.method, opts()) : null;
  const post = () => {
    if (!mv) return;
    const e = addMovement(mv); setErr(e);
    if (!e) { setRows([{ item: '', qty: '' }]); snack(`${TYPE[mv.type][0]} проведено`, () => removeMovement(mv.id)); }
  };
  const fillCount = () => setRows(balances(L.lots).filter(b => b.loc === loc).map(b => ({ item: b.item, qty: String(b.qty) })));
  return <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', alignItems: 'start' }}>
    <div className="card card-outlined">
      <div className="chips" style={{ marginBottom: 12 }}>{([['move', 'Переміщення'], ['out', 'Списання на витрати'], ['count', 'Інвентаризація']] as [OpKind, string][]).map(([k, l]) =>
        <button key={k} className="chip sl" aria-pressed={kind === k} onClick={() => { setKind(k); setErr(null); }}>{kind === k && <Ms>check</Ms>}{l}</button>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <input type="date" style={inp} value={date} onChange={e => setDate(e.target.value)} aria-label="Дата" />
        <select className="nom-sel" value={loc} onChange={e => setLoc(e.target.value)} aria-label="Склад">{st.locations.map(l => <option key={l.id} value={l.id}>{kind === 'move' ? 'Звідки: ' : ''}{l.name}</option>)}</select>
        {kind === 'move' && <select className="nom-sel" style={{ gridColumn: '1 / -1' }} value={to} onChange={e => setTo(e.target.value)} aria-label="Куди">{st.locations.map(l => <option key={l.id} value={l.id}>Куди: {l.name}</option>)}</select>}
        {kind === 'out' && <select className="nom-sel" style={{ gridColumn: '1 / -1' }} value={cost} onChange={e => setCost(e.target.value)} aria-label="Рахунок витрат">
          <option value="">Рахунок витрат: обирає бухгалтер…</option>{COST_ACCOUNTS.map(a => <option key={a} value={a}>{a} {CHART[a]}</option>)}</select>}
      </div>
      <table className="dt compact"><thead><tr><th>Позиція</th><th className="r">{kind === 'count' ? 'Фактично' : 'Кількість'}</th>{kind === 'count' && <th className="r">За обліком</th>}<th /></tr></thead>
        <tbody>{rows.map((r, i) => { const b = book(r.item).reduce((s, x) => s + x.qty, 0); return <tr key={i}>
          <td><select className="nom-sel" value={r.item} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, item: e.target.value } : x))} aria-label="Позиція">
            <option value="">Оберіть позицію…</option>{items.map(o => <option key={o.id} value={o.id}>{o.name}, {o.unit}</option>)}</select>
            {r.item && kind !== 'count' && <div className="body-s muted">Є {qfmt(b)} {unitOf(r.item)}</div>}</td>
          <td style={{ width: 100 }}><input style={{ ...inp, textAlign: 'right' }} inputMode="decimal" value={r.qty} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, qty: e.target.value.replace(',', '.') } : x))} aria-label="Кількість" /></td>
          {kind === 'count' && <td className="r body-s">{r.item ? qfmt(r3(b)) : ''}</td>}
          <td style={{ width: 40 }}><button className="icon-btn sl" aria-label="Прибрати рядок" onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : [{ item: '', qty: '' }])}><Ms>close</Ms></button></td></tr>; })}</tbody></table>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-text sl" onClick={() => setRows(rs => [...rs, { item: '', qty: '' }])}><Ms>add</Ms>Рядок</button>
        {kind === 'count' && <button className="btn btn-text sl" onClick={fillCount}><Ms>playlist_add</Ms>Заповнити залишками</button>}
      </div>
      {kind === 'out' && <div className="body-s muted" style={{ marginTop: 8 }}>Господарські матеріали готелю, МШП у експлуатацію, псування з вини підприємства. Рахунок витрат система не обирає сама.</div>}
    </div>
    <div className="card card-outlined">
      <div className="title-m" style={{ marginBottom: 12 }}>Проводки</div>
      {!mv ? <div className="body-m muted">{kind === 'out' && good.length ? 'Оберіть рахунок витрат' : 'Додайте позиції'}</div> : pre?.ok ? <>
        <Postings lines={pre.result.postings} />
        {kind === 'count' && !pre.result.postings.length && <div className="body-s muted">Розбіжностей немає</div>}
      </> : <Err t={pre && !pre.ok ? pre.error : null} />}
      <Err t={err} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-filled sl" disabled={!pre?.ok} onClick={post}><Ms>check</Ms>Провести</button></div>
    </div>
  </div>;
}

function Cards({ lots }: { lots: ReturnType<typeof ledger>['lots'] }) {
  const st = useStock();
  const { snack } = useApp();
  const [edit, setEdit] = useState<TechCard | null>(null);
  const [loc, setLoc] = useState(st.locations.find(l => l.id === 'kitchen')?.id || st.locations[0]?.id || '');
  const items = activeItems(catalog());
  if (edit) {
    const set = (f: (c: TechCard) => TechCard) => setEdit(c => c && f(c));
    const ex = explode([...st.cards.filter(c => c.id !== edit.id), edit], [{ card: edit.id, qty: 1 }]);
    const valid = edit.name.trim() && edit.out > 0 && edit.rows.length && edit.rows.every(r => (r.item || r.card) && r.qty > 0) && !ex.error;
    return <div className="card card-outlined">
      <div className="title-m" style={{ marginBottom: 12 }}>{st.cards.some(c => c.id === edit.id) ? 'Техкарта' : 'Нова техкарта'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <input style={inp} placeholder="Назва страви або напівфабрикату" value={edit.name} onChange={e => set(c => ({ ...c, name: e.target.value }))} aria-label="Назва" />
        <input style={{ ...inp, textAlign: 'right' }} inputMode="decimal" value={edit.out || ''} onChange={e => set(c => ({ ...c, out: +e.target.value.replace(',', '.') || 0 }))} aria-label="Вихід" placeholder="Вихід" />
        <select className="nom-sel" value={edit.unit} onChange={e => set(c => ({ ...c, unit: e.target.value }))} aria-label="Одиниця виходу"><option value="порц">порц</option><option value="кг">кг (напівфабрикат)</option><option value="л">л</option><option value="шт">шт</option></select>
      </div>
      <table className="dt compact"><thead><tr><th>Інгредієнт</th><th className="r">Брутто на вихід</th><th /></tr></thead>
        <tbody>{edit.rows.map((r, i) => <tr key={i}>
          <td><select className="nom-sel" value={r.card ? 'c:' + r.card : r.item || ''} aria-label="Інгредієнт" onChange={e => { const v = e.target.value; set(c => ({ ...c, rows: c.rows.map((x, j) => j === i ? (v.startsWith('c:') ? { card: v.slice(2), qty: x.qty } : { item: v, qty: x.qty }) : x) })); }}>
            <option value="">Оберіть…</option>
            <optgroup label="Сировина">{items.map(o => <option key={o.id} value={o.id}>{o.name}, {o.unit}</option>)}</optgroup>
            <optgroup label="Напівфабрикати">{st.cards.filter(c => c.id !== edit.id && !c.archived).map(c => <option key={c.id} value={'c:' + c.id}>{c.name}, {c.unit}</option>)}</optgroup>
          </select></td>
          <td style={{ width: 120 }}><input style={{ ...inp, textAlign: 'right' }} inputMode="decimal" value={r.qty || ''} onChange={e => set(c => ({ ...c, rows: c.rows.map((x, j) => j === i ? { ...x, qty: +e.target.value.replace(',', '.') || 0 } : x) }))} aria-label="Кількість" /></td>
          <td style={{ width: 40 }}><button className="icon-btn sl" aria-label="Прибрати" onClick={() => set(c => ({ ...c, rows: c.rows.filter((_, j) => j !== i) }))}><Ms>close</Ms></button></td></tr>)}</tbody></table>
      <button className="btn btn-text sl" style={{ marginTop: 8 }} onClick={() => set(c => ({ ...c, rows: [...c.rows, { item: '', qty: 0 }] }))}><Ms>add</Ms>Інгредієнт</button>
      <Err t={ex.error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button className="btn btn-text sl" onClick={() => setEdit(null)}>Скасувати</button>
        <button className="btn btn-filled sl" disabled={!valid} onClick={() => { saveCard({ ...edit, name: edit.name.trim() }); setEdit(null); snack('Техкарту збережено. Проведені списання не змінюються'); }}><Ms>save</Ms>Зберегти</button>
      </div>
    </div>;
  }
  return <>
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="body-m muted">Собівартість порції за залишками складу</span>
      <select className="nom-sel" style={{ width: 'auto' }} value={loc} onChange={e => setLoc(e.target.value)} aria-label="Склад">{st.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      <span className="spacer" style={{ flex: 1 }} />
      <button className="btn btn-filled sl" onClick={() => setEdit({ id: newId('c'), name: '', out: 1, unit: 'порц', rows: [{ item: '', qty: 0 }] })}><Ms>add</Ms>Нова техкарта</button>
    </div>
    <div className="table-wrap"><table className="dt">
      <thead><tr><th>Страва</th><th>Склад</th><th className="r">Вихід</th><th className="r">Собівартість, ₴</th><th /></tr></thead>
      <tbody>{st.cards.map(c => { const k = cardCost(st.cards, c.id, lots, loc); return <tr key={c.id} className={cx(c.archived && 'muted')} onClick={() => setEdit(structuredClone(c))}>
        <td className="title-s">{c.name}{c.archived && ' (архів)'}</td>
        <td className="body-s muted">{c.rows.map(r => `${r.card ? nameOf(r.card) : nameOf(r.item!)} ${qfmt(r.qty)}`).join(' · ')}</td>
        <td className="r">{qfmt(c.out)} {c.unit}</td>
        <td className="r">{k.missing.length ? <span className="body-s muted" title={k.missing.map(m => nameOf(m)).join(', ')}>немає ціни</span> : fmt(k.cost)}</td>
        <td className="r"><button className="btn btn-text sl" onClick={e => { e.stopPropagation(); archiveCard(c.id, !c.archived); }}>{c.archived ? 'Повернути' : 'В архів'}</button></td></tr>; })}</tbody>
    </table></div>
    <p className="body-s muted" style={{ marginTop: 12 }}>Кількість — брутто на вихід картки. Техкарти не видаляються, а архівуються: на них посилаються проведені списання. Зміна картки діє з наступного списання.</p>
  </>;
}

function Journal({ results }: { results: ReturnType<typeof ledger>['results'] }) {
  const st = useStock();
  const { snack } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const list = [...st.movements].sort((a, b) => b.date.localeCompare(a.date));
  const cancel = (m: Movement) => { const e = removeMovement(m.id); snack(e || `${TYPE[m.type][0]} від ${dm(m.date)} скасовано`); };
  return <div className="table-wrap"><table className="dt">
    <thead><tr><th>Дата</th><th>Операція</th><th>Склад</th><th className="r">Сума, ₴</th><th>Проводки</th><th /></tr></thead>
    <tbody>{list.map(m => { const r = results[m.id]; const sum = r ? r2(r.rows.reduce((s, x) => s + Math.abs(x.value), 0)) : 0; return <Fragment key={m.id}>
      <tr onClick={() => setOpen(open === m.id ? null : m.id)}><td className="num">{dm(m.date)}</td>
        <td><div className="doc"><Ms>{TYPE[m.type][1]}</Ms><div><div className="title-s">{TYPE[m.type][0]}</div><div className="body-s muted">{m.doc || m.note || (m.type === 'out' ? `Рахунок ${m.cost}` : '')}</div></div></div></td>
        <td>{nameOf(m.loc)}{m.type === 'move' && <> → {nameOf(m.to)}</>}</td><td className="r">{fmt(sum)}</td>
        <td className="op-lines">{r?.ok ? r.postings.map((p, j) => <span key={j}>{j > 0 && <br />}Дт {p[0]} · Кт {p[1]}</span>) : <span style={{ color: 'var(--md-error)' }}>{r?.error}</span>}</td>
        <td className="r">{!m.id.startsWith('doc') && <button className="btn btn-text sl" onClick={e => { e.stopPropagation(); cancel(m); }}>Скасувати</button>}</td></tr>
      {open === m.id && r && <tr><td /><td colSpan={5}>
        {m.type === 'prod' && <div className="body-s" style={{ marginBottom: 8 }}>{m.sales.map(x => `${x.name} × ${qfmt(x.qty)}`).join(', ')}</div>}
        <table className="dt compact"><tbody>{r.rows.map((x, i) => <tr key={i}><td>{nameOf(x.item)}</td><td className="num">{x.acc}</td><td className="r">{qfmt(x.qty)} {unitOf(x.item)}</td><td className="r">{fmt(x.value)}</td>
          <td className="body-s muted">{x.lots.length} {plural(x.lots.length, 'партія', 'партії', 'партій')}</td></tr>)}</tbody></table>
      </td></tr>}
    </Fragment>; })}</tbody>
  </table></div>;
}
