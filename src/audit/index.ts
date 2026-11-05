// Аудит до копійки: перевіряє кожен документ і всю книгу разом, незалежно від того, звідки дані —
// з фото, з PDF чи з вивантаження 1С/BAS. Усі суми порівнюються в копійках (цілими числами), без допусків.
import type { BankRow, Doc } from '../data';
import { edrpouValid, rnokppValid } from '../recognize/checks';
import { checkLines } from '../recognize/chart';
import { refNo } from '../recognize/settlements';

/** error — помилка, яку треба виправити; warn — підозра, яку треба подивитися. */
export type Severity = 'error' | 'warn';
export type Area = 'arith' | 'vat' | 'req' | 'dup' | 'post' | 'bank' | 'date';
export type Finding = {
  sev: Severity; area: Area; t: string;
  docId?: number; bankIdx?: number;
  /** на скільки гривень розбіжність (за модулем); 0, якщо помилка не грошова */
  diff: number;
};

export const AREA_LABEL: Record<Area, string> = {
  arith: 'Арифметика', vat: 'ПДВ', req: 'Реквізити', dup: 'Дублікати', post: 'Проводки', bank: 'Звірка з банком', date: 'Дата і період'
};

/** Гривні → копійки. Округлення до копійки за правилами бухобліку (половина — вгору від нуля). */
export const kop = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7);
const uah = (k: number) => k / 100;
export const money = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ');
const m = (k: number) => money(uah(k));
const title = (d: Doc) => `${d.type} № ${d.no} від ${d.date}${d.y ? '.' + d.y : ''}`;

/** На яку дату перевіряємо. Демо-дані складено на кінець листопада 2026: інакше документи другої половини місяця були б «з майбутнього». */
export const asOf = () => new Date(Math.max(Date.now(), +new Date('2026-11-30T23:59:59')));

const VAT_KINDS = ['sale', 'purchase_goods', 'purchase_service'];
const RATES = [20, 14, 7];

export type AuditOpts = {
  today?: Date;
  /** період закрито до цієї дати включно (YYYY-MM-DD): документи за неї вже не можна вносити */
  closedThrough?: string;
};

const iso = (d: Doc, today: Date) => {
  const [dd, mm] = d.date.split('.');
  if (!dd || !mm) return '';
  return `${d.y || today.getFullYear()}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
};

/** Перевірки одного документа: рядки, підсумки, ПДВ, проводки, реквізити, дата. */
export function auditDoc(d: Doc, opts: AuditOpts = {}): Finding[] {
  const today = opts.today ?? new Date();
  const out: Finding[] = [];
  const add = (sev: Severity, area: Area, t: string, diff = 0) => out.push({ sev, area, t, docId: d.id, diff: uah(Math.abs(diff)) });
  const total = kop(d.sum), vat = kop(d.vat), net = total - vat;
  const vatKind = VAT_KINDS.includes(d.kind);

  // 1. Кожен рядок: кількість × ціна = сума
  const items = d.items || [];
  items.forEach((it, i) => {
    if (it.qty == null || it.price == null || it.amount == null) return;
    const expect = kop(it.qty * it.price), got = kop(it.amount);
    const diff = got - expect;
    // ціну на документі часто округлено до копійки з точнішої: для дробової кількості 1 коп. на рядок — це округлення
    const rounding = Math.abs(diff) <= 1 && !Number.isInteger(it.qty);
    if (diff && !rounding) add('error', 'arith', `Рядок ${i + 1} «${it.name}»: ${it.qty} × ${money(it.price)} = ${m(expect)} ₴, а в документі ${m(got)} ₴`, diff);
  });

  // 2. Сума рядків = сума без ПДВ (або всього, якщо ціни з ПДВ чи ПДВ немає)
  if (items.length && items.every(it => it.amount != null)) {
    const lines = items.reduce((s, it) => s + kop(it.amount!), 0);
    if (lines !== net && lines !== total) add('error', 'arith', `Сума рядків ${m(lines)} ₴ не дорівнює сумі без ПДВ ${m(net)} ₴`, lines - net);
  }

  // 3. ПДВ за ставкою: на весь документ або порядково (обидва способи округлення законні)
  if (vatKind && vat > 0) {
    const base = net;
    const byRate = RATES.map(r => {
      const whole = Math.round(base * r / 100);
      const perLine = items.length && items.every(it => it.amount != null) ? items.reduce((s, it) => s + Math.round(kop(it.amount!) * r / 100), 0) : whole;
      return { r, whole, perLine, gap: Math.min(Math.abs(vat - whole), Math.abs(vat - perLine)) };
    });
    const best = byRate.reduce((a, b) => (b.gap < a.gap ? b : a));
    if (best.gap) {
      // різниця понад 5% від ПДВ — це вже не помилка округлення, а інша база або ставка
      if (best.gap > Math.max(100, best.whole * 0.05)) add('error', 'vat', `ПДВ ${m(vat)} ₴ не відповідає жодній ставці (20%, 14%, 7%) від ${m(base)} ₴`, best.gap);
      else add('error', 'vat', `ПДВ ${m(vat)} ₴, а ${best.r}% від ${m(base)} ₴ = ${m(best.whole)} ₴`, vat - best.whole);
    }
  }
  if (vat < 0 || vat > total) add('error', 'vat', `ПДВ ${m(vat)} ₴ більший за суму документа ${m(total)} ₴`, vat);

  // 4. Проводки: сума розрахунків = сума документа, ПДВ у проводках = ПДВ документа, рахунки з плану
  if (d.lines.length) {
    const side = (acc: string, i: 0 | 1) => d.lines.filter(l => l[i].split(' ')[0] === acc).reduce((s, l) => s + kop(l[2]), 0);
    const settle = d.kind === 'sale' ? side('361', 0) : d.kind.startsWith('purchase_') ? side('631', 1) : null;
    if (settle != null && settle !== total) add('error', 'post', `У проводках розрахунки ${m(settle)} ₴, а документ на ${m(total)} ₴`, settle - total);
    if (vatKind) {
      const vatPosted = d.kind === 'sale' ? side('6412', 1) + side('643', 1) : side('6441', 0) + side('6442', 0) + side('641', 0);
      if (vatPosted !== vat) add('error', 'post', `ПДВ у проводках ${m(vatPosted)} ₴, а в документі ${m(vat)} ₴`, vatPosted - vat);
    }
    for (const iss of checkLines(d.lines)) add('error', 'post', `Проводка ${iss.line + 1}: ${iss.t}`);
  } else if (vatKind && d.st === 'ok') add('warn', 'post', 'Документ проведено без проводок');

  // 5. Реквізити контрагента
  const code = (d.edrpou || '').replace(/\D/g, '');
  if (code.length === 8 && !edrpouValid(code)) add('error', 'req', `ЄДРПОУ ${code} не проходить контрольну суму`);
  else if (code.length === 10 && !rnokppValid(code)) add('error', 'req', `ІПН ${code} не проходить контрольну суму`);
  else if (code && code.length !== 8 && code.length !== 10 && code.length !== 12) add('error', 'req', `Код контрагента «${code}» не схожий ні на ЄДРПОУ, ні на ІПН`);

  // 6. Дата: майбутнє і закритий період
  const day = iso(d, today);
  if (day) {
    const t = today.toISOString().slice(0, 10);
    if (day > t) add('error', 'date', `Дата ${d.date}.${day.slice(0, 4)} ще не настала`);
    if (opts.closedThrough && day <= opts.closedThrough) add('warn', 'date', `Документ у закритому періоді (закрито по ${opts.closedThrough.split('-').reverse().join('.')})`);
  }
  return out;
}

const normNo = (n: string) => n.replace(/\s/g, '').replace(/^№/, '').toLowerCase();
const sameCp = (a: Doc, b: Doc) => (a.edrpou && b.edrpou ? a.edrpou === b.edrpou : a.cp === b.cp);
const dayKey = (d: Doc) => `${d.y || ''}.${d.date}`;

/** Дублікати: той самий номер у того самого контрагента, або та сама сума в той самий день під іншим номером. */
export function auditDuplicates(docs: Doc[]): Finding[] {
  const out: Finding[] = [];
  const real = docs.filter(d => d.kind !== 'other');
  for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) {
    const a = real[i], b = real[j];
    if (a.kind !== b.kind || !sameCp(a, b)) continue;
    if (normNo(a.no) === normNo(b.no) && dayKey(a) === dayKey(b)) {
      out.push({ sev: 'error', area: 'dup', docId: b.id, diff: uah(kop(b.sum)), t: `Дублікат: ${title(b)} внесено двічі (${a.src} і ${b.src})${kop(a.sum) !== kop(b.sum) ? `, суми різні: ${money(a.sum)} і ${money(b.sum)} ₴` : ''}` });
    } else if (normNo(a.no) !== normNo(b.no) && dayKey(a) === dayKey(b) && kop(a.sum) === kop(b.sum)) {
      out.push({ sev: 'warn', area: 'dup', docId: b.id, diff: 0, t: `Можливо, внесено двічі: ${a.cp}, ${a.date}, обидва на ${money(a.sum)} ₴, номери ${a.no} і ${b.no}` });
    }
  }
  return out;
}

/** Звірка з банком: оплата з посиланням на документ має збігатися з ним до копійки; гроші без документа. */
export function auditBank(docs: Doc[], bank: BankRow[]): Finding[] {
  const out: Finding[] = [];
  bank.forEach((b, i) => {
    if (b.dt === '?' || b.kt === '?') out.push({ sev: 'warn', area: 'bank', bankIdx: i, diff: 0, t: `Банк ${b.d}: ${b.cp}, ${money(Math.abs(b.s))} ₴ «${b.p}» не рознесено по рахунках` });
    const ref = refNo(b.p);
    const incoming = b.s > 0;
    const pool = docs.filter(d => d.cp === b.cp && (incoming ? d.kind === 'sale' : d.kind.startsWith('purchase_')));
    const doc = ref ? pool.find(d => normNo(d.no) === normNo(ref)) : undefined;
    if (doc && kop(Math.abs(b.s)) !== kop(doc.sum)) {
      const diff = kop(Math.abs(b.s)) - kop(doc.sum);
      out.push({ sev: 'error', area: 'bank', bankIdx: i, docId: doc.id, diff: uah(Math.abs(diff)),
        t: `Оплата ${b.d} на ${money(Math.abs(b.s))} ₴ за ${doc.type.toLowerCase()} № ${doc.no} на ${money(doc.sum)} ₴: ${diff > 0 ? 'переплата' : 'недоплата'} ${m(Math.abs(diff))} ₴` });
    }
    // оплата постачальнику чи від покупця, під яку немає жодного документа (податки, банк, зарплата — не про це)
    const trade = incoming ? b.kt === '361' || b.kt === '681' : b.dt === '631' || b.dt === '371';
    if (trade && !docs.some(d => d.cp === b.cp)) out.push({ sev: 'warn', area: 'bank', bankIdx: i, diff: 0, t: `${incoming ? 'Надходження від' : 'Оплата'} ${b.cp} ${b.d} на ${money(Math.abs(b.s))} ₴: первинного документа немає` });
  });
  return out;
}

export type AuditReport = {
  findings: Finding[];
  checked: number; clean: number; errors: number; warns: number;
  /** сума розбіжностей у гривнях (дублікати рахуються повною сумою) */
  atStake: number;
};

/** Повний аудит: кожен документ, дублікати і звірка з банком. Документи без проводок (ТТН, чек, рахунок) — лише реквізити й дублікати. */
export function audit(docs: Doc[], bank: BankRow[], opts: AuditOpts = {}): AuditReport {
  const findings = [...docs.flatMap(d => auditDoc(d, opts)), ...auditDuplicates(docs), ...auditBank(docs, bank)];
  const bad = new Set(findings.filter(f => f.docId != null).map(f => f.docId));
  const errors = findings.filter(f => f.sev === 'error').length;
  return {
    findings: findings.sort((a, b) => (a.sev === b.sev ? b.diff - a.diff : a.sev === 'error' ? -1 : 1)),
    checked: docs.length, clean: docs.filter(d => !bad.has(d.id)).length,
    errors, warns: findings.length - errors,
    atStake: uah(findings.reduce((s, f) => s + kop(f.diff), 0))
  };
}
