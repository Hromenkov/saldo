import { BIZ, OPS } from '../data';
import { useApp } from '../store';
import { ModeChip, Ms } from '../lib';
import { StatCard } from './Overview';

export function Ops() {
  const { s, upd, snack, openSheet } = useApp();
  const b = s.biz ? s.biz.b : BIZ[0];
  const groups = [...new Set(OPS.map(o => o[0]))];
  const auto = OPS.filter(o => o[5] === 'auto').length;
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Типові операції</h1><span className="spacer" />
        <button className="chip sl" aria-pressed="true" onClick={() => upd(d => { d.onbOpen = true; })}><Ms>{b.ic}</Ms>{b.t}</button>
        <button className="btn btn-outlined sl" onClick={() => snack('Нову операцію буде створено з відповіді на питання в черзі')}><Ms>add</Ms>Нова операція</button></div>
      {b.k !== 'cafe' && <div className="banner"><Ms>info</Ms><div className="txt body-m">У прототипі показано каталог кав’ярні. Каталоги інших типів бізнесу будуються так само.</div></div>}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard ic="library_books" t="У каталозі" v={String(b.ops)} d={`операцій для типу «${b.t}»`} />
        <StatCard ic="bolt" t="Проводяться самі" v={Math.round(auto / OPS.length * 100) + '%'} d="без участі людини" />
        <StatCard ic="rule" t="З підтвердженням" v={String(OPS.length - auto)} d="втрати, повернення, інвентаризація" />
        <StatCard ic="verified" t="Перевірка" v="100%" d="кореспонденцій за Інструкцією 291" />
      </div>
      {groups.map(g => (
        <div className="ops-group" key={g}><div className="section-title" style={{ marginTop: 0 }}><span className="title-m">{g}</span></div>
          <div className="table-wrap"><table className="dt">
            <thead><tr><th style={{ width: '22%' }}>Операція</th><th style={{ width: '22%' }}>Документ</th><th>Проводки</th><th>Управлінська аналітика</th><th>Режим</th></tr></thead>
            <tbody>{OPS.map((o, i) => [o, i] as const).filter(([o]) => o[0] === g).map(([o, i]) => (
              <tr key={i} data-op={i} onClick={() => openSheet({ kind: 'op', i })}>
                <td className="title-s">{o[1]}</td><td className="muted">{o[2]}</td>
                <td className="op-lines">{o[3].map((l, j) => <span key={j}>{j > 0 && <br />}Дт {l[0]} · Кт {l[1]}</span>)}</td>
                <td className="muted">{o[4]}</td><td><ModeChip mode={o[5]} /></td></tr>
            ))}</tbody>
          </table></div></div>
      ))}
    </div>
  );
}
