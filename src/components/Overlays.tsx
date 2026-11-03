import { useEffect, useMemo, useRef, useState } from 'react';
import { ACCOUNTS } from '../recognize/accounts';
import { recognizeFile } from '../recognize/client';
import { saveRule } from '../recognize/rules';
import { activeItems, bindItem, catalog, matchItem, mergeFromBas } from '../recognize/nomenclature';
import { import1c, is1cFile, type Imported } from '../import1c';
import { CHANGE_TYPES, OPS, type Doc } from '../data';
import { useApp } from '../store';
import { cx, fmt, ModeChip, Ms, plural, StatusChip } from '../lib';

function DocSheet({ id }: { id: number }) {
  const { s, upd, snack, closeSheet } = useApp();
  const accRef = useRef<HTMLSelectElement>(null);
  const [pick, setPick] = useState<Record<number, string>>({});
  // після «Відхилити» документа вже немає в списку, але панель ще виїжджає: показуємо останній стан
  const last = useRef<Doc | undefined>(undefined);
  const d = s.docs.find(x => x.id === id) || last.current;
  last.current = d;
  const cat = useMemo(() => catalog(), [d?.id]);
  const auto = useMemo(() => (d?.items || []).map(it => it.nom ? undefined : matchItem(d?.edrpou, it.name, cat)), [d?.id, cat]);
  if (!d) return null;
  // номенклатура: лише для товарної накладної кожен рядок має стати позицією нашого довідника
  const goods = d.kind === 'purchase_goods' && !!d.items?.length;
  const choiceOf = (i: number) => pick[i] ?? (d.items![i].nom ? 'done' : auto[i]?.id ?? '');
  const unbound = goods && d.st !== 'ok' ? d.items!.filter((_, i) => !choiceOf(i)).length : 0;
  const needs = d.st === 'check';
  const net = d.sum - (d.kind === 'pn' ? 0 : d.vat);
  const accs: string[] = d.acc && !(ACCOUNTS as readonly string[]).includes(d.acc) ? [d.acc, ...ACCOUNTS] : [...ACCOUNTS];
  const codeCheck = d.checks?.find(c => /ЄДРПОУ|ІПН|Код контрагента/.test(c.t));
  const post = () => {
    const prev = d.st;
    const acc = accRef.current?.value;
    // підтверджений рахунок стає правилом для цього контрагента
    if (d.edrpou && acc && d.checks) saveRule(d.edrpou, acc);
    // прив'язки рядків постачальника до нашого довідника запам'ятовуються для наступних накладних
    const noms = goods ? d.items!.map((it, i) => {
      const c = choiceOf(i);
      if (c === 'done') return it.nom;
      const nid = bindItem(d.edrpou, it.name, c, it.unit);
      return catalog().find(x => x.id === nid)?.name;
    }) : [];
    upd(x => { const dd = x.docs.find(y => y.id === id); if (dd) { dd.st = 'ok'; if (acc && d.checks) dd.acc = acc; if (goods) dd.items!.forEach((it, i) => { it.nom = noms[i]; }); } });
    closeSheet();
    snack(`${d.type} № ${d.no} проведено`, () => upd(x => { const dd = x.docs.find(y => y.id === id); if (dd) dd.st = prev; }));
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
          <div className="tf full"><input id="f-cp" placeholder=" " defaultValue={d.cp} /><label htmlFor="f-cp">Контрагент</label><Ms className="trail-ic">{codeCheck && !codeCheck.ok ? 'error' : 'verified'}</Ms><div className="support">{d.checks ? (codeCheck?.t || 'Код контрагента не знайдено') : 'ЄДРПОУ перевірено в ЄДР'}</div></div>
          <div className="tf"><input id="f-no" placeholder=" " defaultValue={d.no} /><label htmlFor="f-no">Номер</label></div>
          <div className="tf"><input id="f-date" placeholder=" " defaultValue={d.date + '.' + (d.y || '2026')} /><label htmlFor="f-date">Дата</label><Ms className="trail-ic">calendar_today</Ms></div>
          <div className="tf"><input id="f-net" placeholder=" " defaultValue={fmt(net)} /><label htmlFor="f-net">Сума без ПДВ, ₴</label></div>
          <div className="tf"><input id="f-vat" placeholder=" " defaultValue={fmt(d.vat)} /><label htmlFor="f-vat">ПДВ, ₴</label></div>
          <div className={cx('tf full', needs && 'warn')}>
            <select id="f-acc" ref={accRef} defaultValue={d.acc}>{accs.map(o => <option key={o}>{o}</option>)}</select>
            <label htmlFor="f-acc">Рахунок витрат або доходу</label><Ms className="trail-ic">arrow_drop_down</Ms>
            {needs && <div className="support">Система не впевнена: уточніть призначення</div>}
          </div>
        </div>
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
        {d.lines.length > 0 && <div>
          <div className="title-s" style={{ marginBottom: 8 }}>Запропоновані проводки</div>
          <div className="posting"><table><thead><tr><th>Дт</th><th>Кт</th><th className="r">Сума, ₴</th><th>Зміст</th></tr></thead>
            <tbody>{d.lines.map((l, i) => <tr key={i}><td>{l[0]}</td><td>{l[1]}</td><td className="r">{fmt(l[2])}</td><td className="body-s muted">{l[3]}</td></tr>)}</tbody></table></div>
        </div>}
        {d.checks && <div><div className="title-s" style={{ marginBottom: 10 }}>Перевірки</div>
          <ul className="checks body-m">{d.checks.map((c, i) => <li key={i}><Ms style={c.ok ? undefined : { color: 'var(--md-error)' }}>{c.ok ? 'check_circle' : 'error'}</Ms>{c.t}</li>)}</ul>
          {d.note && <div className="body-s muted" style={{ marginTop: 10 }}>{d.note}</div>}</div>}
      </div>
      <div className="sheet-foot">
        <button className="btn btn-text sl" onClick={reject}>Відхилити</button>
        <button className="btn btn-filled sl" disabled={d.st === 'ok' || unbound > 0} onClick={post}><Ms>check</Ms>{d.st === 'ok' ? 'Проведено' : d.lines.length ? 'Провести' : 'Зберегти без проводок'}</button>
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
            <li><Ms>check_circle</Ms>Кореспонденція рахунків відповідає Інструкції 291</li>
            <li><Ms>check_circle</Ms>Сума проводок дорівнює сумі документа</li>
            {(o[1].includes('техкарт') || o[1].includes('ПРРО')) && <li><Ms>check_circle</Ms>Кількість списання = техкарта × продажі за зміну</li>}
            {o[3].some(l => l.some(x => x.startsWith('644') || x === '641')) && <li><Ms>check_circle</Ms>ПДВ звірено з ЄРПН</li>}
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

const COMPANY = 'ТОВ «Приклад»';
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
      const res = await Promise.allSettled(rec.map((f, i) => recognizeFile(f, COMPANY, s.docs, base + i)));
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
      </aside>
      <div className={cx('scrim', s.dialogOpen && 'open')} id="dlgScrim" onClick={hideDialog} />
      <div className="dialog-wrap"><div className={cx('dialog', s.dialogOpen && 'open')} id="dialog" role="dialog" aria-modal="true">
        {dl?.kind === 'sign' && <SignDialog key={s.overlaySeq} name={dl.name} per={dl.per} />}
        {dl?.kind === 'upload' && <UploadDialog key={s.overlaySeq} />}
        {dl?.kind === 'plan' && <PlanDialog key={s.overlaySeq} />}
      </div></div>
      <div className={cx('snack', snackState.open && 'open')} id="snack" role="status">
        <span id="snackTxt">{snackState.text}</span>
        <button className="btn btn-text sl" id="snackUndo" hidden={!snackState.undo} onClick={() => closeSnack(true)}>Скасувати</button>
      </div>
    </>
  );
}
