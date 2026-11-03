// Офіційний курс НБУ. Браузер звертається до /api/nbu-rate (Netlify Function), а вона до bank.gov.ua.
// НБУ встановлює курс на кожен календарний день, включно з вихідними; якщо дня в таблиці немає,
// беремо найближчий попередній відомий курс і позначаємо це.

import type { Rates } from './fx';

/** Таблиця курсів: валюта → дата YYYY-MM-DD → гривень за 1 одиницю. */
export type RateTable = Record<string, Record<string, number>>;

/** Функція курсу з таблиці. Немає курсу на дату і раніше — помилка, а не мовчазний нуль. */
export function ratesFrom(table: RateTable, missed?: (cur: string, date: string, used: string) => void): Rates {
  return (cur, date) => {
    if (cur === 'UAH') return 1;
    const t = table[cur];
    if (t?.[date] != null) return t[date];
    const prev = t && Object.keys(t).filter(d => d < date).sort().pop();
    if (!prev) throw new Error(`Немає курсу НБУ ${cur} на ${date}`);
    missed?.(cur, date, prev);
    return t[prev];
  };
}

/** Адреса API НБУ для однієї валюти й дати. */
export const nbuUrl = (cur: string, date: string) =>
  `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${encodeURIComponent(cur)}&date=${date.replaceAll('-', '')}&json`;

/** Розбір відповіді НБУ: [{ cc: "EUR", rate: 48.1234, exchangedate: "02.11.2026" }]. */
export function parseNbu(json: unknown, cur: string): number | null {
  if (!Array.isArray(json)) return null;
  const row = json.find((x: { cc?: string }) => x?.cc === cur) as { rate?: number } | undefined;
  return typeof row?.rate === 'number' && row.rate > 0 ? row.rate : null;
}

/** Курс з сервера Сальдо (кешується в межах сесії). */
const cache = new Map<string, Promise<number>>();
export function fetchNbuRate(cur: string, date: string): Promise<number> {
  if (cur === 'UAH') return Promise.resolve(1);
  const key = cur + date;
  const viaServer = () => fetch(`/api/nbu-rate?cur=${encodeURIComponent(cur)}&date=${date}`)
    .then(r => r.json())
    .then((j: { ok: boolean; rate?: number; error?: string }) => { if (!j.ok || !j.rate) throw new Error(j.error ?? 'Курс НБУ недоступний'); return j.rate; });
  // запасний шлях: напряму до API НБУ, якщо функція сайту недоступна
  const direct = () => fetch(nbuUrl(cur, date)).then(r => r.json()).then(j => { const r = parseNbu(j, cur); if (!r) throw new Error(`НБУ не має курсу ${cur} на ${date}`); return r; });
  if (!cache.has(key)) cache.set(key, viaServer().catch(direct).catch(e => { cache.delete(key); throw e; }));
  return cache.get(key)!;
}

/** Підтягнути в таблицю курси на всі потрібні дати. */
export async function loadRates(need: { currency: string; date: string }[], table: RateTable = {}): Promise<RateTable> {
  await Promise.all(need.filter(n => n.currency !== 'UAH' && table[n.currency]?.[n.date] == null).map(async n => {
    const r = await fetchNbuRate(n.currency, n.date);
    (table[n.currency] ??= {})[n.date] = r;
  }));
  return table;
}
