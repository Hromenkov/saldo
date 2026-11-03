// Демо-дані для сторінки «Кредити і валюта»: два кредити, валютні документи і курси.
// Курси прикладу згенеровані плавною кривою на кожен день; кнопка «Курси НБУ» замінює їх офіційними.

import { addDays, daysBetween } from './dates';
import type { Loan } from './loans';
import type { FxItem } from './fx';
import type { RateTable } from './nbu';

export const DEMO_LOANS: Loan[] = [
  { id: 'lt1', bank: 'Райффайзен Банк', contract: 'LT-1/26', currency: 'UAH', principal: 360000, rate: 18, start: '2026-03-10', months: 36, method: 'equal' },
  { id: 'eur3', bank: 'ОТП Банк', contract: 'EUR-3', currency: 'EUR', principal: 20000, rate: 6, start: '2026-09-15', months: 12, method: 'annuity' }
];

/** Валютні документи, що не залежать від кредитів. Рух валютного рахунку від кредитів додається на сторінці. */
export const DEMO_FX_DOCS: FxItem[] = [
  { doc: 'Інвойс 88 · Lavazza S.p.A.', account: '632', currency: 'EUR', movements: [{ date: '2026-10-06', amount: 12000, text: 'Поставка кави' }, { date: '2026-11-12', amount: -5000, text: 'Часткова оплата' }] },
  { doc: 'Експорт 12 · Coffee Lab Sp. z o.o.', account: '362', currency: 'USD', movements: [{ date: '2026-11-04', amount: 3500, text: 'Відвантаження' }] },
  { doc: 'Аванс Bialetti (немонетарний)', account: '632', currency: 'EUR', advance: true, movements: [{ date: '2026-11-20', amount: 1500 }] }
];

/** Інші рухи валютного рахунку 312 EUR, крім кредиту. */
export const DEMO_EUR_CASH = [
  { date: '2026-09-01', amount: 8000, text: 'Залишок на початок' },
  { date: '2026-11-12', amount: -5000, text: 'Оплата Lavazza' }
];

export function demoRates(): RateTable {
  const t: RateTable = { EUR: {}, USD: {} };
  const from = '2026-08-01';
  for (let d = from; d <= '2027-12-31'; d = addDays(d, 1)) {
    const i = daysBetween(from, d);
    t.EUR[d] = Math.round((48.2 + 0.6 * Math.sin(i / 9) + i * 0.004) * 1e4) / 1e4;
    t.USD[d] = Math.round((41.3 + 0.3 * Math.sin(i / 11) + i * 0.002) * 1e4) / 1e4;
  }
  return t;
}
