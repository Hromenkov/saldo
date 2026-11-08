import { useState } from 'react';
import { type Doc, type Question } from '../data';
import { useApp } from '../store';
import { cx, fmt, Ms, StatusChip } from '../lib';
import { BankTable } from '../components/Tables';
import { StatCard } from './Overview';
import { toEnterpriseData } from '../import1c/export';
import { asOf } from '../audit';
import { DEFAULT_COMPANY } from '../recognize/companies';

/** Файл EnterpriseData для BAS: лише проведені документи без помилок аудиту. */
function exportBas(docs: Doc[], snack: (t: string) => void, done: (ids: number[]) => void) {
  const r = toEnterpriseData(docs, { name: DEFAULT_COMPANY }, { today: asOf() });
  if (!r.sent.length) { snack(r.held.length ? `Нічого вивантажувати: ${r.held.length} документів не пройшли аудит або не проведені` : 'Нових документів для BAS немає'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([r.xml], { type: 'application/xml' }));
  a.download = `saldo-bas-${new Date().toISOString().slice(0, 10)}.xml`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  done(r.sent.map(d => d.id));
  snack(`У файл для BAS: ${r.sent.length} док.${r.held.length ? `, затримано ${r.held.length}: ${r.held.map(h => '№ ' + h.doc.no + ' — ' + h.why).join('; ')}` : ''}`);
}

function QuestionCard({ q }: { q: Question }) {
  const { s, upd, snack } = useApp();
  const [picked, setPicked] = useState<string | null>(null);
  const answer = (opt: string) => {
    setPicked(opt);
    setTimeout(() => {
      const qi = s.questions.findIndex(x => x.id === q.id);
      const doc = q.doc ? s.docs.find(d => d.id === q.doc) : undefined;
      const prev = doc?.st;
      const fixBank = q.id === 'q2' && s.bank.some(x => x.kt === '?');
      upd(d => {
        d.questions.splice(d.questions.findIndex(x => x.id === q.id), 1);
        const dd = doc && d.docs.find(x => x.id === doc.id); if (dd) dd.st = 'ok';
        const b = fixBank && d.bank.find(x => x.kt === '?'); if (b) { b.kt = '361'; b.st = 'ok'; }
      });
      snack(`Відповідь «${opt}» збережено, документ проведено`, () => upd(d => {
        d.questions.splice(qi, 0, q);
        const dd = doc && d.docs.find(x => x.id === doc.id); if (dd && prev) dd.st = prev;
        if (fixBank) { const b = d.bank.find(x => x.cp === 'Петренко О. М.'); if (b) { b.kt = '?'; b.st = 'check'; } }
      }));
    }, 250);
  };
  return (
    <div className="m-card card-outlined q-card" id={q.id}>
      <div className="q-head"><span className="li" style={{ padding: 0, minHeight: 0 }}><span className="lead yellow"><Ms>{q.icon}</Ms></span></span>
        <div><div className="title-m">{q.title}</div><div className="q-meta body-s" style={{ marginTop: 4 }}>{q.meta.map(m => <span key={m}>{m}</span>)}</div></div></div>
      <div className="chips" style={{ paddingLeft: 56 }}>
        {q.opts.map(([o, h]) => (
          <button key={o} className="m-chip sl" aria-pressed={picked === o} onClick={() => answer(o)}>
            {o}{h && <span className="body-s muted" style={{ marginLeft: -2 }}>· {h}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Questions() {
  const { s } = useApp();
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Питання</h1><span className="spacer" /><span className="body-m muted">Відповідь потрібна, щоб провести документ правильно</span></div>
      {s.questions.length
        ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,520px),1fr))' }}>{s.questions.map(q => <QuestionCard key={q.id} q={q} />)}</div>
        : <div className="empty"><Ms>task_alt</Ms><div className="title-l" style={{ marginTop: 12, color: 'var(--md-on-surface)' }}>Питань немає</div><div className="body-m">Усі документи за листопад проведено.</div></div>}
    </div>
  );
}

export function Docs() {
  const { s, upd, snack, openDialog, openSheet } = useApp();
  const tabs: [string, string][] = [['all', 'Усі'], ['new', 'Розпізнано'], ['check', 'Потрібна відповідь'], ['ok', 'Проведено']];
  const f = s.docTab;
  const list = s.docs.filter(d => f === 'all' || d.st === f);
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">{s.role === 'acc' ? 'Вхідні документи' : 'Документи'}</h1><span className="spacer" />
        <button className="btn btn-outlined sl" onClick={() => snack('Надішліть фото на docs@saldo.ua або в Telegram-бот @saldo_docs_bot')}><Ms>alternate_email</Ms>Як надсилати</button>
        <button className="btn btn-outlined sl" onClick={() => exportBas(s.docs, snack, ids => upd(d => { const at = new Date().toISOString().slice(0, 10); d.docs.forEach(x => { if (ids.includes(x.id)) x.basAt = at; }); }))} title="Файл EnterpriseData: BAS → Вивантаження і завантаження даних EnterpriseData"><Ms>output</Ms>Вивантажити в BAS</button>
        <button className="btn btn-filled sl" onClick={() => openDialog({ kind: 'upload' })}><Ms>upload</Ms>Завантажити</button></div>
      <div className="m-tabs" role="tablist">{tabs.map(([k, l]) => (
        <button key={k} className="tab" role="tab" aria-selected={f === k} onClick={() => upd(d => { d.docTab = k; })}>{l} <span className="muted">{s.docs.filter(d => k === 'all' || d.st === k).length}</span></button>
      ))}</div>
      <div className="table-wrap"><table className="dt">
        <thead><tr><th>Документ</th><th>Контрагент</th><th>Дата</th><th>Джерело</th><th className="r">Сума, ₴</th><th>Статус</th></tr></thead>
        <tbody>{list.map(d => (
          <tr key={d.id} data-doc={d.id} onClick={() => openSheet({ kind: 'doc', id: d.id })}>
            <td><div className="doc"><Ms>{d.kind === 'pn' ? 'receipt' : 'draft'}</Ms><div><div className="title-s">{d.type}</div><div className="body-s muted">№ {d.no}</div></div></div></td>
            <td>{d.cp}</td><td className="num">{d.date}</td><td className="muted">{d.src}</td><td className="r">{fmt(d.sum)}</td><td><StatusChip st={d.st} /></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

export function Bank() {
  const { s, snack } = useApp();
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Банк</h1><span className="spacer" /><button className="btn btn-outlined sl" onClick={() => snack('Виписки оновлено: нових операцій немає')}><Ms>sync</Ms>Оновити</button></div>
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <StatCard ic="account_balance" t="ПриватБанк · UA…1234" v="312 480,15 ₴" d="API · оновлено 5 хв тому" />
        <StatCard ic="account_balance" t="monobank · UA…7788" v="99 900,00 ₴" d="API · оновлено 5 хв тому" />
        <div className="m-card card-outlined stat" style={{ justifyContent: 'center', alignItems: 'flex-start' }}><button className="btn btn-tonal sl" onClick={() => snack('Підключення банку: оберіть банк і надайте доступ лише на читання')}><Ms>add_link</Ms>Підключити рахунок</button></div>
      </div>
      <BankTable rows={s.bank} full />
    </div>
  );
}

function ToggleChips({ items, initial }: { items: string[]; initial: number }) {
  const [on, setOn] = useState(initial);
  return <div className="chips">{items.map((x, i) => <button key={x} className="m-chip sl" aria-pressed={on === i} onClick={() => setOn(i)}>{on === i && <Ms>check</Ms>}{x}</button>)}</div>;
}

export function Ledger() {
  const { s, snack } = useApp();
  const cell = (v: number) => v ? fmt(v) : <span className="muted">—</span>;
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Оборотно-сальдова відомість</h1><span className="spacer" />
        <ToggleChips items={['Листопад 2026', 'Субрахунки']} initial={0} />
        <button className="btn btn-outlined sl" onClick={() => snack('Файл ОСВ_листопад_2026.xlsx сформовано')}><Ms>download</Ms>Excel</button></div>
      <div className="table-wrap"><table className="dt" style={{ minWidth: 960 }}>
        <thead><tr><th>Рахунок</th><th>Назва</th><th className="r">Сальдо поч. Дт</th><th className="r">Сальдо поч. Кт</th><th className="r">Оборот Дт</th><th className="r">Оборот Кт</th><th className="r">Сальдо кін. Дт</th><th className="r">Сальдо кін. Кт</th></tr></thead>
        <tbody>{s.ledger.map(r => <tr key={r[0]}><td className="title-s num">{r[0]}</td><td>{r[1]}</td>{r.slice(2).map((v, i) => <td key={i} className="r">{cell(v as number)}</td>)}</tr>)}</tbody>
      </table></div>
      <p className="body-s muted" style={{ marginTop: 12 }}>{s.ledgerSrc ? `Імпортовано з 1С: ${s.ledgerSrc}` : 'Дані прикладу. Період відкритий: проведено 47 з 51 документа.'}</p>
    </div>
  );
}

export function Close() {
  const { s, go, snack } = useApp();
  const done = s.close.filter(c => c.done).length;
  const allDone = done === s.close.length - 1;
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Закриття місяця</h1><span className="spacer" /><span className="body-m muted">Листопад 2026</span></div>
      <div className="m-card card-filled">
        <div className="title-m">Виконано {done} з {s.close.length} кроків</div>
        <div className="progress-l"><span style={{ width: `${done / s.close.length * 100}%` }} /></div>
        <div className="body-s muted">Система виконує регламентні операції сама. Ви підтверджуєте результат і блокуєте період.</div>
      </div>
      <div className="m-card card-outlined" style={{ padding: 0, marginTop: 12 }}>
        <ul className="steps">{s.close.map(c => (
          <li key={c.t} className={cx(c.done && 'done')}><span className="chk">{c.done && <Ms>check</Ms>}</span>
            <span className="txt"><div className="title-s">{c.t}</div><div className="body-s muted">{c.s}</div></span>
            {!c.done && c.key && <button className="btn btn-text sl" onClick={() => go(c.key === 'bank' ? 'bank' : c.key === 'assets' ? 'assets' : 'docs')}>Відкрити</button>}</li>
        ))}</ul>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-outlined sl" onClick={() => snack('Звіт про закриття сформовано')}>Звіт про закриття</button>
        <button className="btn btn-filled sl" disabled={!allDone}><Ms>lock</Ms>Заблокувати період</button>
      </div>
    </div>
  );
}

export function Reports() {
  const { s, snack, openDialog } = useApp();
  return (
    <div className="page">
      <div className="page-head"><h1 className="headline-s">Звітність</h1><span className="spacer" /><button className="btn btn-outlined sl" onClick={() => snack('Календар звітності експортовано в Google Календар')}><Ms>calendar_month</Ms>У календар</button></div>
      <div className="table-wrap"><table className="dt">
        <thead><tr><th>Звіт</th><th>Період</th><th>Термін</th><th>Статус</th><th></th></tr></thead>
        <tbody>{s.reports.map(r => (
          <tr key={r.name + r.per}><td><div className="doc"><Ms>description</Ms><span className="title-s">{r.name}</span></div></td><td>{r.per}</td><td className="num">{r.due}</td><td><StatusChip st={r.st} /></td>
            <td className="r">{r.st === 'ready'
              ? <button className="btn btn-filled sl" onClick={() => openDialog({ kind: 'sign', name: r.name, per: r.per })}><Ms>draw</Ms>Підписати КЕП</button>
              : r.st === 'sent'
                ? <button className="btn btn-text sl" onClick={() => snack('Квитанцію №2 відкрито')}>Квитанція</button>
                : <button className="btn btn-text sl" onClick={() => snack('Чернетку відкрито')}>Відкрити</button>}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="body-s muted" style={{ marginTop: 12 }}>Звіти формуються у форматі XML за схемами ДПС. Підписуєте ви або уповноважена особа.</p>
    </div>
  );
}
