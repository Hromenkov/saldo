import { useApp } from '../store';
import { asOf, money } from '../audit';
import { pulse, type Debt } from '../audit/pulse';
import { cx, fmt0, Ms, plural } from '../lib';

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];

function usePulse() {
  const { s } = useApp();
  const [mName, yStr] = s.period.toLowerCase().split(' ');
  const month = MONTHS.indexOf(mName) + 1 || 11, year = Number(yStr) || 2026;
  return { mName, year, p: pulse(s.docs, s.bank, month, year, { today: asOf() }) };
}

/** «Пульс» власника: свіжість обліку і головні цифри місяця, порахані з документів і банку прямо зараз. */
export function Pulse({ more = false }: { more?: boolean }) {
  const { s, go } = useApp();
  const { mName, year, p } = usePulse();
  const fresh = p.lagDays <= 2;
  const lagWhy = p.oldest && s.questions.length ? `чекає вашої відповіді: ${p.oldest.cp}, ${p.oldest.date}` : '';
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
        {more && <button className="btn btn-text sl" onClick={() => go('pulse')}>Детальніше</button>}
      </div>
      <div className="grid g4">
        {tile('schedule', 'Свіжість обліку', fresh ? 'сьогодні' : `${p.lagDays} ${plural(p.lagDays, 'день', 'дні', 'днів')}`,
          lagWhy || (p.waiting ? `${p.waiting} ${plural(p.waiting, 'документ чекає', 'документи чекають', 'документів чекають')} проведення` : `усі ${p.docs} документів проведено`),
          fresh ? 'green' : 'yellow', () => go(lagWhy ? 'questions' : 'docs'))}
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

function DebtList({ title, rows, empty }: { title: string; rows: Debt[]; empty: string }) {
  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}><span className="title-m">{title}</span><span className="body-s muted">{fmt0(rows.reduce((a, r) => a + r.sum, 0))} ₴</span></div>
      <div className="card card-outlined" style={{ padding: '8px 0' }}><ul className="list">
        {rows.length ? rows.map(r => (
          <li className="li" key={r.cp}><span className="lead"><Ms>storefront</Ms></span>
            <span className="txt"><div className="title-s">{r.cp}</div><div className="s body-s">за документами і банком</div></span>
            <span className="trail title-s">{fmt0(r.sum)} ₴</span></li>
        )) : <li className="li"><span className="lead green"><Ms>check</Ms></span><span className="txt"><div className="title-s">{empty}</div></span></li>}
      </ul></div>
    </div>
  );
}

/** Окрема сторінка «Пульс»: управлінка власника з поясненням, звідки цифри. */
export function PulsePage() {
  const { s, go } = useApp();
  const { p } = usePulse();
  const margin = p.revenue ? Math.round((p.revenue - p.costs) / p.revenue * 100) : 0;
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Пульс бізнесу</h1><span className="spacer" /><span className="status st-mute">демо · ТОВ «Приклад», кав’ярня</span></div>
      <p className="body-m muted" style={{ margin: '-4px 0 16px', maxWidth: 760 }}>
        Управлінка без окремого фінансиста і без таблиць: цифри рахуються з тих самих документів і банку, що й бухоблік, щойно документ проведено.
        Не треба чекати кінця місяця чи питати бухгалтера.
      </p>
      {s.questions.length > 0 && p.lagDays > 2 && (
        <div className="banner"><span className="ms fill">contact_support</span>
          <div className="txt"><div className="title-s">Облік відстає на {p.lagDays} {plural(p.lagDays, 'день', 'дні', 'днів')}, бо чекає на вас</div>
            <div className="body-m">{s.questions.length} {plural(s.questions.length, 'питання', 'питання', 'питань')} без відповіді. Відповісте, і цифри нижче оновляться самі.</div></div>
          <button className="btn btn-filled sl" onClick={() => go('questions')}>Відповісти</button>
        </div>
      )}
      <Pulse />
      <div className="grid g2" style={{ marginTop: 12 }}>
        <DebtList title="Хто нам винен" rows={p.debtors} empty="Усі покупці розрахувалися" />
        <DebtList title="Кому винні ми" rows={p.creditors} empty="Постачальникам нічого не винні" />
      </div>
      <div className="section-title"><span className="title-m">Що кажуть цифри</span></div>
      <div className="card card-outlined" style={{ padding: '8px 0' }}><ul className="list">
          <li className="li"><span className="lead blue"><Ms>trending_up</Ms></span><span className="txt"><div className="title-s">Валова маржа {margin}%</div>
            <div className="s body-s">доходи {fmt0(p.revenue)} ₴ проти витрат {fmt0(p.costs)} ₴ за проведеними документами, без ПДВ</div></span></li>
          <li className="li"><span className={cx('lead', p.cashIn < p.cashOut ? 'yellow' : 'green')}><Ms>swap_vert</Ms></span><span className="txt">
            <div className="title-s">{p.cashIn < p.cashOut ? `Грошей пішло більше, ніж прийшло: ${fmt0(p.cashOut - p.cashIn)} ₴` : `Грошей прийшло більше, ніж пішло: ${fmt0(p.cashIn - p.cashOut)} ₴`}</div>
            <div className="s body-s">{p.revenue > p.costs && p.cashIn < p.cashOut ? `прибуток є, але ${fmt0(p.theyOwe)} ₴ ще в боргах покупців: касовий розрив видно заздалегідь` : 'рух грошей по банку за місяць'}</div></span></li>
          <li className="li"><span className="lead"><Ms>verified</Ms></span><span className="txt"><div className="title-s">Цифри збігаються з бухобліком</div>
            <div className="s body-s">одна база для управлінки і звітності: аудит перевіряє кожен документ до копійки, тому не буває «у бухгалтера одне, у таблиці інше»</div></span>
            <span className="trail"><button className="btn btn-text sl" onClick={() => go('audit')}>Аудит</button></span></li>
      </ul></div>
    </div>
  );
}
