import { useApp } from '../store';
import { asOf, money } from '../audit';
import { pulse } from '../audit/pulse';
import { cx, fmt0, Ms, plural } from '../lib';

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];

/** «Пульс» власника: свіжість обліку і головні цифри місяця, порахані з документів і банку прямо зараз. */
export function Pulse() {
  const { s, go } = useApp();
  const [mName, yStr] = s.period.toLowerCase().split(' ');
  const month = MONTHS.indexOf(mName) + 1 || 11, year = Number(yStr) || 2026;
  const p = pulse(s.docs, s.bank, month, year, { today: asOf() });
  const fresh = p.lagDays <= 2;
  const tile = (ic: string, t: string, v: string, d: string, tone?: 'red' | 'yellow' | 'green', onClick?: () => void) => (
    <button className={cx('card card-outlined stat pulse-tile sl', tone && 'tone-' + tone)} onClick={onClick} disabled={!onClick} style={{ textAlign: 'left' }}>
      <div className="top"><Ms>{ic}</Ms><span className="title-s">{t}</span></div>
      <div className="v">{v}</div><div className="d body-s">{d}</div>
    </button>
  );
  return (
    <section aria-label="Пульс" style={{ marginBottom: 16 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        <span className="title-m">Пульс · {mName} {year}</span>
        <span className="body-s muted">{fresh ? 'облік актуальний' : `облік відстає на ${p.lagDays} ${plural(p.lagDays, 'день', 'дні', 'днів')}`}</span>
      </div>
      <div className="grid g4">
        {tile('schedule', 'Свіжість обліку', fresh ? 'сьогодні' : `${p.lagDays} ${plural(p.lagDays, 'день', 'дні', 'днів')}`,
          p.waiting ? `${p.waiting} ${plural(p.waiting, 'документ чекає', 'документи чекають', 'документів чекають')} проведення` : `усі ${p.docs} документів проведено`, fresh ? 'green' : 'yellow', () => go('docs'))}
        {tile('fact_check', 'Помилки аудиту', String(p.errors), p.errors ? `на ${money(p.atStake)} ₴` : 'усе зійшлося до копійки', p.errors ? 'red' : 'green', () => go('audit'))}
        {tile('trending_up', 'Доходи і витрати', `${fmt0(p.revenue - p.costs)} ₴`, `доходи ${fmt0(p.revenue)} − витрати ${fmt0(p.costs)}, без ПДВ`)}
        {tile('swap_vert', 'Рух грошей', `${fmt0(p.cashIn - p.cashOut)} ₴`, `надійшло ${fmt0(p.cashIn)}, сплачено ${fmt0(p.cashOut)}`, undefined, () => go('bank'))}
        {tile('call_received', 'Нам винні', `${fmt0(p.theyOwe)} ₴`, 'покупці, за документами й оплатами')}
        {tile('call_made', 'Ми винні', `${fmt0(p.weOwe)} ₴`, 'постачальникам')}
        {tile('output', 'Не в BAS', String(p.notInBas), p.notInBas ? 'проведено, але ще не вивантажено' : 'усе вивантажено', p.notInBas ? 'yellow' : 'green')}
        {tile('folder_open', 'Документи за місяць', String(p.docs), `проведено ${p.posted}, чекають ${p.waiting}`, undefined, () => go('docs'))}
      </div>
    </section>
  );
}
