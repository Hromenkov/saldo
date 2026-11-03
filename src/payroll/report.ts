// Дані для Податкового розрахунку (ПДФО, ВЗ, ЄСВ): Додаток 4ДФ (щоквартально) і Додаток 1 ЄСВ (помісячно по особах).
// Лікарняні, які ПФУ виплачує напряму, сюди не потрапляють: податковим агентом за ними є ПФУ.
import { calDays, r2, type PayrollRun } from './engine';
import type { PaymentOrder } from './postings';

export type Row4DF = {
  ipn: string; name: string;
  /** ознака доходу 101 — заробітна плата, відпускні, лікарняні за рахунок роботодавця */
  sign: '101';
  accrued: number; paid: number;
  pdfoAccrued: number; pdfoPaid: number;
  vzAccrued: number; vzPaid: number;
  /** ознака податкової соціальної пільги: 01 — звичайна */
  pspSign: '' | '01';
  hired: string; fired: string;
};

export const quarterOf = (ym: string) => Math.ceil(+ym.slice(5, 7) / 3);

/** Рядки 4ДФ за квартал: нараховане з нарахувань, виплачене й перераховане — з платіжок, прив'язаних до цих нарахувань. */
export function build4DF(runs: PayrollRun[], orders: PaymentOrder[], year: number, quarter: number): Row4DF[] {
  const inQ = runs.filter(r => +r.month.slice(0, 4) === year && quarterOf(r.month) === quarter);
  const ids = new Set(inQ.map(r => r.id));
  const paidBy = (kind: PaymentOrder['kind'], emp: string) => r2(orders.filter(o => ids.has(o.accrualId) && o.kind === kind)
    .reduce((s, o) => s + o.perEmployee.filter(p => p.id === emp).reduce((a, p) => a + p.amount, 0), 0));
  const qStart = `${year}-${String(quarter * 3 - 2).padStart(2, '0')}`, qEnd = `${year}-${String(quarter * 3).padStart(2, '0')}`;
  const rows = new Map<string, Row4DF>();
  for (const run of inQ) for (const r of run.results) {
    const e = r.emp;
    const row = rows.get(e.id) ?? {
      ipn: e.ipn, name: e.name, sign: '101', accrued: 0, paid: 0, pdfoAccrued: 0, pdfoPaid: 0, vzAccrued: 0, vzPaid: 0, pspSign: '',
      hired: e.hired.slice(0, 7) >= qStart && e.hired.slice(0, 7) <= qEnd ? e.hired : '',
      fired: e.fired && e.fired.slice(0, 7) >= qStart && e.fired.slice(0, 7) <= qEnd ? e.fired : ''
    } as Row4DF;
    row.accrued = r2(row.accrued + r.gross);
    row.pdfoAccrued = r2(row.pdfoAccrued + r.pdfo);
    row.vzAccrued = r2(row.vzAccrued + r.vz);
    if (r.psp) row.pspSign = '01';
    rows.set(e.id, row);
  }
  for (const [id, row] of rows) {
    row.pdfoPaid = paidBy('pdfo', id);
    row.vzPaid = paidBy('vz', id);
    // виплачений дохід — разом з утриманими податками, якщо зарплату виплачено
    const net = paidBy('net', id);
    row.paid = net ? r2(net + row.pdfoPaid + row.vzPaid) : 0;
  }
  return [...rows.values()];
}

export type RowD1 = {
  ipn: string; name: string; month: string;
  /** код категорії застрахованої особи: 1 — наймані працівники */
  category: '1';
  total: number; withinMax: number; minDiff: number; esv: number;
  sickDays: number; employedDays: number;
};

/** Додаток 1 ЄСВ: по кожній особі за кожен місяць кварталу. */
export function buildD1(runs: PayrollRun[]): RowD1[] {
  return runs.flatMap(run => run.results.map(r => ({
    ipn: r.emp.ipn, name: r.emp.name, month: run.month, category: '1' as const,
    total: r.gross, withinMax: r.esvBase, minDiff: r.esvTopUp, esv: r.esv,
    sickDays: r.sickDays, employedDays: Math.min(r.employedDays, calDays(run.month))
  })));
}

const csvCell = (v: string | number) => { const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v; return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (head: string[], rows: (string | number)[][]) => '﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');

export const csv4DF = (rows: Row4DF[]) => toCsv(
  ['РНОКПП', 'ПІБ', 'Ознака доходу', 'Нараховано', 'Виплачено', 'ПДФО нараховано', 'ПДФО перераховано', 'ВЗ нараховано', 'ВЗ перераховано', 'Ознака ПСП', 'Дата прийняття', 'Дата звільнення'],
  rows.map(r => [r.ipn, r.name, r.sign, r.accrued, r.paid, r.pdfoAccrued, r.pdfoPaid, r.vzAccrued, r.vzPaid, r.pspSign, r.hired, r.fired]));

export const csvD1 = (rows: RowD1[]) => toCsv(
  ['РНОКПП', 'ПІБ', 'Місяць', 'Категорія', 'Загальна сума', 'У межах максимальної', 'Різниця до мінімальної', 'ЄСВ', 'Днів непрацездатності', 'Днів у трудових відносинах'],
  rows.map(r => [r.ipn, r.name, r.month, r.category, r.total, r.withinMax, r.minDiff, r.esv, String(r.sickDays), String(r.employedDays)]));
