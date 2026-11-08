import { checkLines } from '../../recognize/chart';
import { OPS } from '../../data';
import { useApp } from '../../store';
import { ModeChip, Ms } from '../../lib';

export function OpSheet({ i }: { i: number }) {
  const { snack, closeSheet } = useApp();
  const o = OPS[i];
  return (
    <>
      <div className="sheet-head"><h2 className="title-l">{o[1]}</h2><button className="icon-btn sl" aria-label="Закрити" onClick={closeSheet}><Ms>close</Ms></button></div>
      <div className="sheet-body">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><ModeChip mode={o[5]} /><span className="status st-mute">{o[0]}</span></div>
        <div className="form-grid">
          <div className="tf full"><input id="op-doc" placeholder=" " defaultValue={o[2]} /><label htmlFor="op-doc">Документ</label></div>
          <div className="tf full"><input id="op-an" placeholder=" " defaultValue={o[4]} /><label htmlFor="op-an">Управлінська аналітика</label></div>
        </div>
        <div><div className="title-s" style={{ marginBottom: 8 }}>Шаблон проводок</div>
          <div className="posting"><table><thead><tr><th>Дт</th><th>Кт</th><th>Зміст</th></tr></thead><tbody>{o[3].map((l, j) => <tr key={j}><td>{l[0]}</td><td>{l[1]}</td><td className="body-s muted">{l[2]}</td></tr>)}</tbody></table></div></div>
        <div><div className="title-s" style={{ marginBottom: 10 }}>Перевірки перед проведенням</div>
          <ul className="checks body-m">
            {(() => { const iss = checkLines(o[3].map(l => [l[0], l[1]] as [string, string])); return <li><Ms style={iss.length ? { color: 'var(--md-error)' } : undefined}>{iss.length ? 'error' : 'check_circle'}</Ms>{iss.length ? iss.map(x => x.t).join('; ') : 'Рахунки є в плані рахунків, кореспонденція відповідає Інструкції 291'}</li>; })()}
            <li><Ms>check_circle</Ms>Сума проводок дорівнює сумі документа</li>
            {(o[1].includes('техкарт') || o[1].includes('ПРРО')) && <li><Ms>check_circle</Ms>Кількість списання = техкарта × продажі за зміну</li>}
            {o[3].some(l => l.some(x => x.startsWith('644') || x === '6412')) && <li><Ms>check_circle</Ms>ПДВ звірено з ЄРПН</li>}
            {o[5] === 'confirm' && <li><Ms>check_circle</Ms>Потрібне підтвердження відповідальної особи</li>}
          </ul></div>
        <div className="m-card card-filled"><div className="title-s">Тест шаблону</div><div className="body-s muted" style={{ marginTop: 4 }}>Еталонний приклад, перевірений бухгалтером-методологом: документ на вході дає саме ці проводки.</div><div style={{ marginTop: 10 }}><span className="status st-ok"><Ms>check</Ms>Пройдено</span></div></div>
      </div>
      <div className="sheet-foot"><button className="btn btn-text sl" onClick={closeSheet}>Закрити</button><button className="btn btn-filled sl" onClick={() => snack('Шаблон збережено. Нова версія діятиме з наступного документа')}><Ms>save</Ms>Зберегти</button></div>
    </>
  );
}
