import { STRUCT, type StructItem } from '../data';
import { useApp } from '../store';
import { Ms } from '../lib';

const StStatus = ({ x }: { x: StructItem }) => x.st === 'planned'
  ? <span className="status st-check"><Ms>schedule</Ms>Заплановано</span>
  : x.st === 'closed'
    ? <span className="status st-mute"><Ms>history</Ms>Закрито</span>
    : <span className="status st-ok"><Ms>check</Ms>Діє</span>;

const RULES = [
  'Кожна зміна має дату набуття чинності й документ-підставу',
  'Нічого не видаляється: об’єкт закривається датою, історія зберігається',
  'Звіт за будь-який період бере стан структури на ту дату',
  'Закриті бухгалтерські періоди не змінюються. Зміна заднім числом проводиться коригуванням у поточному періоді',
  'Управлінку можна перерахувати за минулі періоди: нові статті, напрями й точки видно в історії',
  'Ставки податків і правила оновлюються з дати зміни законодавства'
];

export function Structure() {
  const { s, upd, snack, openDialog } = useApp();
  const f = s.structTab;
  const groups = ['Усі', ...new Set(STRUCT.map(x => x.g))];
  const list = STRUCT.filter(x => f === 'Усі' || x.g === f);
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Структура і зміни</h1><span className="spacer" />
        <button className="btn btn-outlined sl" onClick={() => snack('Показано стан структури на 01.01.2026')}><Ms>history</Ms>Стан на дату</button>
        <button className="btn btn-filled sl" onClick={() => openDialog({ kind: 'plan' })}><Ms>add</Ms>Запланувати зміну</button></div>
      <div className="m-tabs" role="tablist">{groups.map(g => <button key={g} className="tab" role="tab" aria-selected={f === g} onClick={() => upd(d => { d.structTab = g; })}>{g}</button>)}</div>
      <div className="struct-grid">
        <div className="table-wrap"><table className="dt">
          <thead><tr><th>Об’єкт</th><th>Що діє</th><th>Діє з</th><th>Діє до</th><th>Стан</th></tr></thead>
          <tbody>{list.map(x => (
            <tr key={x.n}><td><div className="doc"><Ms>{x.ic}</Ms><div><div className="title-s">{x.n}</div><div className="body-s muted">{x.g}</div></div></div></td>
              <td className="muted">{x.d}</td><td className="num">{x.from}</td><td className="num">{x.to || <span className="muted">—</span>}</td><td><StStatus x={x} /></td></tr>
          ))}</tbody>
        </table></div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="m-card card-outlined" style={{ padding: '8px 0' }}>
            <div className="section-title" style={{ margin: '8px 16px' }}><span className="title-m">Історія змін</span></div>
            <ul className="list">{s.history.map(([ic, d, t, sub], i) => (
              <li className="li" key={i}><span className={'lead ' + (ic === 'event_upcoming' ? 'yellow' : 'blue')}><Ms>{ic}</Ms></span><span className="txt"><div className="title-s">{t}</div><div className="s body-s">{d} · {sub}</div></span></li>
            ))}</ul>
          </div>
          <div className="m-card card-filled">
            <div className="title-m" style={{ marginBottom: 10 }}>Як Сальдо працює зі змінами</div>
            <ul className="checks body-m">{RULES.map(r => <li key={r}><Ms>check_circle</Ms>{r}</li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}
