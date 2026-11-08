import { useRef } from 'react';
import { recognizeFile } from '../../recognize/client';
import { ourCompanies } from '../../recognize/companies';
import { withPosted } from '../../recognize/registry';
import { balances, movements, reconciliation } from '../../recognize/settlements';
import { mergeFromBas } from '../../recognize/nomenclature';
import { import1c, is1cFile, type Imported } from '../../import1c';
import { CHANGE_TYPES } from '../../data';
import { useApp } from '../../store';
import { fmt, Ms, plural } from '../../lib';

const Tf = ({ id, label, children, ic }: { id: string; label: string; children: React.ReactNode; ic?: string }) =>
  <div className="tf">{children}<label htmlFor={id}>{label}</label>{ic && <Ms className="trail-ic">{ic}</Ms>}</div>;

export function SignDialog({ name, per }: { name: string; per: string }) {
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

export function UploadDialog() {
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
      const res = await Promise.allSettled(rec.map((f, i) => recognizeFile(f, ourCompanies(), withPosted(s.docs), base + i)));
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

export function PlanDialog() {
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

export function ActDialog({ cp, edrpou }: { cp: string; edrpou?: string }) {
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
