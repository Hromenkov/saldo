import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { asOf, audit, AREA_LABEL, money, type Area } from '../audit';
import { cx, Ms, plural } from '../lib';
import { StatCard } from './Overview';


export function Audit() {
  const { s, openSheet, go } = useApp();
  const r = useMemo(() => audit(s.docs, s.bank, { today: asOf() }), [s.docs, s.bank]);
  const [area, setArea] = useState<Area | 'all'>('all');
  const areas = [...new Set(r.findings.map(f => f.area))];
  const list = r.findings.filter(f => area === 'all' || f.area === area);
  const docOf = (id?: number) => s.docs.find(d => d.id === id);

  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Аудит до копійки</h1><span className="spacer" />
        <span className="body-m muted">Кожен документ і кожна оплата перевіряються одразу після внесення</span></div>
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard ic="fact_check" t="Перевірено документів" v={String(r.checked)} d={`${r.clean} без зауважень`} />
        <StatCard ic="error" t="Помилки" v={String(r.errors)} d={r.errors ? 'треба виправити' : 'не знайдено'} />
        <StatCard ic="help" t="Підозри" v={String(r.warns)} d={r.warns ? 'треба подивитися' : 'не знайдено'} />
        <StatCard ic="payments" t="Розбіжність" v={money(r.atStake) + ' ₴'} d="сума помилок і дублікатів" />
      </div>
      {r.findings.length > 0 && <div className="chips" style={{ marginBottom: 12 }}>
        {(['all', ...areas] as const).map(a => (
          <button key={a} className="chip sl" aria-pressed={area === a} onClick={() => setArea(a)}>
            {area === a && <Ms>check</Ms>}{a === 'all' ? 'Усі' : AREA_LABEL[a]} <span className="muted">{a === 'all' ? r.findings.length : r.findings.filter(f => f.area === a).length}</span>
          </button>
        ))}
      </div>}
      {list.length ? (
        <div className="card card-outlined" style={{ padding: '8px 0' }}>
          <ul className="list">{list.map((f, i) => {
            const d = docOf(f.docId);
            return (
              <li className="li" key={i}>
                <span className={cx('lead', f.sev === 'error' ? 'red' : 'yellow')}><Ms>{f.sev === 'error' ? 'error' : 'help'}</Ms></span>
                <span className="txt"><div className="title-s">{f.t}</div>
                  <div className="s body-s">{AREA_LABEL[f.area]}{d ? ` · ${d.type} № ${d.no}, ${d.cp}` : ''}{f.diff ? ` · ${money(f.diff)} ₴` : ''}</div></span>
                <span className="trail">
                  {d ? <button className="btn btn-text sl" onClick={() => openSheet({ kind: 'doc', id: d.id })}>Документ</button>
                    : f.bankIdx != null ? <button className="btn btn-text sl" onClick={() => go('bank')}>Банк</button> : null}
                </span>
              </li>
            );
          })}</ul>
        </div>
      ) : (
        <div className="empty"><Ms>verified</Ms><div className="title-l" style={{ marginTop: 12, color: 'var(--md-on-surface)' }}>Помилок не знайдено</div>
          <div className="body-m">{r.checked} {plural(r.checked, 'документ', 'документи', 'документів')} перевірено до копійки.</div></div>
      )}
      <p className="body-s muted" style={{ marginTop: 12 }}>
        Що перевіряється: кількість × ціна в кожному рядку, сума рядків, ПДВ за ставкою (на документ або порядково), підсумок, проводки проти документа,
        план рахунків, ЄДРПОУ та ІПН за контрольною сумою, дата і закритий період, дублікати (у тому числі між фото і вивантаженням з 1С), оплати проти документів.
      </p>
    </div>
  );
}
