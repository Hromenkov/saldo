import { useEffect, useMemo, useRef, useState } from 'react';
import { ACCOUNTS } from '../recognize/accounts';
import { recognizeFile } from '../recognize/client';
import { saveRule } from '../recognize/rules';
import { blocking } from '../recognize/checks';
import { partyKey, rememberParty } from '../recognize/suppliers';
import { addCompany, ourCompanies } from '../recognize/companies';
import { checkLines, fitsKind } from '../recognize/chart';
import { basisChain, cashFlowArticle, CF_ARTICLES } from '../recognize/basis';
import { allocate, balances, movements, reconciliation, withAdvances } from '../recognize/settlements';
import { activeItems, bindItem, catalog, matchItem, mergeFromBas } from '../recognize/nomenclature';
import { import1c, is1cFile, type Imported } from '../import1c';
import { getStock, receiveFromDoc, removeMovement } from '../stock/store';
import { CHANGE_TYPES, OPS, type Doc } from '../data';
import { useApp } from '../store';
import { AssetSheet } from '../views/Assets';
import { cx, fmt, ModeChip, Ms, plural, StatusChip } from '../lib';

const stocked = (acc: string) => ['201', '281', '22'].includes(acc.split(' ')[0]);

function DocSheet({ id }: { id: number }) {
  const { s, upd, snack, closeSheet, openSheet, openDialog } = useApp();
  const [cfSel, setCfSel] = useState<string>();
  const [pick, setPick] = useState<Record<number, string>>({});
  const [accSel, setAccSel] = useState<string>();
  const [stockLoc, setStockLoc] = useState(() => getStock().locations[0]?.id || '');
  // після «Відхилити» документа вже немає в списку, але панель ще виїжджає: показуємо останній стан
  const last = useRef<Doc | undefined>(undefined);
  const d = s.docs.find(x => x.id === id) || last.current;
  last.current = d;
  const cat = useMemo(() => catalog(), [d?.id]);
  const pk = partyKey(d?.edrpou, d?.cp);
  const auto = useMemo(() => (d?.items || []).map(it => it.nom ? undefined : matchItem(pk, it.name, cat)), [d?.id, cat]);
  if (!d) return null;
  // підсвічуються лише ключові поля, в яких є реальний сумнів (читання розійшлися, арифметика, контрольна сума)
  const block = d.st === 'ok' ? [] : blocking(d.checks);
  const warnOf = (f: string) => block.find(c => c.field === f);
  // номенклатура: лише для товарної накладної кожен рядок має стати позицією нашого довідника
  const goods = d.kind === 'purchase_goods' && !!d.items?.length;
  const choiceOf = (i: number) => pick[i] ?? (d.items![i].nom ? 'done' : auto[i]?.id ?? '');
  const unbound = goods && d.st !== 'ok' ? d.items!.filter((_, i) => !choiceOf(i)).length : 0;
  const needs = !!warnOf('acc');
  const net = d.sum - (d.kind === 'pn' ? 0 : d.vat);
  const accNow = accSel ?? d.acc;
  // зміна рахунку в картці одразу переписує проводки: старий номер рахунку замінюється новим
  const oldN = d.acc?.split(' ')[0], newN = accNow?.split(' ')[0];
  const baseLines: Doc['lines'] = oldN && newN && oldN !== newN ? d.lines.map(l => [l[0] === oldN ? newN : l[0], l[1] === oldN ? newN : l[1], l[2], l[3]]) : d.lines;
  // взаєморозрахунки: аванси цього контрагента зараховуються при проведенні накладної чи акта
  const party = { cp: d.cp, edrpou: d.edrpou };
  const isPrimaryDoc = d.lines.some(l => l[1] === '631' || l[0] === '361');
  const movsOther = isPrimaryDoc ? movements(party, s.docs.filter(x => x.id !== d.id), s.bank) : [];
  const balOther = balances(movsOther);
  const lines: Doc['lines'] = isPrimaryDoc && d.st !== 'ok' ? withAdvances({ ...d, lines: baseLines }, balOther) : baseLines;
  const alloc = isPrimaryDoc ? (() => { const a = allocate(movements(party, s.docs, s.bank)); return [...a.supplier, ...a.customer].find(x => x.docId === d.id); })() : undefined;
  const lineIssues = checkLines(lines);
  // грошові документи: підстава і стаття руху коштів перераховуються від обраного рахунку
  const money = /^(cash|payment)_/.test(d.kind);
  const chain = money ? basisChain({ ...d, acc: accNow }, s.docs) : [];
  const cfAuto = money ? cashFlowArticle(d.kind, accNow) : undefined;
  const cfNow = cfSel ?? (accSel === undefined && d.cf ? d.cf : cfAuto);
  const fit = ACCOUNTS.filter(a => fitsKind(d.kind, a));
  const accs: string[] = d.acc && !(fit as readonly string[]).includes(d.acc) ? [d.acc, ...fit] : [...fit];
  const codeCheck = d.checks?.find(c => /ЄДРПОУ|ІПН|Код контрагента/.test(c.t));
  const post = () => {
    const prev = d.st;
    const acc = accNow;
    // виправлення в картці зберігаються в документі; контрагент запам’ятовується в довіднику
    const val = (fid: string) => (document.getElementById(fid) as HTMLInputElement | null)?.value.trim() ?? '';
    const num = (v: string) => { const n = Number(v.replace(/\s|\u00a0/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
    const cpNew = val('f-cp') || d.cp, noNew = val('f-no') || d.no;
    const dm = val('f-date').match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
    const dateNew = dm ? `${dm[1].padStart(2, '0')}.${dm[2].padStart(2, '0')}` : d.date, yNew = dm?.[3] || d.y;
    const netIn = num(val('f-net')), vatIn = num(val('f-vat'));
    const vatNew = Number.isNaN(vatIn) ? d.vat : vatIn;
    const sumNew = Number.isNaN(netIn) ? d.sum : (money || d.kind === 'pn' ? netIn : Math.round((netIn + vatNew) * 100) / 100);
    const netNew = sumNew - (money || d.kind === 'pn' ? 0 : vatNew);
    // якщо суму виправлено, у проводках замінюються саме ті суми, що були прочитані (без ПДВ, ПДВ, всього)
    const fix = (x: number) => Math.abs(x - net) < 0.005 ? netNew : Math.abs(x - d.vat) < 0.005 && d.vat ? vatNew : Math.abs(x - d.sum) < 0.005 ? sumNew : x;
    const linesNew: Doc['lines'] = sumNew !== d.sum || vatNew !== d.vat ? lines.map(l => [l[0], l[1], fix(l[2]), l[3]]) : lines;
    if (d.checks && cpNew && cpNew !== 'Контрагент не визначений') rememberParty(cpNew, d.edrpou, d.cpRead);
    const pkNew = partyKey(d.edrpou, cpNew);
    // підтверджений рахунок стає правилом для цього контрагента
    if (pkNew && acc && d.checks) saveRule(pkNew, acc, d.kind);
    // прив'язки рядків постачальника до нашого довідника запам'ятовуються для наступних накладних
    const ids = goods ? d.items!.map((it, i) => {
      const c = choiceOf(i);
      if (c === 'done') return catalog().find(x => x.name === it.nom)?.id || '';
      return bindItem(pkNew, it.name, c, it.unit);
    }) : [];
    const noms = ids.map(nid => catalog().find(x => x.id === nid)?.name);
    // товари надходять на склад партією за ціною без ПДВ; рахунки 152–154 склад не веде
    const toStock = goods && acc && stocked(acc);
    if (toStock) {
      const [dd, mm] = dateNew.split('.');
      const r = receiveFromDoc(d.id, `${d.type} № ${noNew}, ${cpNew}`, `${yNew || '2026'}-${mm}-${dd}`, stockLoc, acc!, d.items!.map((it, i) => ({ item: ids[i], qty: it.qty, price: it.price, amount: it.amount })));
      if (r.error) { snack(r.error); return; }
    }
    upd(x => { const dd = x.docs.find(y => y.id === id); if (dd) { dd.st = 'ok'; dd.lines = linesNew; dd.cp = cpNew; dd.no = noNew; dd.date = dateNew; dd.y = yNew; dd.sum = sumNew; dd.vat = vatNew; if (acc) dd.acc = acc; if (money) dd.cf = cfNow; if (goods) dd.items!.forEach((it, i) => { it.nom = noms[i]; }); } });
    closeSheet();
    snack(`${d.type} № ${noNew} ${lines.length ? 'проведено' : 'збережено'}` + (toStock ? `, товар надійшов на «${getStock().locations.find(l => l.id === stockLoc)?.name}»` : ''), () => {
      // скасувати надходження не можна, якщо з нього вже списали: тоді документ лишається проведеним
      const e = toStock ? removeMovement('doc' + d.id) : null;
      if (e) { snack(e); return; }
      upd(x => { const dd = x.docs.find(y => y.id === id); if (dd) Object.assign(dd, { ...d, st: prev }); });
    });
  };
  const reject = () => {
    const i = s.docs.findIndex(x => x.id === id);
    upd(x => { x.docs.splice(i, 1); });
    closeSheet();
    snack('Документ відхилено', () => upd(x => { x.docs.splice(i, 0, d); }));
  };
  return (
    <>
      <div className="sheet-head"><h2 className="title-l">{d.type} № {d.no}</h2><button className="icon-btn sl" aria-label="Закрити" onClick={closeSheet}><Ms>close</Ms></button></div>
      <div className="sheet-body">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><StatusChip st={d.st} /><span className="status st-mute"><Ms>{d.src === 'Telegram' ? 'send' : d.src === 'Email' ? 'mail' : 'cloud_download'}</Ms>{d.src}</span></div>
        <div className="preview" aria-hidden="true">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{d.cp}</b><span className="num">{d.date}.{d.y || '2026'}</span></div>
          {[70, 45, 85, 60].map(w => <div key={w} className="pl" style={{ width: w + '%' }} />)}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}><span>Разом з ПДВ</span><b className="num">{fmt(d.sum)} ₴</b></div>
        </div>
        <div className="conf body-s"><span>Впевненість розпізнавання</span><span className="bar"><span style={{ width: d.conf + '%' }} /></span><span className="num">{d.conf}%</span></div>
        <div className="form-grid">
          <div className={cx('tf full', warnOf('cp') && 'warn')}><input id="f-cp" placeholder=" " defaultValue={d.cp} disabled={d.st === 'ok'} /><label htmlFor="f-cp">Контрагент</label><Ms className="trail-ic">{warnOf('cp') ? 'error' : 'verified'}</Ms><div className="support">{warnOf('cp')?.t || d.checks?.find(c => c.ok && /^Контрагент із довідника/.test(c.t))?.t || (d.checks ? (codeCheck?.t || (d.edrpou ? '' : 'Без коду, за назвою')) : 'ЄДРПОУ перевірено в ЄДР')}</div></div>
          <div className={cx('tf', warnOf('no') && 'warn')}><input id="f-no" placeholder=" " defaultValue={d.no} disabled={d.st === 'ok'} /><label htmlFor="f-no">Номер</label>{warnOf('no') && <div className="support">{warnOf('no')!.t}</div>}</div>
          <div className={cx('tf', warnOf('date') && 'warn')}><input id="f-date" placeholder=" " defaultValue={d.date + '.' + (d.y || '2026')} disabled={d.st === 'ok'} /><label htmlFor="f-date">Дата</label><Ms className="trail-ic">calendar_today</Ms>{warnOf('date') && <div className="support">{warnOf('date')!.t}</div>}</div>
          <div className={cx('tf', warnOf('sum') && 'warn')}><input id="f-net" placeholder=" " defaultValue={fmt(net)} disabled={d.st === 'ok'} /><label htmlFor="f-net">{/^(cash|payment)_/.test(d.kind) ? 'Сума, ₴' : 'Сума без ПДВ, ₴'}</label>{warnOf('sum') && <div className="support">{warnOf('sum')!.t}</div>}</div>
          <div className={cx('tf', warnOf('sum') && 'warn')}><input id="f-vat" placeholder=" " defaultValue={fmt(d.vat)} disabled={d.st === 'ok'} /><label htmlFor="f-vat">ПДВ, ₴</label></div>
          {/* документам без проводок (рахунок, заявка, ТТН, ПН, чек) рахунок обліку не потрібен */}
          {(d.lines.length > 0 || money) && <div className={cx('tf full', needs && 'warn')}>
            <select id="f-acc" value={accNow ?? accs[0]} disabled={d.st === 'ok' || !d.lines.length} onChange={e => setAccSel(e.target.value)}>{accs.map(o => <option key={o}>{o}</option>)}</select>
            <label htmlFor="f-acc">{/^(cash|payment)_/.test(d.kind) ? 'Кореспондуючий рахунок' : 'Рахунок витрат або доходу'}</label><Ms className="trail-ic">arrow_drop_down</Ms>
            {needs && <div className="support">{warnOf('acc')!.t}</div>}
          </div>}
          {goods && accNow && stocked(accNow) && <div className="tf full">
            <select id="f-loc" value={stockLoc} disabled={d.st === 'ok'} onChange={e => setStockLoc(e.target.value)}>{getStock().locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            <label htmlFor="f-loc">Склад надходження</label><Ms className="trail-ic">arrow_drop_down</Ms>
          </div>}
        </div>
        {money && <div>
          <div className="title-s" style={{ marginBottom: 8 }}>Підстава платежу</div>
          {chain.length ? <ul className="checks body-m">{chain.map((st, i) => <li key={i}>
            <Ms style={st.ok && !st.note ? undefined : { color: 'var(--md-error)' }}>{st.ok && !st.note ? 'check_circle' : 'error'}</Ms>
            <span><b>{st.label}:</b> {st.docId ? <a href="#" style={{ color: 'var(--md-primary)' }} onClick={e => { e.preventDefault(); openSheet({ kind: 'doc', id: st.docId! }); }}>{st.text}</a> : st.text}
              {st.note && <div className="body-s" style={{ color: 'var(--md-error)' }}>{st.note}</div>}</span></li>)}</ul>
            : <div className="body-s muted">Для цього рахунку підстава не потрібна</div>}
          <div className="tf full" style={{ marginTop: 20 }}>
            <select id="f-cf" value={cfNow} disabled={d.st === 'ok'} onChange={e => setCfSel(e.target.value)}>{CF_ARTICLES.map(o => <option key={o}>{o}</option>)}</select>
            <label htmlFor="f-cf">Стаття руху грошових коштів</label><Ms className="trail-ic">arrow_drop_down</Ms>
            {cfSel && cfSel !== cfAuto && <div className="support">За рахунком {accNow?.split(' ')[0]} стаття: {cfAuto}</div>}
          </div>
        </div>}
        {isPrimaryDoc && <div>
          <div className="title-s" style={{ marginBottom: 8 }}>Розрахунки з контрагентом</div>
          <ul className="checks body-m">
            {alloc ? <li><Ms style={alloc.rest > 0 ? { color: 'var(--md-error)' } : undefined}>{alloc.rest > 0 ? 'schedule' : 'check_circle'}</Ms>
              <span>{alloc.rest > 0 ? `Сплачено ${fmt(alloc.paid)} з ${fmt(alloc.total)} ₴, залишок ${fmt(alloc.rest)} ₴` : `Сплачено повністю, ${fmt(alloc.total)} ₴`}
                {alloc.payments.map((p, i) => <div key={i} className="body-s muted">{p.title}: {fmt(p.amount)} ₴</div>)}</span></li>
              : <li><Ms>info</Ms><span>Оплати розподіляться на документ після проведення</span></li>}
            {d.st !== 'ok' && lines.some(l => l[3].startsWith('Залік')) && <li><Ms>sync_alt</Ms><span>Є аванс цього контрагента: у проводки додано залік{lines.some(l => l[1] === '643') ? ', ПДВ на покриту авансом частину вже нараховано першою подією (643)' : ''}</span></li>}
          </ul>
          <button className="btn btn-text sl" style={{ marginTop: 4 }} onClick={() => openDialog({ kind: 'act', cp: d.cp, edrpou: d.edrpou })}><Ms>fact_check</Ms>Акт звірки з {d.cp}</button>
        </div>}
        {d.items && d.items.length > 0 && <div>
          <div className="title-s" style={{ marginBottom: 8 }}>Номенклатура</div>
          <div className="posting" style={{ overflowX: 'auto' }}><table><thead><tr><th>Як у постачальника</th>{goods && <th>Позиція нашого довідника</th>}<th className="r">К-сть</th><th>Од.</th><th className="r">Ціна, ₴</th><th className="r">Сума, ₴</th></tr></thead>
            <tbody>{d.items.map((it, i) => {
              const c = choiceOf(i), a = auto[i];
              return <tr key={i}><td>{it.name}</td>
                {goods && <td style={{ minWidth: 190 }}>{c === 'done' || d.st === 'ok' ? <span>{it.nom}</span> : <>
                  <select className="nom-sel" aria-label={`Позиція довідника для «${it.name}»`} value={c} onChange={e => { const v = e.target.value; setPick(p => ({ ...p, [i]: v })); }}>
                    <option value="">Оберіть позицію…</option>
                    {activeItems(cat).map(o => <option key={o.id} value={o.id}>{o.name}, {o.unit}</option>)}
                    <option value="new">+ Нова позиція: {it.name}</option>
                  </select>
                  <div className="body-s" style={{ marginTop: 2, color: !c ? 'var(--md-error)' : undefined }}>{!c ? 'Немає в довіднику' : pick[i] !== undefined ? (c === 'new' ? 'Буде додано до довідника' : 'Обрано вручну') : a?.how === 'map' ? 'За збереженою прив’язкою' : a?.how === 'other' ? 'Так само прив’язано в іншого постачальника' : 'Схожа назва: перевірте'}</div>
                </>}</td>}
                <td className="r">{it.qty ?? '—'}</td><td>{it.unit ?? ''}</td><td className="r">{it.price != null ? fmt(it.price) : '—'}</td><td className="r">{it.amount != null ? fmt(it.amount) : '—'}</td></tr>;
            })}</tbody></table></div>
          {unbound > 0 && <div className="body-s" style={{ marginTop: 6, color: 'var(--md-error)' }}>{unbound} {plural(unbound, 'позицію', 'позиції', 'позицій')} не прив’язано до довідника. Без цього на складі з’являться дублікати</div>}
        </div>}
        {lines.length > 0 && <div>
          <div className="title-s" style={{ marginBottom: 8 }}>Запропоновані проводки</div>
          <div className="posting"><table><thead><tr><th>Дт</th><th>Кт</th><th className="r">Сума, ₴</th><th>Зміст</th></tr></thead>
            <tbody>{lines.map((l, i) => <tr key={i}><td>{l[0]}</td><td>{l[1]}</td><td className="r">{fmt(l[2])}</td><td className="body-s muted">{l[3]}</td></tr>)}</tbody></table></div>
          {lineIssues.length > 0 && <div className="body-s" style={{ marginTop: 6, color: 'var(--md-error)' }}>{lineIssues.map(x => x.t).join('. ')}. Провести не можна</div>}
        </div>}
        {d.checks && <div>
          {block.length > 0 && <><div className="title-s" style={{ marginBottom: 10 }}>Потрібна ваша увага</div>
            <ul className="checks body-m">{block.map((c, i) => <li key={i}><Ms style={{ color: 'var(--md-error)' }}>error</Ms>{c.t}</li>)}</ul></>}
          {block.length === 0 && d.st !== 'ok' && <div className="body-m" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ms>task_alt</Ms>Сумнівів немає: перевіряти нічого не треба, натисніть «Підтвердити»</div>}
          {d.checks.some(c => c.ok || c.info) && <details style={{ marginTop: 10 }}><summary className="body-s muted" style={{ cursor: 'pointer' }}>Що перевірила система ({d.checks.filter(c => c.ok || c.info).length})</summary>
            <ul className="checks body-s" style={{ marginTop: 8 }}>{d.checks.filter(c => c.ok || c.info).map((c, i) => <li key={i}><Ms className="muted">{c.ok ? 'check_circle' : 'info'}</Ms>{c.t}</li>)}</ul></details>}
          {d.st !== 'ok' && d.checks.filter(c => c.addCompany).map(c => <div key={c.addCompany} className="body-m" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <Ms className="muted">domain_add</Ms><span>Покупець — {c.addCompany}.</span>
            <button className="btn btn-text sl" onClick={() => { addCompany(c.addCompany!); upd(x => { const dd = x.docs.find(y => y.id === id); if (dd?.checks) dd.checks = dd.checks.filter(k => k.addCompany !== c.addCompany); }); snack(`${c.addCompany} додано до ваших компаній`); }}><Ms>add</Ms>Додати як нашу компанію</button></div>)}
          {d.note && <div className="body-s muted" style={{ marginTop: 10 }}>{d.note}</div>}</div>}
        <div><div className="title-s" style={{ marginBottom: 8 }}>Коментар</div>
          <textarea className="body-m" rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid var(--md-outline-variant)', background: 'transparent', color: 'inherit', font: 'inherit', resize: 'vertical' }}
            placeholder="Приписки з полів документа або ваша примітка. На облік не впливає"
            value={d.comment || ''} onChange={e => { const v = e.target.value; upd(x => { const dd = x.docs.find(y => y.id === id); if (dd) dd.comment = v; }); }} />
          {d.comment?.includes('?') && <div className="body-s muted" style={{ marginTop: 4 }}>«?» — слово чи цифра прочитані неточно, перевірте за оригіналом</div>}</div>
      </div>
      <div className="sheet-foot">
        <button className="btn btn-text sl" onClick={reject}>Відхилити</button>
        <button className="btn btn-filled sl" disabled={d.st === 'ok' || unbound > 0 || lineIssues.length > 0} onClick={post}><Ms>check</Ms>{d.st === 'ok' ? (lines.length ? 'Проведено' : 'Збережено') : 'Підтвердити'}</button>
      </div>
    </>
  );
}

function OpSheet({ i }: { i: number }) {
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
        <div className="card card-filled"><div className="title-s">Тест шаблону</div><div className="body-s muted" style={{ marginTop: 4 }}>Еталонний приклад, перевірений бухгалтером-методологом: документ на вході дає саме ці проводки.</div><div style={{ marginTop: 10 }}><span className="status st-ok"><Ms>check</Ms>Пройдено</span></div></div>
      </div>
      <div className="sheet-foot"><button className="btn btn-text sl" onClick={closeSheet}>Закрити</button><button className="btn btn-filled sl" onClick={() => snack('Шаблон збережено. Нова версія діятиме з наступного документа')}><Ms>save</Ms>Зберегти</button></div>
    </>
  );
}

const Tf = ({ id, label, children, ic }: { id: string; label: string; children: React.ReactNode; ic?: string }) =>
  <div className="tf">{children}<label htmlFor={id}>{label}</label>{ic && <Ms className="trail-ic">{ic}</Ms>}</div>;

function SignDialog({ name, per }: { name: string; per: string }) {
  const { upd, snack, hideDialog } = useApp();
  const sign = () => {
    upd(d => { const r = d.reports.find(x => x.name === name && x.st === 'ready'); if (r) r.st = 'sent'; });
    hideDialog(); snack('Звіт підписано і надіслано. Квитанцію збережено');
  };
  return (
    <>
      <Ms className="d-ic">draw</Ms>
      <h2 className="headline-s">Підписати і надіслати</h2>
      <p className="body-m muted" style={{ margin: 0, textAlign: 'center' }}>{name} · {per}. Звіт буде підписано вашим КЕП і надіслано до ДПС.</p>
      <Tf id="k-type" label="Тип ключа" ic="arrow_drop_down"><select id="k-type"><option>Дія.Підпис</option><option>Файловий ключ</option><option>Хмарний ключ (SmartID, Вчасно.КЕП)</option></select></Tf>
      <Tf id="k-who" label="Підписант" ic="arrow_drop_down"><select id="k-who"><option>Андрій Петренко, директор</option><option>Олена Бондар, головний бухгалтер</option></select></Tf>
      <div className="actions"><button className="btn btn-text sl" onClick={hideDialog}>Скасувати</button><button className="btn btn-text sl" onClick={sign}>Підписати</button></div>
    </>
  );
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Невідома помилка');

function UploadDialog() {
  const { s, upd, go, snack, hideDialog, openSheet } = useApp();

  const apply1c = (name: string, r: Imported) => {
    if (r.kind === 'bank') {
      upd(x => { x.bank.unshift(...r.rows); });
      go('bank');
      return `Виписка ${r.account || name}: ${r.rows.length} ${plural(r.rows.length, 'операцію', 'операції', 'операцій')} додано в «Банк»`;
    }
    if (r.kind === 'docs') {
      const out: string[] = [];
      if (r.docs.length) {
        const base = Date.now();
        upd(x => { x.docs.unshift(...r.docs.map((d, i) => ({ ...d, id: base + i }))); });
        go('docs');
        out.push(`З 1С імпортовано ${r.docs.length} ${plural(r.docs.length, 'документ', 'документи', 'документів')}`);
      }
      if (r.items.length) {
        const m = mergeFromBas(r.items);
        out.push(`Номенклатура з BAS: ${m.added} нових, ${m.updated} оновлено, нічого не видалено`);
      }
      return out.join('. ');
    }
    upd(x => { x.ledger = r.rows; x.ledgerSrc = name + (r.period ? ', ' + r.period : ''); });
    return `ОСВ імпортовано: ${r.rows.length} ${plural(r.rows.length, 'рахунок', 'рахунки', 'рахунків')}. Дивіться «Оборотно-сальдова» в режимі бухгалтера`;
  };

  const handle = async (list: FileList | null) => {
    const files = Array.from(list || []); if (!files.length) return;
    hideDialog();
    const msgs: string[] = [];
    for (const f of files.filter(is1cFile)) {
      try { msgs.push(apply1c(f.name, await import1c(f))); } catch (e) { msgs.push(`${f.name}: ${errText(e)}`); }
    }
    const rec = files.filter(f => !is1cFile(f));
    if (rec.length) {
      snack(`Розпізнаю ${rec.length} ${plural(rec.length, 'файл', 'файли', 'файлів')}. Це займе до хвилини`);
      const base = Date.now() + 1000;
      const res = await Promise.allSettled(rec.map((f, i) => recognizeFile(f, ourCompanies(), s.docs, base + i)));
      const done = res.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []));
      if (done.length) { upd(x => { x.docs.unshift(...done); }); go('docs'); }
      res.forEach(r => { if (r.status === 'rejected') msgs.push(errText(r.reason)); });
      if (done.length) {
        const check = done.filter(d => d.st === 'check').length;
        msgs.unshift(`Розпізнано ${done.length} ${plural(done.length, 'документ', 'документи', 'документів')}` + (check ? `, ${check} ${plural(check, 'потребує', 'потребують', 'потребують')} перевірки` : ', усі перевірки пройдено'));
      }
      if (done.length === 1) openSheet({ kind: 'doc', id: done[0].id });
    }
    if (msgs.length) snack(msgs.join(' · '));
  };

  return (
    <>
      <Ms className="d-ic">upload_file</Ms>
      <h2 className="headline-s">Завантажити документи</h2>
      <p className="body-m muted" style={{ margin: 0, textAlign: 'center' }}>PDF або фото: система сама розпізнає тип документа і запропонує проводки. Також вивантаження з 1С/BAS: EnterpriseData (XML), виписка клієнт-банку (TXT), ОСВ (Excel).</p>
      <label className="card card-outlined" style={{ borderStyle: 'dashed', textAlign: 'center', padding: 28, cursor: 'pointer', display: 'block' }}
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handle(e.dataTransfer.files); }}>
        <Ms style={{ fontSize: 40, color: 'var(--md-primary)' }}>cloud_upload</Ms>
        <div className="title-s" style={{ marginTop: 8 }}>Перетягніть файли сюди</div><div className="body-s muted">або натисніть, щоб вибрати</div>
        <input type="file" id="fileIn" multiple hidden accept=".pdf,image/*,.xml,.txt,.xlsx,.csv" onChange={e => { handle(e.target.files); e.target.value = ''; }} />
      </label>
      <div className="body-s muted" style={{ textAlign: 'center' }}>Також можна надсилати на docs@saldo.ua або в Telegram-бот</div>
      <div className="actions"><button className="btn btn-text sl" onClick={hideDialog}>Закрити</button></div>
    </>
  );
}

function PlanDialog() {
  const { upd, snack, hideDialog } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const save = () => {
    const v = (id: string) => (ref.current!.querySelector<HTMLInputElement>('#' + id)!.value || '').trim();
    const type = v('ch-type'), date = v('ch-date') || '01.12.2026', doc = v('ch-doc'), obj = v('ch-obj');
    const recalc = ref.current!.querySelector<HTMLInputElement>('#ch-recalc')!.checked;
    upd(d => { d.history.unshift(['event_upcoming', date, type + (obj ? ': ' + obj : ''), (doc || 'Без документа') + ' · заплановано' + (recalc ? ' · з перерахунком управлінки' : '')]); });
    hideDialog(); snack(`Зміну заплановано з ${date}. Система нагадає за тиждень`);
  };
  return (
    <div style={{ display: 'contents' }} ref={ref}>
      <Ms className="d-ic">edit_calendar</Ms>
      <h2 className="headline-s">Запланувати зміну</h2>
      <p className="body-m muted" style={{ margin: 0, textAlign: 'center' }}>Зміна набуде чинності з указаної дати. Попередні періоди лишаться такими, як були.</p>
      <Tf id="ch-type" label="Що змінюється" ic="arrow_drop_down"><select id="ch-type">{CHANGE_TYPES.map(t => <option key={t}>{t}</option>)}</select></Tf>
      <div className="form-grid">
        <Tf id="ch-date" label="Діє з" ic="calendar_today"><input id="ch-date" placeholder=" " defaultValue="01.12.2026" /></Tf>
        <Tf id="ch-doc" label="Документ-підстава"><input id="ch-doc" placeholder=" " defaultValue="Наказ №42" /></Tf>
      </div>
      <Tf id="ch-obj" label="Об’єкт або опис зміни"><input id="ch-obj" placeholder=" " defaultValue="" /></Tf>
      <div className="set-row" style={{ padding: 0, minHeight: 56 }}><span className="txt"><div className="title-s">Перерахувати управлінку за минулі періоди</div><div className="body-s muted">Бухгалтерський облік закритих періодів не зміниться</div></span><label className="switch"><input type="checkbox" id="ch-recalc" aria-label="Перерахувати управлінку" /><span className="track" /><span className="thumb" /></label></div>
      <div className="actions"><button className="btn btn-text sl" onClick={hideDialog}>Скасувати</button><button className="btn btn-text sl" onClick={save}>Запланувати</button></div>
    </div>
  );
}

function ActDialog({ cp, edrpou }: { cp: string; edrpou?: string }) {
  const { s, hideDialog } = useApp();
  const movs = movements({ cp, edrpou }, s.docs, s.bank);
  const act = reconciliation(movs);
  const b = balances(movs);
  return (
    <>
      <Ms className="d-ic">fact_check</Ms>
      <h2 className="headline-s">Акт звірки: {cp}</h2>
      <div className="posting" style={{ maxHeight: 340, overflow: 'auto' }}><table><thead><tr><th>Дата</th><th>Документ</th><th className="r">Дебет, ₴</th><th className="r">Кредит, ₴</th></tr></thead>
        <tbody>{act.rows.map((r, i) => <tr key={i}><td>{r.date}</td><td className="body-s">{r.title}</td><td className="r">{r.debit ? fmt(r.debit) : ''}</td><td className="r">{r.credit ? fmt(r.credit) : ''}</td></tr>)}
          <tr><td /><td><b>Обороти</b></td><td className="r"><b>{fmt(act.debit)}</b></td><td className="r"><b>{fmt(act.credit)}</b></td></tr></tbody></table></div>
      <p className="body-m" style={{ margin: 0 }}>{act.balance > 0 ? `${cp} винен нам ${fmt(act.balance)} ₴` : act.balance < 0 ? `Ми винні ${cp} ${fmt(-act.balance)} ₴` : 'Заборгованості немає'}
        {(b.advGiven > 0 || b.advGot > 0) && <span className="muted">{b.advGiven > 0 ? `, з них аванс виданий ${fmt(b.advGiven)} ₴` : ''}{b.advGot > 0 ? `, з них аванс отриманий ${fmt(b.advGot)} ₴` : ''}</span>}</p>
      <div className="actions"><button className="btn btn-text sl" onClick={() => window.print()}>Друкувати</button><button className="btn btn-text sl" onClick={hideDialog}>Закрити</button></div>
    </>
  );
}

export function Overlays() {
  const { s, closeSheet, hideDialog, snackState, closeSnack } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { closeSheet(); hideDialog(); } };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [closeSheet, hideDialog]);
  const dl = s.dialog;
  return (
    <>
      <div className={cx('scrim', (s.sheetOpen || s.drawerOpen) && 'open')} id="scrim" onClick={closeSheet} />
      <aside className={cx('sheet', s.sheetOpen && 'open')} id="sheet" aria-label="Документ">
        {s.sheet?.kind === 'doc' && <DocSheet key={s.overlaySeq} id={s.sheet.id} />}
        {s.sheet?.kind === 'op' && <OpSheet key={s.overlaySeq} i={s.sheet.i} />}
        {s.sheet?.kind === 'asset' && <AssetSheet key={s.overlaySeq} id={s.sheet.id} />}
      </aside>
      <div className={cx('scrim', s.dialogOpen && 'open')} id="dlgScrim" onClick={hideDialog} />
      <div className="dialog-wrap"><div className={cx('dialog', s.dialogOpen && 'open')} id="dialog" role="dialog" aria-modal="true">
        {dl?.kind === 'sign' && <SignDialog key={s.overlaySeq} name={dl.name} per={dl.per} />}
        {dl?.kind === 'upload' && <UploadDialog key={s.overlaySeq} />}
        {dl?.kind === 'plan' && <PlanDialog key={s.overlaySeq} />}
        {dl?.kind === 'act' && <ActDialog key={s.overlaySeq} cp={dl.cp} edrpou={dl.edrpou} />}
      </div></div>
      <div className={cx('snack', snackState.open && 'open')} id="snack" role="status">
        <span id="snackTxt">{snackState.text}</span>
        <button className="btn btn-text sl" id="snackUndo" hidden={!snackState.undo} onClick={() => closeSnack(true)}>Скасувати</button>
      </div>
    </>
  );
}
