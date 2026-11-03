// Дати як рядки YYYY-MM-DD, обчислення в UTC, щоб часовий пояс браузера не зсував день.

const D = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const S = (t: Date) => t.toISOString().slice(0, 10);

/** Кількість днів між датами (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86400000);

export const addDays = (s: string, n: number) => { const t = D(s); t.setUTCDate(t.getUTCDate() + n); return S(t); };

/** Той самий день через n місяців; 31.01 + 1 міс. = 28/29.02. */
export function addMonths(s: string, n: number) {
  const [y, m, d] = s.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return S(first);
}

/** Останній день місяця дати. */
export const monthEnd = (s: string) => { const [y, m] = s.split('-').map(Number); return S(new Date(Date.UTC(y, m, 0))); };

/** Останні дні місяців від місяця дати a до місяця дати b включно. */
export function monthEnds(a: string, b: string) {
  const out: string[] = [];
  for (let e = monthEnd(a); e <= monthEnd(b); e = monthEnd(addDays(e, 1))) out.push(e);
  return out;
}

/** Кінець кварталу чи року? */
export const isQuarterEnd = (s: string) => s === monthEnd(s) && ['03', '06', '09', '12'].includes(s.slice(5, 7));
export const isYearEnd = (s: string) => s.slice(5) === '12-31';

/** Округлення до копійок без хвостів 0.1 + 0.2. */
export const r2 = (x: number) => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100;

/** Дата для людини: 03.11.2026. */
export const ua = (s: string) => s.split('-').reverse().join('.');
