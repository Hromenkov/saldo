import { useState } from 'react';
import {
  accountOf, accrue, canCommission, commissionLines, DEPR_EXPENSE, disposalIssues, disposalLines, METHODS, monthAmount, newAsset,
  residual, schedule, status, TAX_GROUPS, taxGroup, validate, wear, ymAdd, ymFromLabel, ymLabel, type Asset, type Disposal, type Line, type Method
} from '../assets/fixed';
import { checkLines } from '../recognize/chart';
import { useApp } from '../store';
import { cx, fmt, Ms } from '../lib';
import { StatCard } from './Overview';

const ST: Record<ReturnType<typeof status>, [string, string, string]> = {
  draft: ['st-check', 'inventory_2', 'На 152, не введено'],
  service: ['st-ok', 'check', 'В експлуатації'],
  disposed: ['st-mute', 'block', 'Вибув']
};
const AssetStatus = ({ a }: { a: Asset }) => { const [c, ic, t] = ST[status(a)]; return <span className={'status ' + c}><Ms>{ic}</Ms>{t}</span>; };
const usePeriod = () => { const { s } = useApp(); return ymFromLabel(s.period) || '2026-11'; };

function Lines({ lines }: { lines: Line[] }) {
  const iss = checkLines(lines);
  return <>
    <div className="posting"><table><thead><tr><th>Дт</th><th>Кт</th><th className="r">Сума, ₴</th><th>Зміст</th></tr></thead>
      <tbody>{lines.map((l, i) => <tr key={i}><td>{l[0]}</td><td>{l[1]}</td><td className="r">{fmt(l[2])}</td><td className="body-s muted">{l[3]}</td></tr>)}</tbody></table></div>
    {iss.length > 0 && <div className="body-s" style={{ marginTop: 6, color: 'var(--md-error)' }}>{iss.map(x => x.t).join('. ')}</div>}
  </>;
}

export function Assets() {
  const { s, upd, snack, openSheet } = useApp();
  const ym = usePeriod();
  const [units, setUnits] = useState<Record<string, string>>({});
  const list = s.assets;
  const live = list.filter(a => status(a) !== 'disposed');
  const unitsNum = Object.fromEntries(Object.entries(units).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, +v.replace(',', '.')]));
  const plan = accrue(list, ym, unitsNum);
  const prod = list.filter(a => a.method === 'production' && status(a) === 'service' && a.accrued[ym] === undefined && monthAmount(a, ym, 1) > 0);
  const done = list.filter(a => a.accrued[ym] !== undefined);
  const total = (xs: number[]) => xs.reduce((x, y) => x + y, 0);

  const run = () => {
    const before = list;
    upd(d => {
      for (const a of d.assets) {
        const m = plan.amounts[a.id]; if (m === undefined) continue;
        a.accrued[ym] = m;
        a.log.push({ ym, t: 'Амортизація', lines: [plan.byId[a.id]] });
      }
      const step = d.close.find(c => c.key === 'assets');
      if (step && !plan.issues.length) { step.done = true; step.s = `${done.length + Object.keys(plan.amounts).length} об’єкти ОЗ, ${fmt(total(Object.values(plan.amounts)) + total(done.map(a => a.accrued[ym])))} ₴ за ${ymLabel(ym).toLowerCase()}`; }
    });
    snack(`Амортизацію нараховано: ${fmt(total(Object.values(plan.amounts)))} ₴`, () => upd(d => { d.assets = structuredClone(before) as typeof d.assets; const st = d.close.find(c => c.key === 'assets'); if (st) st.done = false; }));
  };
  const add = () => {
    const id = 'a' + Date.now();
    upd(d => { d.assets.push({ ...newAsset(id), inv: `ОЗ-${String(d.assets.length + 1).padStart(3, '0')}` }); });
    openSheet({ kind: 'asset', id });
  };

  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Основні засоби</h1><span className="spacer" />
        <button className="btn btn-outlined sl" onClick={add}><Ms>add</Ms>Новий об’єкт</button>
        <button className="btn btn-filled sl" disabled={!plan.lines.length} onClick={run}><Ms>calculate</Ms>Нарахувати амортизацію за {ymLabel(ym).toLowerCase()}</button></div>
      {plan.issues.length > 0 && <div className="banner"><Ms>info</Ms><div className="txt body-m">
        <div className="title-s">Не всі об’єкти можна амортизувати</div>
        {plan.issues.map(i => <div key={i.id}><button className="btn btn-text sl" style={{ padding: 0, height: 'auto' }} onClick={() => openSheet({ kind: 'asset', id: i.id })}>{i.t}</button></div>)}
        {prod.map(a => <div key={a.id} className="tf" style={{ maxWidth: 280, marginTop: 12 }}>
          <input id={'u-' + a.id} placeholder=" " inputMode="decimal" value={units[a.id] ?? ''} onChange={e => setUnits(u => ({ ...u, [a.id]: e.target.value }))} />
          <label htmlFor={'u-' + a.id}>{a.name}: обсяг за місяць{a.unitName ? `, ${a.unitName}` : ''}</label></div>)}
        <div className="body-s" style={{ marginTop: 6 }}>Рахунок витрат система не підставляє: його обирає бухгалтер у картці об’єкта.</div>
      </div></div>}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard ic="inventory_2" t="Об’єктів" v={String(live.length)} d={`${list.filter(a => status(a) === 'draft').length} очікують введення`} />
        <StatCard ic="payments" t="Первісна вартість" v={fmt(total(live.map(a => a.cost))) + ' ₴'} d="рахунки 103–109 і 152" />
        <StatCard ic="trending_down" t="Знос" v={fmt(total(live.map(wear))) + ' ₴'} d="рахунок 131" />
        <StatCard ic="calculate" t={`Амортизація, ${ymLabel(ym).toLowerCase()}`} v={fmt(total(done.map(a => a.accrued[ym])) || total(Object.values(plan.amounts))) + ' ₴'} d={done.length ? 'нараховано' : 'до нарахування'} />
      </div>
      <div className="table-wrap"><table className="dt" style={{ minWidth: 980 }}>
        <thead><tr><th>Об’єкт</th><th>Група · рахунок</th><th>Метод</th><th>Рахунок витрат</th><th className="r">Первісна, ₴</th><th className="r">Знос, ₴</th><th className="r">Залишкова, ₴</th><th>Статус</th></tr></thead>
        <tbody>{list.map(a => (
          <tr key={a.id} onClick={() => openSheet({ kind: 'asset', id: a.id })}>
            <td><div className="title-s">{a.name || 'Без назви'}</div><div className="body-s muted">інв. № {a.inv}{a.place ? ` · ${a.place}` : ''}</div></td>
            <td>{taxGroup(a.tg)?.group ?? '—'} · {status(a) === 'draft' ? '152' : accountOf(a)}</td>
            <td className="muted">{METHODS[a.method]}, {a.months} міс.</td>
            <td>{a.expense || <span style={{ color: 'var(--md-error)' }}>не обрано</span>}</td>
            <td className="r">{fmt(a.cost)}</td><td className="r">{fmt(wear(a))}</td><td className="r">{fmt(residual(a))}</td><td><AssetStatus a={a} /></td></tr>
        ))}</tbody>
      </table></div>
      <p className="body-s muted" style={{ marginTop: 12 }}>Амортизація нараховується з місяця, наступного за введенням в експлуатацію, і припиняється з місяця, наступного за вибуттям (П(С)БО 7). Мінімальні строки податкового обліку — п. 138.3.3 ПКУ.</p>
    </div>
  );
}

/** Підсумки графіка за роками: сума, знос і залишкова на кінець року */
function Schedule({ a }: { a: Asset }) {
  if (a.method === 'production') return <div className="body-s muted">Виробничий метод: {a.units ? `${fmt((a.cost - a.liq) / a.units)} ₴ на одиницю продукції` : 'вкажіть загальний обсяг продукції'}. Сума місяця залежить від фактичного обсягу.</div>;
  const sch = schedule(a);
  if (!sch.length) return null;
  const start = a.commissioned ? ymAdd(a.commissioned, 1) : null;
  const rows: [string, number, number][] = [];
  let acc = 0;
  for (let y = 0; y * 12 < sch.length; y++) {
    const part = sch.slice(y * 12, y * 12 + 12).reduce((p, q) => p + q, 0);
    acc += part;
    rows.push([start ? `${ymLabel(ymAdd(start, y * 12)).toLowerCase()} – ${ymLabel(ymAdd(start, Math.min(sch.length, y * 12 + 12) - 1)).toLowerCase()}` : `${y + 1}-й рік`, part, a.cost - acc]);
  }
  return <div className="posting"><table><thead><tr><th>Період</th><th className="r">Амортизація, ₴</th><th className="r">Залишкова на кінець, ₴</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r[0]}><td>{r[0]}</td><td className="r">{fmt(r[1])}</td><td className="r">{fmt(r[2])}</td></tr>)}</tbody></table></div>;
}

const num = (v: string) => { const n = +v.replace(/\s/g, '').replace(',', '.'); return Number.isFinite(n) ? n : 0; };

export function AssetSheet({ id }: { id: string }) {
  const { s, upd, snack, closeSheet } = useApp();
  const ym = usePeriod();
  const saved = s.assets.find(a => a.id === id);
  const [d, setD] = useState<Asset | undefined>(saved && structuredClone(saved));
  const [disp, setDisp] = useState<Disposal>({ ym, how: 'liquidation' });
  const [inMonth, setInMonth] = useState(ym);
  if (!saved || !d) return null;
  const st = status(saved);
  const locked = st !== 'draft';
  const set = <K extends keyof Asset>(k: K, v: Asset[K]) => setD(x => x && { ...x, [k]: v });
  const issues = validate(d);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const save = (patch: Partial<Asset> = {}, msg?: string) => {
    const prev = saved;
    upd(x => { const i = x.assets.findIndex(a => a.id === id); if (i >= 0) x.assets[i] = { ...structuredClone(d), ...patch } as typeof x.assets[number]; });
    snack(msg || 'Картку ОЗ збережено', () => upd(x => { const i = x.assets.findIndex(a => a.id === id); if (i >= 0) x.assets[i] = structuredClone(prev) as typeof x.assets[number]; }));
  };
  const commission = () => {
    const lines = commissionLines(d);
    save({ commissioned: inMonth, log: [...d.log, { ym: inMonth, t: 'Введення в експлуатацію (ОЗ-1)', lines }] }, `${d.name} введено в експлуатацію: Дт ${accountOf(d)} Кт 152`);
    closeSheet();
  };
  const dIssues = disposalIssues(saved, disp);
  const dLines = disposalLines(saved, disp);
  const dispose = () => {
    save({ disposed: disp, log: [...d.log, { ym: disp.ym, t: disp.how === 'sale' ? 'Продаж' : 'Ліквідація (ОЗ-3)', lines: dLines }] }, `${d.name}: ${disp.how === 'sale' ? 'продаж' : 'ліквідацію'} проведено`);
    closeSheet();
  };
  const remove = () => {
    const i = s.assets.findIndex(a => a.id === id);
    upd(x => { x.assets.splice(i, 1); });
    closeSheet();
    snack('Чернетку картки видалено', () => upd(x => { x.assets.splice(i, 0, structuredClone(saved) as typeof x.assets[number]); }));
  };
  const g = taxGroup(d.tg);
  return (
    <>
      <div className="sheet-head"><h2 className="title-l">{saved.name || 'Новий об’єкт ОЗ'}</h2><button className="icon-btn sl" aria-label="Закрити" onClick={closeSheet}><Ms>close</Ms></button></div>
      <div className="sheet-body">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><AssetStatus a={saved} />{saved.commissioned && <span className="status st-mute"><Ms>event</Ms>Введено: {ymLabel(saved.commissioned).toLowerCase()}</span>}</div>
        {locked && <div className="stats3"><div><b>{fmt(saved.cost)}</b><span>Первісна, ₴</span></div><div><b>{fmt(wear(saved))}</b><span>Знос, ₴</span></div><div><b>{fmt(residual(saved))}</b><span>Залишкова, ₴</span></div></div>}
        <div className="form-grid">
          <div className="tf full"><input id="as-name" placeholder=" " value={d.name} disabled={locked} onChange={e => set('name', e.target.value)} /><label htmlFor="as-name">Назва</label></div>
          <div className="tf"><input id="as-inv" placeholder=" " value={d.inv} disabled={locked} onChange={e => set('inv', e.target.value)} /><label htmlFor="as-inv">Інвентарний номер</label></div>
          <div className="tf"><input id="as-place" placeholder=" " value={d.place || ''} onChange={e => set('place', e.target.value)} /><label htmlFor="as-place">Місце використання</label></div>
          <div className="tf full"><select id="as-tg" value={d.tg} disabled={locked} onChange={e => set('tg', e.target.value)}>{TAX_GROUPS.map(t => <option key={t.id} value={t.id}>{t.group} · {t.t} (рах. {t.acc})</option>)}</select>
            <label htmlFor="as-tg">Група (п. 138.3.3 ПКУ)</label><Ms className="trail-ic">arrow_drop_down</Ms></div>
          <div className="tf"><input id="as-cost" placeholder=" " inputMode="decimal" defaultValue={locked ? d.cost : d.cost || ''} disabled={locked} onChange={e => set('cost', num(e.target.value))} /><label htmlFor="as-cost">Первісна вартість, ₴</label></div>
          <div className="tf"><input id="as-liq" placeholder=" " inputMode="decimal" defaultValue={locked ? d.liq : d.liq || ''} disabled={locked} onChange={e => set('liq', num(e.target.value))} /><label htmlFor="as-liq">Ліквідаційна вартість, ₴</label></div>
          <div className="tf"><input id="as-m" placeholder=" " inputMode="numeric" defaultValue={d.months} disabled={locked} onChange={e => set('months', Math.round(num(e.target.value)))} /><label htmlFor="as-m">Строк використання, міс.</label>
            {g && <div className="support">Податковий мінімум: {g.years * 12} міс.</div>}</div>
          <div className="tf"><select id="as-meth" value={d.method} disabled={locked} onChange={e => set('method', e.target.value as Method)}>{Object.entries(METHODS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
            <label htmlFor="as-meth">Метод амортизації</label><Ms className="trail-ic">arrow_drop_down</Ms></div>
          {d.method === 'production' && <>
            <div className="tf"><input id="as-u" placeholder=" " inputMode="decimal" defaultValue={d.units || ''} disabled={locked} onChange={e => set('units', num(e.target.value))} /><label htmlFor="as-u">Обсяг продукції за строк</label></div>
            <div className="tf"><input id="as-un" placeholder=" " value={d.unitName || ''} disabled={locked} onChange={e => set('unitName', e.target.value)} /><label htmlFor="as-un">Одиниця (порції, км, мото-год)</label></div>
          </>}
          <div className={cx('tf full', !d.expense && 'warn')}>
            <select id="as-exp" value={d.expense || ''} disabled={st === 'disposed'} onChange={e => set('expense', e.target.value || null)}>
              <option value="">Не обрано</option>{DEPR_EXPENSE.map(([k, t]) => <option key={k} value={k}>{k} {t}</option>)}</select>
            <label htmlFor="as-exp">Рахунок витрат для амортизації (Дт … Кт 131)</label><Ms className="trail-ic">arrow_drop_down</Ms>
            <div className="support">{d.expense ? 'Обрано бухгалтером' : 'Система не обирає сама: виробництво 23, цех 91, офіс 92, продаж 93'}</div></div>
          {!locked && <div className="tf"><input id="as-in" type="month" placeholder=" " value={inMonth} onChange={e => setInMonth(e.target.value)} /><label htmlFor="as-in">Місяць введення в експлуатацію</label></div>}
        </div>
        {issues.length > 0 && st !== 'disposed' && <ul className="checks body-m">{issues.map((i, k) => <li key={k}><Ms style={{ color: i.level === 'error' ? 'var(--md-error)' : '#8A6100' }}>{i.level === 'error' ? 'error' : 'warning'}</Ms>{i.t}</li>)}</ul>}
        <div><div className="title-s" style={{ marginBottom: 8 }}>Графік амортизації</div><Schedule a={{ ...d, commissioned: locked ? saved.commissioned : inMonth }} /></div>
        {st === 'draft' && <div><div className="title-s" style={{ marginBottom: 8 }}>Проводка введення в експлуатацію</div><Lines lines={commissionLines(d)} /></div>}
        {st === 'service' && <div className="card card-outlined" style={{ display: 'grid', gap: 16 }}>
          <div className="title-s">Вибуття</div>
          <div className="form-grid">
            <div className="tf"><select id="ds-how" value={disp.how} onChange={e => setDisp(x => ({ ...x, how: e.target.value as Disposal['how'] }))}><option value="liquidation">Ліквідація (акт ОЗ-3)</option><option value="sale">Продаж</option></select>
              <label htmlFor="ds-how">Спосіб</label><Ms className="trail-ic">arrow_drop_down</Ms></div>
            <div className="tf"><input id="ds-ym" type="month" placeholder=" " value={disp.ym} onChange={e => setDisp(x => ({ ...x, ym: e.target.value }))} /><label htmlFor="ds-ym">Місяць вибуття</label></div>
            {disp.how === 'sale' && <>
              <div className="tf"><input id="ds-p" placeholder=" " inputMode="decimal" onChange={e => setDisp(x => ({ ...x, price: num(e.target.value) }))} /><label htmlFor="ds-p">Ціна з ПДВ, ₴</label></div>
              <div className="tf"><input id="ds-v" placeholder=" " inputMode="decimal" onChange={e => setDisp(x => ({ ...x, vat: num(e.target.value) }))} /><label htmlFor="ds-v">ПДВ, ₴</label><div className="support">0, якщо компанія не платник ПДВ</div></div>
            </>}
          </div>
          <Lines lines={dLines} />
          {dIssues.length > 0 && <div className="body-s" style={{ color: 'var(--md-error)' }}>{dIssues.join('. ')}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-outlined sl" disabled={dIssues.length > 0 || dirty} onClick={dispose}>{disp.how === 'sale' ? 'Провести продаж' : 'Списати об’єкт'}</button></div>
        </div>}
        {saved.log.length > 0 && <div><div className="title-s" style={{ marginBottom: 8 }}>Проведено в Сальдо</div>
          {saved.log.map((e, k) => <div key={k} style={{ marginBottom: 12 }}><div className="body-s muted" style={{ marginBottom: 4 }}>{ymLabel(e.ym)} · {e.t}</div><Lines lines={e.lines} /></div>)}</div>}
        {saved.wearStart ? <div className="body-s muted">Знос до початку обліку в Сальдо: {fmt(saved.wearStart)} ₴ (перенесено з 1С).</div> : null}
      </div>
      <div className="sheet-foot">
        {st === 'draft' && <button className="btn btn-text sl" onClick={remove}>Видалити</button>}
        <span style={{ flex: 1 }} />
        {st !== 'disposed' && <button className="btn btn-outlined sl" disabled={!dirty} onClick={() => save()}><Ms>save</Ms>Зберегти</button>}
        {st === 'draft' && <button className="btn btn-filled sl" disabled={!canCommission(d)} onClick={commission}><Ms>check</Ms>Ввести в експлуатацію</button>}
      </div>
    </>
  );
}
