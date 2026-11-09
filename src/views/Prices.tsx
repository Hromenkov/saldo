// Вкладка складу «Ціни постачальників»: динаміка закупівельних цін за позицією і постачальником, скачки понад поріг.
import { Fragment, useMemo, useState } from 'react';
import { lines, pct, setThreshold, usePrices, type Line, type PricePoint } from '../recognize/prices';
import { nameOf, unitOf } from '../stock/store';
import { fmt, Ms, plural } from '../lib';

const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const signed = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString('uk-UA') + ' %';

/** Маленький графік ціни: точки закупівель по даті, остання точка виділена. */
function Spark({ points, jump }: { points: PricePoint[]; jump: boolean }) {
  const W = 96, H = 28, pad = 3;
  if (points.length < 2) return <span className="muted body-s">одна закупівля</span>;
  const t = points.map(p => Date.parse(p.date)), v = points.map(p => p.price);
  const t0 = Math.min(...t), t1 = Math.max(...t), v0 = Math.min(...v), v1 = Math.max(...v);
  const x = (i: number) => pad + (t1 === t0 ? 0 : (t[i] - t0) / (t1 - t0)) * (W - 2 * pad);
  const y = (i: number) => H - pad - (v1 === v0 ? 0.5 : (v[i] - v0) / (v1 - v0)) * (H - 2 * pad);
  const c = jump ? 'var(--md-error)' : 'var(--md-primary)';
  const last = points.length - 1;
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ціна від ${fmt(v[0])} до ${fmt(v[last])} ₴`} style={{ display: 'block' }}>
    <polyline points={points.map((_, i) => `${x(i)},${y(i)}`).join(' ')} fill="none" stroke={c} strokeWidth={1.5} strokeLinejoin="round" />
    <circle cx={x(last)} cy={y(last)} r={2.5} fill={c} />
  </svg>;
}

export function Prices() {
  const pr = usePrices();
  const [only, setOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [th, setTh] = useState(String(pr.threshold));
  const all = useMemo(() => lines(pr.points, pr.threshold), [pr]);
  const rows = all.filter(l => !only || l.jump).sort((a, b) => Number(b.jump) - Number(a.jump) || nameOf(a.item).localeCompare(nameOf(b.item)) || a.cp.localeCompare(b.cp));
  const jumps = all.filter(l => l.jump).length;
  const key = (l: Line) => l.item + '|' + l.party;
  // найдешевша остання ціна цієї позиції в інших постачальників
  const best = (l: Line) => all.filter(o => o.item === l.item && o !== l && o.last.price < l.last.price).sort((a, b) => a.last.price - b.last.price)[0];
  const apply = () => { const n = Number(th.replace(',', '.')); if (Number.isFinite(n) && n > 0) setThreshold(n); else setTh(String(pr.threshold)); };
  return <>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <div className="chips">
        <button className="chip sl" aria-pressed={!only} onClick={() => setOnly(false)}>{!only && <Ms>check</Ms>}Усі позиції</button>
        <button className="chip sl" aria-pressed={only} onClick={() => setOnly(true)}>{only && <Ms>check</Ms>}Скачки ціни{jumps ? ` · ${jumps}` : ''}</button>
      </div>
      <span style={{ flex: 1 }} />
      <label className="body-s" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Підсвічувати зростання від
        <input inputMode="decimal" value={th} onChange={e => setTh(e.target.value)} onBlur={apply} onKeyDown={e => { if (e.key === 'Enter') apply(); }} aria-label="Поріг скачка ціни, відсотків"
          style={{ width: 56, font: 'inherit', textAlign: 'right', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-container-lowest)', color: 'var(--md-on-surface)' }} />%</label>
    </div>
    {rows.length ? <div className="table-wrap"><table className="dt">
      <thead><tr><th>Позиція</th><th>Постачальник</th><th className="r">Остання ціна, ₴</th><th className="r">Попередня, ₴</th><th className="r">Зміна</th><th>Динаміка</th><th className="r">Закупівель</th></tr></thead>
      <tbody>{rows.map(l => { const k = key(l), b = best(l); return <Fragment key={k}>
        <tr onClick={() => setOpen(open === k ? null : k)}>
          <td className="title-s">{l.jump && <Ms style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4, color: 'var(--md-error)' }}>trending_up</Ms>}{nameOf(l.item)}</td>
          <td>{l.cp}</td>
          <td className="r">{fmt(l.last.price)}<span className="muted body-s"> / {l.last.unit || unitOf(l.item)}</span><div className="body-s muted">{dmy(l.last.date)}</div></td>
          <td className="r">{l.prev ? <>{fmt(l.prev.price)}<div className="body-s muted">{dmy(l.prev.date)}</div></> : '—'}</td>
          <td className="r" style={{ color: l.jump ? 'var(--md-error)' : undefined, fontWeight: l.jump ? 600 : undefined }}>{l.pct != null ? signed(l.pct) : '—'}</td>
          <td><Spark points={l.points} jump={l.jump} /></td>
          <td className="r">{l.points.length}<Ms className="muted" style={{ fontSize: 18, verticalAlign: 'middle' }}>{open === k ? 'expand_less' : 'expand_more'}</Ms></td>
        </tr>
        {open === k && <>
          {[...l.points].reverse().map((p, i, arr) => <tr key={p.date + p.doc} className="body-s"><td className="muted" colSpan={2}>{dmy(p.date)} · {p.doc}</td>
            <td className="r muted">{fmt(p.price)}</td><td className="r muted">{p.qty ? `${p.qty.toLocaleString('uk-UA')} ${p.unit || unitOf(p.item)}` : ''}</td>
            <td className="r muted">{arr[i + 1] ? signed(pct(p.price, arr[i + 1].price)) : ''}</td><td colSpan={2} /></tr>)}
          {b && <tr className="body-s"><td colSpan={7} className="muted"><Ms style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>sell</Ms>У {b.cp} остання ціна {fmt(b.last.price)} ₴ ({dmy(b.last.date)}), на {Math.abs(pct(b.last.price, l.last.price)).toLocaleString('uk-UA')} % дешевше</td></tr>}
        </>}
      </Fragment>; })}</tbody>
    </table></div> : <div className="empty"><Ms>price_check</Ms><div className="body-m">{only ? `Скачків від ${pr.threshold} % немає` : 'Цін ще немає'}</div></div>}
    <p className="body-s muted" style={{ marginTop: 12 }}>Ціна за одиницю записується з кожної проведеної товарної накладної з прив’язаною номенклатурою. Скачок рахується до попередньої поставки цього ж постачальника; він підсвічується і тут, і в картці нової накладної ще до проведення. {jumps ? `Зараз ${jumps} ${plural(jumps, 'позиція подорожчала', 'позиції подорожчали', 'позицій подорожчали')} на ${pr.threshold} % і більше.` : ''}</p>
  </>;
}
