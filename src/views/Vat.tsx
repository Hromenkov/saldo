import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { cx, fmt, fmt0, Ms } from '../lib';
import { StatCard } from './Overview';
import { canMove, deadlineState, declarationDraft, ERPN_LABEL, seaLimit, topUpNeeded, type ErpnStatus, type InboundPn } from '../vat/rules';
import { ISSUED, RECEIVED, SEA, VAT_PERIOD, VAT_TODAY, type IssuedDoc } from '../vat/demo';

const dm = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7);
const CHIP: Record<ErpnStatus, [string, string]> = {
  draft: ['st-mute', 'edit_note'], sent: ['st-new', 'schedule_send'], registered: ['st-ok', 'done_all'],
  blocked: ['st-err', 'block'], explained: ['st-check', 'forum'], rejected: ['st-err', 'gpp_bad'], cancelled: ['st-mute', 'close']
};
const ErpnChip = ({ st }: { st: ErpnStatus }) => <span className={'status ' + CHIP[st][0]}><Ms>{CHIP[st][1]}</Ms>{ERPN_LABEL[st]}</span>;

type Tab = 'out' | 'in' | 'sea' | 'decl';

export function Vat() {
  const { snack } = useApp();
  const [tab, setTab] = useState<Tab>('out');
  const [issued, setIssued] = useState<IssuedDoc[]>(ISSUED);
  const [received, setReceived] = useState<InboundPn[]>(RECEIVED);

  const limit = seaLimit(SEA);
  // ліміт потрібен лише для ПН і РК на збільшення, які реєструє продавець
  const pending = issued.filter(d => d.registrant === 'seller' && d.vat > 0 && (d.status === 'draft' || d.status === 'sent'));
  const pendingVat = pending.reduce((s, d) => s + d.vat, 0);
  const need = topUpNeeded(limit, pendingVat);
  const decl = useMemo(() => declarationDraft({ issued, received, carry: 0, period: VAT_PERIOD }), [issued, received]);
  const overdue = issued.filter(d => deadlineState(d, VAT_TODAY).overdue).length;
  const blocked = received.filter(d => d.status === 'blocked');

  const send = (d: IssuedDoc) => {
    if (!canMove(d.status, 'sent')) return;
    if (d.registrant === 'seller' && d.vat > limit) { snack(`Ліміту СЕА не вистачає: поповніть електронний рахунок на ${fmt(d.vat - limit)} ₴`); return; }
    setIssued(a => a.map(x => x === d ? { ...x, status: 'sent' } : x));
    snack(`${d.kind === 'pn' ? 'ПН' : 'РК до ПН'} № ${d.no} підписано КЕП і надіслано в ЄРПН`);
  };
  const explain = (pn: InboundPn) => {
    setReceived(a => a.map(x => x === pn ? { ...x, status: 'explained' } : x));
    snack(`Постачальнику ${pn.seller} надіслано запит: пояснення і копії документів для розблокування ПН № ${pn.no}`);
  };
  const tabs: [Tab, string, number | ''][] = [['out', 'Видані ПН і РК', issued.length], ['in', 'Отримані ПН', received.length], ['sea', 'Електронний рахунок', ''], ['decl', 'Декларація', '']];

  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">ПДВ</h1><span className="spacer" /><span className="body-m muted">Листопад 2026 · ЄРПН на {dm(VAT_TODAY)}</span></div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <StatCard ic="account_balance" t="Ліміт реєстрації СЕА" v={fmt0(limit) + ' ₴'} d={need ? <span className="neg">не вистачає {fmt(need)} ₴</span> : 'вистачає на всі ПН до реєстрації'} />
        <StatCard ic="receipt" t="Чекають реєстрації" v={String(pending.length)} d={`ПДВ ${fmt(pendingVat)} ₴${overdue ? ` · прострочено ${overdue}` : ''}`} />
        <StatCard ic="block" t="Зупинені вхідні ПН" v={String(blocked.length)} d={blocked.length ? `ПК ${fmt(blocked.reduce((s, x) => s + x.vat, 0))} ₴ лишається на 6441` : 'немає'} />
        <StatCard ic="payments" t="До сплати за декларацією" v={fmt0(decl.toPay) + ' ₴'} d="чернетка · ряд. 18" />
      </div>
      <div className="m-tabs" role="tablist">{tabs.map(([k, l, n]) => (
        <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} {n !== '' && <span className="muted">{n}</span>}</button>
      ))}</div>

      {tab === 'out' && <>
        <div className="table-wrap"><table className="dt">
          <thead><tr><th>Документ</th><th>Покупець</th><th>Перша подія</th><th className="r">База, ₴</th><th className="r">ПДВ, ₴</th><th>Реєструвати до</th><th>ЄРПН</th><th></th></tr></thead>
          <tbody>{issued.map((d, i) => {
            const st = deadlineState(d, VAT_TODAY);
            return <tr key={i}>
              <td><div className="doc"><Ms>{d.kind === 'pn' ? 'receipt' : 'difference'}</Ms><div><div className="title-s">{d.kind === 'pn' ? 'ПН' : 'РК до ПН'} № {d.no}</div><div className="body-s muted">{d.contractId}{d.reasonCode ? ' · неплатник, тип причини 02' : ''}</div></div></div></td>
              <td>{d.buyer}</td>
              <td><div className="num">{dm(d.date)}</div><div className="body-s muted">{d.eventDoc}</div></td>
              <td className="r">{fmt(d.base)}</td><td className={cx('r', d.vat < 0 && 'neg')}>{fmt(d.vat)}</td>
              <td><div className="num" style={st.overdue ? { color: 'var(--md-error)' } : undefined}>{dm(st.due)}</div><div className="body-s muted">{d.registrant === 'buyer' ? 'реєструє покупець' : st.overdue ? `прострочено ${-st.left} дн.` : d.status === 'registered' ? '' : `лишилось ${st.left} дн.`}</div></td>
              <td><ErpnChip st={d.status} /></td>
              <td className="r">{d.status === 'draft' && <button className="btn btn-filled sl" onClick={() => send(d)}><Ms>draw</Ms>{d.registrant === 'buyer' ? 'Надіслати покупцю' : 'Підписати і надіслати'}</button>}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <p className="body-s muted" style={{ marginTop: 12 }}>ПН складається на дату першої події: оплати або відвантаження (п. 187.1 ПКУ). Аванс дає ПН одразу, відвантаження в рахунок авансу нової ПН не потребує. Повернення авансу або товару дає РК на зменшення; якщо покупець платник ПДВ, РК реєструє він.</p>
      </>}

      {tab === 'in' && <>
        {blocked.length > 0 && <div className="banner"><Ms>warning</Ms><div className="txt"><div className="title-s">Реєстрацію {blocked.length} ПН зупинено</div><div className="body-s">Податковий кредит за ними не включається в декларацію, поки ПН не зареєструють. Постачальник подає пояснення і копії документів.</div></div></div>}
        <div className="table-wrap"><table className="dt">
          <thead><tr><th>ПН</th><th>Постачальник</th><th>Дата</th><th className="r">ПДВ, ₴</th><th>Проводка</th><th>ЄРПН</th><th></th></tr></thead>
          <tbody>{received.map(pn => (
            <tr key={pn.no}>
              <td><div className="doc"><Ms>receipt</Ms><div><div className="title-s">ПН № {pn.no}</div><div className="body-s muted">{pn.doc}</div></div></div></td>
              <td>{pn.seller}</td><td className="num">{dm(pn.date)}</td><td className="r">{fmt(pn.vat)}</td>
              <td className="acc">{pn.status === 'registered' ? 'Дт 6442 · Кт 6441' : <span className="muted">лишається на 6441</span>}</td>
              <td><ErpnChip st={pn.status} /></td>
              <td className="r">{pn.status === 'blocked' && <button className="btn btn-tonal sl" onClick={() => explain(pn)}><Ms>forum</Ms>Запросити пояснення</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </>}

      {tab === 'sea' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,420px),1fr))' }}>
        <div className="m-card card-outlined">
          <div className="title-m">Ліміт реєстрації ПН (п. 200-1.3 ПКУ)</div>
          <table className="dt compact" style={{ marginTop: 8 }}><tbody>
            {([['+', 'Отримані зареєстровані ПН і РК', SEA.received], ['+', 'ПДВ, сплачений на митниці', SEA.customs], ['+', 'Поповнення з поточного рахунку', SEA.topUps], ['+', 'Овердрафт (середній сплачений ПДВ за 12 міс.)', SEA.overdraft],
              ['−', 'Видані зареєстровані ПН і РК', SEA.issued], ['−', 'Заявлене бюджетне відшкодування', SEA.refundClaimed], ['−', 'Перевищення зобов’язань над виданими ПН', SEA.excess]] as const).map(([sg, t, v]) =>
              <tr key={t}><td className="muted" style={{ width: 24 }}>{sg}</td><td>{t}</td><td className="r">{fmt(v)}</td></tr>)}
            <tr><td></td><td className="title-s">Ліміт</td><td className="r title-s">{fmt(limit)}</td></tr>
          </tbody></table>
        </div>
        <div className="m-card card-outlined">
          <div className="title-m">Електронний рахунок ПДВ · субрахунок 315</div>
          <div className="body-m" style={{ margin: '8px 0 12px' }}>Залишок коштів: <b>{fmt(SEA.balance)} ₴</b>. ПДВ до бюджету сплачується лише з цього рахунку, напряму з поточного не можна.</div>
          <ul className="body-s" style={{ margin: 0, paddingLeft: 18, lineHeight: '22px' }}>
            <li>Поповнення: Дт 315 · Кт 311</li>
            <li>Списання за декларацією: Дт 6412 · Кт 315</li>
            <li>Повернення надлишку: Дт 311 · Кт 315</li>
          </ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-filled sl" onClick={() => snack(need ? `Платіжку на поповнення СЕА ПДВ на ${fmt(need)} ₴ підготовлено, проводка Дт 315 Кт 311` : 'Ліміту вистачає, поповнення не потрібне')}><Ms>add_card</Ms>Поповнити на {fmt(need)} ₴</button>
            <button className="btn btn-outlined sl" onClick={() => snack('Запит витягу з СЕА ПДВ надіслано до Електронного кабінету')}><Ms>sync</Ms>Оновити з кабінету</button>
          </div>
        </div>
      </div>}

      {tab === 'decl' && <>
        {decl.notes.map(n => <div key={n} className="banner"><Ms>info</Ms><div className="txt body-s">{n}</div></div>)}
        <div className="table-wrap"><table className="dt">
          <thead><tr><th>Рядок</th><th>Показник</th><th className="r">Обсяг без ПДВ, ₴</th><th className="r">ПДВ, ₴</th></tr></thead>
          <tbody>{decl.rows.map(r => (
            <tr key={r.row}><td className="title-s num">{r.row}</td><td className={cx(['9', '17', '18', '19'].includes(r.row) && 'title-s')}>{r.t}</td>
              <td className="r">{r.base !== undefined ? fmt(r.base) : ''}</td><td className="r">{fmt(r.vat)}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="body-s muted" style={{ marginTop: 12 }}>Чернетка за ПН і РК листопада. Зобов’язання беруться за датою першої події, кредит лише з зареєстрованих вхідних ПН. Перед поданням бухгалтер звіряє з додатками і формою, що діє на дату подання.</p>
      </>}
    </div>
  );
}
