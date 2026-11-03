// Курсові різниці за П(С)БО 21: монетарні статті в іноземній валюті перераховуються за курсом НБУ
// на дату кожної операції за статтею (оплата, часткова оплата, нова поставка) і на дату балансу.
// Аванси видані й отримані немонетарні: не перераховуються.
//
// Операційні статті (312, 362, 632): Дт 945 / Кт 714.
// Неопераційні (валютні кредити 502, 602, 612 і відсотки 684): Дт 974 / Кт 744.

import { r2, ua } from './dates';
import type { Posting } from './loans';

export type Rates = (currency: string, date: string) => number;

export type FxMovement = { date: string; amount: number; text?: string };

export type FxItem = {
  doc: string;              // документ або договір, до якого прив'язана стаття
  account: string;          // 312, 362, 632, 502…
  currency: string;
  /** Рух у валюті: + збільшує статтю (поставка для 632, відвантаження для 362, надходження на 312), − зменшує (оплата). */
  movements: FxMovement[];
  nonOperating?: boolean;   // за замовчуванням за рахунком
  advance?: boolean;        // аванс: немонетарна стаття, різниць немає
};

export type FxDiff = {
  date: string; doc: string; account: string; currency: string;
  balance: number;          // залишок у валюті, що перераховувався
  oldRate: number; newRate: number;
  diff: number;             // зміна гривневої оцінки статті, ₴ (+ стаття подорожчала)
  gain: boolean;
  posting: Posting;
  reason: 'payment' | 'balance';
};

export const ASSET_ACCOUNTS = ['312', '362'];
export const LIABILITY_ACCOUNTS = ['632', '502', '602', '612', '684'];
export const NON_OPERATING = ['502', '602', '612', '684'];

const side = (acc: string) => {
  if (ASSET_ACCOUNTS.includes(acc)) return 'asset';
  if (LIABILITY_ACCOUNTS.includes(acc)) return 'liability';
  throw new Error(`Рахунок ${acc} не є валютною монетарною статтею`);
};

/** Проводка курсової різниці за статтею. */
export function fxPosting(item: FxItem, date: string, diff: number, reason: 'payment' | 'balance'): Posting {
  const nonOp = item.nonOperating ?? NON_OPERATING.includes(item.account);
  const income = nonOp ? '744' : '714', loss = nonOp ? '974' : '945';
  const gain = (side(item.account) === 'asset') === (diff > 0);
  const amount = r2(Math.abs(diff));
  const what = reason === 'balance' ? `на дату балансу ${ua(date)}` : `на дату операції ${ua(date)}`;
  return gain
    ? { date, dt: item.account, kt: income, amount, doc: item.doc, text: `Дохід від курсової різниці ${what}` }
    : { date, dt: loss, kt: item.account, amount, doc: item.doc, text: `Втрата від курсової різниці ${what}` };
}

/**
 * Курсові різниці за статтею: на кожну дату руху (крім першого визнання) і на кожну дату балансу.
 * Перед рухом увесь залишок перераховується до курсу дня, потім рух додається за тим самим курсом.
 */
export function fxDifferences(item: FxItem, rates: Rates, balanceDates: string[] = []): FxDiff[] {
  if (item.advance || item.currency === 'UAH') return [];
  const events = [
    ...item.movements.map(m => ({ date: m.date, amount: m.amount, reason: 'payment' as const })),
    ...balanceDates.map(d => ({ date: d, amount: 0, reason: 'balance' as const }))
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.reason === 'payment' ? -1 : 1));
  const out: FxDiff[] = [];
  let cur = 0, uah = 0, rate = 0;
  for (const e of events) {
    const k = rates(item.currency, e.date);
    if (cur !== 0) {
      const diff = r2(cur * k - uah);
      if (diff !== 0) {
        const posting = fxPosting(item, e.date, diff, e.reason);
        out.push({ date: e.date, doc: item.doc, account: item.account, currency: item.currency, balance: cur, oldRate: rate, newRate: k, diff, gain: posting.kt === '714' || posting.kt === '744', posting, reason: e.reason });
      }
      uah = r2(cur * k);
    }
    cur = r2(cur + e.amount);
    uah = r2(uah + e.amount * k);
    rate = k;
  }
  return out;
}

/** Гривнева оцінка статті на кінець дня date (після всіх різниць). */
export function carryingUah(item: FxItem, rates: Rates, date: string) {
  const ms = item.movements.filter(m => m.date <= date);
  const cur = r2(ms.reduce((s, m) => s + m.amount, 0));
  if (item.advance) return r2(ms.reduce((s, m) => s + m.amount * rates(item.currency, m.date), 0));
  return r2(cur * rates(item.currency, date));
}

/**
 * Рух валютної статті з проводок (наприклад, кредиту з loanPostings):
 * для пасиву кредит рахунку збільшує статтю, для активу — дебет.
 */
export function movementsFrom(ps: Posting[], account: string): FxMovement[] {
  const s = side(account) === 'asset' ? 1 : -1;
  return ps.flatMap(p => p.kt === account ? [{ date: p.date, amount: -s * p.amount, text: p.text }]
    : p.dt === account ? [{ date: p.date, amount: s * p.amount, text: p.text }] : []);
}

/** Різниці за кількома статтями разом, підсумок доходів і втрат. */
export function fxReport(items: FxItem[], rates: Rates, balanceDates: string[]) {
  const diffs = items.flatMap(i => fxDifferences(i, rates, balanceDates)).sort((a, b) => a.date.localeCompare(b.date));
  const sum = (accs: string[]) => r2(diffs.filter(d => accs.includes(d.gain ? d.posting.kt : d.posting.dt)).reduce((s, d) => s + d.posting.amount, 0));
  return { diffs, income714: sum(['714']), loss945: sum(['945']), income744: sum(['744']), loss974: sum(['974']) };
}

/** Проводки у валюті (наприклад, за валютним кредитом) у гривні за курсом НБУ на дату кожної проводки. */
export const toUah = (ps: Posting[], currency: string, rates: Rates): Posting[] =>
  currency === 'UAH' ? ps : ps.map(p => ({ ...p, amount: r2(p.amount * rates(currency, p.date)), text: `${p.text} (${p.amount} ${currency} × ${rates(currency, p.date)})` }));
