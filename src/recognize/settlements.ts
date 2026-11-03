// Взаєморозрахунки з контрагентами: що ми винні постачальнику (631) і що нам винен покупець (361),
// аванси видані (371) й отримані (681), яка оплата закриває яку накладну, залік авансів і акт звірки.
// Усе рахується з проводок документів і банківських операцій, нічого не зберігається окремо.
import type { BankRow, Doc } from '../data';

export type Mov = {
  key: string; sort: string; date: string; title: string; docId?: number; bankIdx?: number;
  /** рядки проводок, що стосуються розрахунків з контрагентом */
  lines: [string, string, number, string][];
  /** номер документа, на який посилається оплата (з підстави або призначення) */
  ref?: string;
};

const GROUP = ['361', '371', '631', '681'];
const sortKey = (date: string, y?: string) => { const [dd, mm] = date.split('.'); return `${y || '2026'}${mm}${dd}`; };
/** Номер документа з тексту призначення: «згідно рах. 418», «акту 77», «накл. № 23». */
export const refNo = (text: string) => text.match(/(?:№|рах\.?|рахунку|накл\.?|накладн\S*|акт\S*)\s*№?\s*([\w/-]*\d[\w/-]*)/i)?.[1];

const usable = (d: Doc) => d.st !== 'check';

/** Усі рухи по контрагенту: документи і банк. Ключ контрагента — ЄДРПОУ або назва. */
export function movements(cp: { cp: string; edrpou?: string }, docs: Doc[], bank: BankRow[]): Mov[] {
  const out: Mov[] = [];
  for (const d of docs) {
    if (!usable(d) || !((cp.edrpou && d.edrpou === cp.edrpou) || d.cp === cp.cp)) continue;
    const lines = d.lines.filter(l => GROUP.includes(l[0]) || GROUP.includes(l[1]));
    if (lines.length) out.push({ key: 'd' + d.id, sort: sortKey(d.date, d.y), date: d.date, title: `${d.type} № ${d.no}`, docId: d.id, lines, ref: d.refs?.primary_no || undefined });
  }
  bank.forEach((b, i) => {
    if (b.st === 'check' || b.cp !== cp.cp || !(GROUP.includes(b.dt) || GROUP.includes(b.kt))) return;
    out.push({ key: 'b' + i, sort: sortKey(b.d), date: b.d, title: `Банк: ${b.p}`, bankIdx: i, lines: [[b.dt, b.kt, Math.abs(b.s), b.p]], ref: refNo(b.p) });
  });
  return out.sort((a, b) => a.sort.localeCompare(b.sort) || a.key.localeCompare(b.key));
}

const bal = (movs: Mov[], acc: string) => movs.reduce((s, m) => s + m.lines.reduce((t, l) => t + (l[0] === acc ? l[2] : 0) - (l[1] === acc ? l[2] : 0), 0), 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Balances = {
  /** ми винні постачальнику (кредитове сальдо 631) */ weOwe: number;
  /** аванс, виданий постачальнику (371) */ advGiven: number;
  /** покупець винен нам (361) */ theyOwe: number;
  /** аванс, отриманий від покупця (681) */ advGot: number;
  /** сальдо саме на рахунках авансів 371 і 681: лише їх зараховуємо проводкою; переплата по 631/361 гаситься сама */
  on371: number; on681: number;
};
export function balances(movs: Mov[]): Balances {
  const s631 = -bal(movs, '631'), s371 = bal(movs, '371'), s361 = bal(movs, '361'), s681 = -bal(movs, '681');
  // переплата по 631 — це фактично аванс постачальнику, переплата по 361 — аванс від покупця
  return {
    weOwe: r2(Math.max(0, s631)), advGiven: r2(s371 + Math.max(0, -s631)),
    theyOwe: r2(Math.max(0, s361)), advGot: r2(s681 + Math.max(0, -s361)),
    on371: r2(Math.max(0, s371)), on681: r2(Math.max(0, s681))
  };
}

export type Alloc = { docId: number; title: string; total: number; paid: number; rest: number; payments: { title: string; amount: number }[] };

/**
 * Яка оплата закриває яку накладну. Оплата з посиланням на номер документа йде спершу на нього,
 * решта — на найстаріші незакриті документи (FIFO). Надлишок — аванс.
 */
export function allocate(movs: Mov[]): { supplier: Alloc[]; customer: Alloc[] } {
  const run = (debt: (l: Mov['lines'][number]) => number, pay: (l: Mov['lines'][number]) => number) => {
    const docs: Alloc[] = [];
    const byMov = new Map<string, Alloc>();
    for (const m of movs) {
      const t = r2(m.lines.reduce((s, l) => s + debt(l), 0));
      if (t > 0 && m.docId != null) { const a = { docId: m.docId, title: m.title, total: t, paid: 0, rest: t, payments: [] }; docs.push(a); byMov.set(m.key, a); }
    }
    // аванси, що надійшли раніше за документ, теж закривають його: тому спершу всі оплати, потім розподіл по черзі
    for (const m of movs) {
      let amount = r2(m.lines.reduce((s, l) => s + pay(l), 0));
      if (amount <= 0) continue;
      const target = m.ref ? docs.find(a => a.title.replace(/\D+$/, '').endsWith('№ ' + m.ref) && a.rest > 0) : undefined;
      const queue = [...(target ? [target] : []), ...docs.filter(a => a !== target && a.rest > 0)];
      for (const a of queue) {
        if (amount <= 0) break;
        const x = r2(Math.min(a.rest, amount));
        if (x <= 0) continue;
        a.paid = r2(a.paid + x); a.rest = r2(a.rest - x); amount = r2(amount - x);
        a.payments.push({ title: m.title, amount: x });
      }
    }
    return docs;
  };
  return {
    // постачальник: борг виникає за Кт 631, гасять Дт 631 і Дт 371 (аванс) з грошових рахунків
    supplier: run(l => (l[1] === '631' && l[0] !== '371' ? l[2] : 0), l => ((l[0] === '631' || l[0] === '371') && !GROUP.includes(l[1]) ? l[2] : 0)),
    // покупець: борг за Дт 361, гасять Кт 361 і Кт 681 з грошових рахунків
    customer: run(l => (l[0] === '361' && l[1] !== '681' ? l[2] : 0), l => ((l[1] === '361' || l[1] === '681') && !GROUP.includes(l[0]) ? l[2] : 0))
  };
}

/**
 * Залік авансу при проведенні накладної чи акта.
 * Постачальник: Дт 631 Кт 371 на суму виданого авансу (не більше суми документа).
 * Покупець: Дт 681 Кт 361, а ПДВ на покриту авансом частину вже нараховано першою подією (Дт 643 Кт 6412),
 * тому замість Дт 70x Кт 6412 ставимо Дт 70x Кт 643.
 */
export function offsetLines(d: Doc, b: Balances): Doc['lines'] {
  const out: Doc['lines'] = [];
  const supplierDebt = d.lines.filter(l => l[1] === '631').reduce((s, l) => s + l[2], 0);
  const saleDebt = d.lines.filter(l => l[0] === '361').reduce((s, l) => s + l[2], 0);
  if (supplierDebt > 0 && b.on371 > 0) out.push(['631', '371', r2(Math.min(supplierDebt, b.on371)), 'Залік виданого авансу']);
  if (saleDebt > 0 && b.on681 > 0) out.push(['681', '361', r2(Math.min(saleDebt, b.on681)), 'Залік отриманого авансу']);
  return out;
}

/** Проводки документа з урахуванням авансів: залік і ПДВ першою подією. */
export function withAdvances(d: Doc, b: Balances): Doc['lines'] {
  const off = offsetLines(d, b);
  if (!off.length) return d.lines;
  const saleOff = off.find(l => l[0] === '681');
  let lines = d.lines;
  if (saleOff) {
    const total = d.lines.filter(l => l[0] === '361').reduce((s, l) => s + l[2], 0);
    const share = total ? saleOff[2] / total : 0;
    lines = d.lines.flatMap(l => {
      if (!/^70[123]$/.test(l[0]) || l[1] !== '6412') return [l];
      const covered = r2(l[2] * share), rest = r2(l[2] - covered);
      const out: Doc['lines'] = [[l[0], '643', covered, 'ПДВ: перша подія — аванс, закриваємо 643']];
      if (rest > 0) out.push([l[0], '6412', rest, l[3]]);
      return out;
    });
  }
  return [...lines, ...off];
}

export type ActRow = { date: string; title: string; debit: number; credit: number };

/** Акт звірки: дебет — збільшує борг контрагента перед нами (продаж, наша оплата), кредит — навпаки. */
export function reconciliation(movs: Mov[]): { rows: ActRow[]; debit: number; credit: number; balance: number } {
  const rows: ActRow[] = [];
  for (const m of movs) {
    let debit = 0, credit = 0;
    for (const [dt, kt, s] of m.lines) {
      const a = GROUP.includes(dt), b = GROUP.includes(kt);
      if (a && b) continue; // залік авансу всередині розрахунків не змінює сальдо
      if (a) debit += s; else if (b) credit += s;
    }
    if (debit || credit) rows.push({ date: m.date, title: m.title, debit: r2(debit), credit: r2(credit) });
  }
  const debit = r2(rows.reduce((s, r) => s + r.debit, 0)), credit = r2(rows.reduce((s, r) => s + r.credit, 0));
  return { rows, debit, credit, balance: r2(debit - credit) };
}
