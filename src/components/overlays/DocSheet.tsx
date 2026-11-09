import { useMemo, useRef, useState } from 'react';
import { ACCOUNTS } from '../../recognize/accounts';
import { saveRule } from '../../recognize/rules';
import { blocking } from '../../recognize/checks';
import { partyKey, rememberParty } from '../../recognize/suppliers';
import { addCompany } from '../../recognize/companies';
import { remember } from '../../recognize/registry';
import { checkLines, fitsKind } from '../../recognize/chart';
import { basisChain, cashFlowArticle, CF_ARTICLES } from '../../recognize/basis';
import { allocate, balances, movements, withAdvances } from '../../recognize/settlements';
import { activeItems, bindItem, catalog, matchItem } from '../../recognize/nomenclature';
import { getStock, receiveFromDoc, removeMovement } from '../../stock/store';
import { compare, forgetDoc, recordDoc, unitPrice, usePrices } from '../../recognize/prices';
import { type Doc } from '../../data';
import { useApp } from '../../store';
import { cx, fmt, Ms, plural, StatusChip } from '../../lib';

const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const stocked = (acc: string) => ['201', '281', '22'].includes(acc.split(' ')[0]);

export function DocSheet({ id }: { id: number }) {
  const { s, upd, snack, closeSheet, openSheet, openDialog } = useApp();
  const [cfSel, setCfSel] = useState<string>();
  const [pick, setPick] = useState<Record<number, string>>({});
  const [accSel, setAccSel] = useState<string>();
  const [stockLoc, setStockLoc] = useState(() => getStock().locations[0]?.id || '');
  const prices = usePrices();
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
  // дублікат не можна підтвердити: лише відкрити вже наявний документ або відхилити цей
  const dupOf = block.find(c => c.dupOf != null)?.dupOf;
  // номенклатура: лише для товарної накладної кожен рядок має стати позицією нашого довідника
  const goods = d.kind === 'purchase_goods' && !!d.items?.length;
  // позиції, якої ще немає в довіднику, за замовчуванням створюється з назви постачальника — без окремого вибору
  const choiceOf = (i: number) => pick[i] ?? (d.items![i].nom ? 'done' : auto[i]?.id ?? 'new');
  const unbound = goods && d.st !== 'ok' ? d.items!.filter((_, i) => !choiceOf(i)).length : 0;
  // ціни: кожен рядок порівнюється з попередніми закупівлями тієї самої позиції, скачок понад поріг підсвічується
  const isoDate = (dt: string, y?: string) => { const [dd, mm] = dt.split('.'); return `${y || '2026'}-${mm}-${dd}`; };
  const itemIdOf = (i: number) => { const c = d.st === 'ok' ? 'done' : choiceOf(i); return c === 'done' ? cat.find(x => x.name === d.items![i].nom)?.id : c && c !== 'new' ? c : undefined; };
  const cmp = goods ? d.items!.map((it, i) => {
    const item = itemIdOf(i), price = unitPrice(it);
    return item && price ? compare(prices.points, { item, party: pk, cp: d.cp, date: isoDate(d.date, d.y), price, docId: d.id }, prices.threshold) : undefined;
  }) : [];
  const jumps = cmp.map((c, i) => c?.jump ? i : -1).filter(i => i >= 0);
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
  const codeCheck = d.checks?.find(c => /^(ЄДРПОУ|ІПН|Код контрагента|Коду контрагента)/.test(c.t));
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
    if (goods) recordDoc(d.id, d.items!.map((it, i) => ({ item: ids[i], party: pkNew || 'cp:' + cpNew, cp: cpNew, date: isoDate(dateNew, yNew), price: unitPrice(it) ?? 0, qty: it.qty ?? 0, unit: it.unit ?? undefined, doc: `${d.type} № ${noNew}` })));
    if (toStock) {
      const [dd, mm] = dateNew.split('.');
      const r = receiveFromDoc(d.id, `${d.type} № ${noNew}, ${cpNew}`, `${yNew || '2026'}-${mm}-${dd}`, stockLoc, acc!, d.items!.map((it, i) => ({ item: ids[i], qty: it.qty, price: it.price, amount: it.amount })));
      if (r.error) { forgetDoc(d.id); snack(r.error); return; }
    }
    if (d.checks) remember({ ...d, cp: cpNew, no: noNew, date: dateNew, y: yNew, sum: sumNew, vat: vatNew });
    upd(x => { const dd = x.docs.find(y => y.id === id); if (dd) { dd.st = 'ok'; dd.lines = linesNew; dd.cp = cpNew; dd.no = noNew; dd.date = dateNew; dd.y = yNew; dd.sum = sumNew; dd.vat = vatNew; if (acc) dd.acc = acc; if (money) dd.cf = cfNow; if (goods) dd.items!.forEach((it, i) => { it.nom = noms[i]; }); } });
    closeSheet();
    snack(`${d.type} № ${noNew} ${lines.length ? 'проведено' : 'збережено'}` + (toStock ? `, товар надійшов на «${getStock().locations.find(l => l.id === stockLoc)?.name}»` : ''), () => {
      // скасувати надходження не можна, якщо з нього вже списали: тоді документ лишається проведеним
      const e = toStock ? removeMovement('doc' + d.id) : null;
      if (e) { snack(e); return; }
      if (goods) forgetDoc(d.id);
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
                  <div className="body-s" style={{ marginTop: 2, color: !c ? 'var(--md-error)' : undefined }}>{!c ? 'Немає в довіднику' : c === 'new' ? 'Нова позиція: буде створено з цієї назви' : pick[i] !== undefined ? 'Обрано вручну' : a?.how === 'map' ? 'З довідника: як у попередніх накладних' : a?.how === 'other' ? 'З довідника: так само прив’язано в іншого постачальника' : 'З довідника за схожою назвою'}</div>
                </>}</td>}
                <td className="r">{it.qty ?? '—'}</td><td>{it.unit ?? ''}</td><td className="r">{it.price != null ? fmt(it.price) : '—'}{cmp[i] && <div className={cx('body-s', !cmp[i]!.jump && 'muted')} style={{ whiteSpace: 'nowrap', color: cmp[i]!.jump ? 'var(--md-error)' : undefined }} title={`${cmp[i]!.ref.cp}, ${cmp[i]!.ref.doc} від ${dmy(cmp[i]!.ref.date)}: ${fmt(cmp[i]!.ref.price)} ₴`}>{cmp[i]!.pct > 0 ? '+' : ''}{cmp[i]!.pct.toLocaleString('uk-UA')} %</div>}</td><td className="r">{it.amount != null ? fmt(it.amount) : '—'}</td></tr>;
            })}</tbody></table></div>
          {jumps.length > 0 && <ul className="body-s" style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', color: 'var(--md-error)' }}>{jumps.map(i => { const c = cmp[i]!; return <li key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}><Ms style={{ fontSize: 18 }}>trending_up</Ms><span>
            {d.items![i].nom || catalog().find(x => x.id === itemIdOf(i))?.name || d.items![i].name}: +{c.pct.toLocaleString('uk-UA')} % {c.same ? 'до минулої поставки' : `до останньої закупівлі в ${c.ref.cp}`} ({fmt(c.ref.price)} ₴ від {dmy(c.ref.date)})
            {c.alt && <span className="muted">. У {c.alt.cp} {dmy(c.alt.date)} було {fmt(c.alt.price)} ₴</span>}</span></li>; })}</ul>}
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
            <ul className="checks body-m">{block.map((c, i) => <li key={i}><Ms style={{ color: 'var(--md-error)' }}>error</Ms><span>{c.t}
              {c.dupOf != null && s.docs.some(x => x.id === c.dupOf) && <div><a href="#" style={{ color: 'var(--md-primary)' }} onClick={e => { e.preventDefault(); openSheet({ kind: 'doc', id: c.dupOf! }); }}>Відкрити наявний документ</a> · цей можна відхилити</div>}</span></li>)}</ul></>}
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
        <button className="btn btn-filled sl" disabled={d.st === 'ok' || unbound > 0 || lineIssues.length > 0 || dupOf != null} onClick={post}><Ms>check</Ms>{d.st === 'ok' ? (lines.length ? 'Проведено' : 'Збережено') : 'Підтвердити'}</button>
      </div>
    </>
  );
}
