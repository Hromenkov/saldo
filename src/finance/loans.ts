// Кредити банків: графік погашення (тіло + відсотки) і проводки за ним.
// Без залежностей: файл потрапляє в браузер і в скрипт перевірки (npm test).
//
// Рахунки (Інструкція 291):
//   строк ≤ 12 місяців — 601 (гривня) / 602 (валюта);
//   строк > 12 місяців — 501 / 502, а частина, що підлягає погашенню протягом 12 місяців після дати балансу,
//   переноситься на 611 / 612 (Дт 501 Кт 611);
//   відсотки — Дт 951 Кт 684 у кожному місяці і на дату сплати, сплата Дт 684 Кт 311.

import { addMonths, daysBetween, isQuarterEnd, isYearEnd, monthEnd, monthEnds, r2, ua } from './dates';

export type LoanMethod = 'annuity' | 'equal' | 'bullet';
export type DayBasis = 'act/365' | 'act/360' | '30/360';

export type Loan = {
  id: string;
  bank: string;
  contract: string;
  currency: string;      // UAH, EUR, USD…
  principal: number;     // сума кредиту у валюті кредиту
  rate: number;          // річна ставка, % (18 = 18%)
  start: string;         // дата отримання, YYYY-MM-DD
  months: number;        // строк, місяців; платежі щомісяця в день отримання
  method: LoanMethod;    // ануїтет, рівні частки тіла (класичний), усе тіло в кінці
  basis?: DayBasis;      // база нарахування; за замовчуванням ануїтет 30/360, інші факт/365
  reclass?: 'month' | 'quarter' | 'year'; // як часто переносити поточну частину на 611 (за замовчуванням щокварталу)
  bankAccount?: string;  // з якого рахунку платимо; за замовчуванням 311 або 312
};

export type ScheduleRow = {
  n: number; from: string; date: string; days: number;
  opening: number; interest: number; principal: number; payment: number; closing: number;
};

export type Posting = { date: string; dt: string; kt: string; amount: number; text: string; doc: string };

export const basisOf = (l: Loan): DayBasis => l.basis ?? (l.method === 'annuity' ? '30/360' : 'act/365');

/** Рахунки кредиту за строком і валютою. */
export function loanAccounts(l: Loan) {
  const uah = l.currency === 'UAH';
  const long = l.months > 12;
  return {
    long,
    body: long ? (uah ? '501' : '502') : (uah ? '601' : '602'),
    current: uah ? '611' : '612',
    interest: '684',
    expense: '951',
    bank: l.bankAccount ?? (uah ? '311' : '312')
  };
}

const periodInterest = (l: Loan, bal: number, days: number) => {
  const b = basisOf(l);
  return b === '30/360' ? bal * l.rate / 1200 : bal * l.rate / 100 * days / (b === 'act/360' ? 360 : 365);
};

/** Графік погашення: по рядку на кожен щомісячний платіж. Останній платіж закриває залишок до копійки. */
export function schedule(l: Loan): ScheduleRow[] {
  if (!(l.principal > 0) || !(l.months >= 1) || !(l.rate >= 0)) throw new Error('Кредит: сума, строк і ставка мають бути додатними');
  const i = l.rate / 1200, n = l.months, P = l.principal;
  const annuity = i ? r2(P * i / (1 - (1 + i) ** -n)) : r2(P / n);
  const rows: ScheduleRow[] = [];
  let bal = P;
  for (let k = 1; k <= n; k++) {
    const from = addMonths(l.start, k - 1), date = addMonths(l.start, k), days = daysBetween(from, date);
    const interest = r2(periodInterest(l, bal, days));
    let principal = l.method === 'equal' ? r2(P / n) : l.method === 'bullet' ? 0 : r2(annuity - interest);
    if (k === n) principal = bal;
    principal = r2(Math.max(0, Math.min(principal, bal)));
    const closing = r2(bal - principal);
    rows.push({ n: k, from, date, days, opening: bal, interest, principal, payment: r2(principal + interest), closing });
    bal = closing;
  }
  return rows;
}

/** Тіло кредиту до погашення в проміжку (a, b]. */
const dueIn = (rows: ScheduleRow[], a: string, b: string) => r2(rows.filter(r => r.date > a && r.date <= b).reduce((s, r) => s + r.principal, 0));

const isReclassDate = (l: Loan, d: string) => {
  const f = l.reclass ?? 'quarter';
  return d === monthEnd(d) && (f === 'month' || (f === 'quarter' ? isQuarterEnd(d) : isYearEnd(d)));
};

/**
 * Усі проводки за кредитом від отримання до повного погашення, у хронологічному порядку.
 * Відсотки нараховуються наприкінці кожного місяця і на дату платежу за дні, що минули,
 * тож на дату сплати 684 закривається в нуль, а сума нарахувань дорівнює сумі відсотків за графіком.
 */
export function loanPostings(l: Loan, rows = schedule(l)): Posting[] {
  const a = loanAccounts(l);
  const doc = `${l.bank}, договір ${l.contract}`;
  const out: Posting[] = [];
  const add = (date: string, dt: string, kt: string, amount: number, text: string) => { if (r2(amount) !== 0) out.push({ date, dt, kt, amount: r2(amount), text, doc }); };
  let current = 0;
  const reclass = (date: string) => {
    if (!a.long) return;
    const delta = r2(dueIn(rows, date, addMonths(date, 12)) - current);
    if (delta > 0) { add(date, a.body, a.current, delta, `Перенесено на поточну заборгованість: до погашення протягом 12 місяців після ${ua(date)}`); current = r2(current + delta); }
  };

  add(l.start, a.bank, a.body, l.principal, `Отримано кредит, ${l.rate}% річних, ${l.months} міс.`);
  reclass(l.start);

  for (const r of rows) {
    // точки нарахування всередині періоду: кінці місяців і сама дата платежу
    const points = [...monthEnds(r.from, r.date).filter(e => e > r.from && e < r.date), r.date];
    let prev = r.from, accrued = 0;
    for (const p of points) {
      const isLast = p === r.date;
      const amt = isLast ? r2(r.interest - accrued) : r2(r.interest * daysBetween(prev, p) / r.days);
      add(p, a.expense, a.interest, amt, isLast ? `Відсотки до дати платежу ${r.n}` : `Відсотки за ${p.slice(5, 7)}.${p.slice(0, 4)}`);
      accrued = r2(accrued + amt);
      if (!isLast && isReclassDate(l, p)) reclass(p);
      prev = p;
    }
    add(r.date, a.interest, a.bank, r.interest, `Сплачено відсотки, платіж ${r.n}`);
    add(r.date, a.long ? a.current : a.body, a.bank, r.principal, `Погашено тіло кредиту, платіж ${r.n}`);
    if (a.long) current = r2(current - r.principal);
    if (isReclassDate(l, r.date)) reclass(r.date);
  }
  return out;
}

/** Проводки за період [from, to] включно — для закриття місяця. */
export const postingsFor = (l: Loan, from: string, to: string, all = loanPostings(l)) => all.filter(p => p.date >= from && p.date <= to);

/** Сальдо рахунків кредиту на кінець дня date (кредитове сальдо додатне). */
export function loanBalances(l: Loan, date: string, all = loanPostings(l)) {
  const a = loanAccounts(l);
  const bal: Record<string, number> = {};
  for (const p of all) if (p.date <= date) {
    bal[p.kt] = r2((bal[p.kt] ?? 0) + p.amount);
    bal[p.dt] = r2((bal[p.dt] ?? 0) - p.amount);
  }
  return {
    longTerm: a.long ? bal[a.body] ?? 0 : 0,
    current: a.long ? bal[a.current] ?? 0 : bal[a.body] ?? 0,
    interest: bal[a.interest] ?? 0,
    expense: -(bal[a.expense] ?? 0)
  };
}

/** Рядки для перевірки плану рахунків (checkLines). */
export const toLines = (ps: Posting[]) => ps.map(p => [p.dt, p.kt, p.amount, p.text] as [string, string, number, string]);
