// Коли перше читання не варто приймати без другого. Друге читання дороге, тому робимо його лише там,
// де воно щось ловить: не сходиться арифметика, модель сама не певна в ключових полях або низька впевненість.
import type { Recognized } from './schema';

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.001);
/** Поля, помилка в яких псує облік: номер, дата, контрагент, суми й кількості. Назва товару й одиниця — ні. */
const KEY = /^(number|date|net|vat|total|counterparty(\.name|\.edrpou)?|items|items\[\d+\]\.(qty|price|amount))$/;
const NO_SUMS = new Set<Recognized['kind']>(['other', 'order']);

export const MIN_CONFIDENCE = 85;

/** Причини перечитати документ; порожній список — перше читання приймається. */
export function rereadReasons(r: Recognized): string[] {
  const out: string[] = [];
  // порожній бланк або не документ: перечитувати нічого
  if (r.kind === 'other' && r.confidence === 0) return out;
  if (r.confidence < MIN_CONFIDENCE) out.push(`впевненість ${r.confidence}`);
  const keyDoubt = r.uncertain.filter(f => KEY.test(f));
  if (keyDoubt.length) out.push('сумнів: ' + keyDoubt.join(', '));
  r.items.forEach((it, i) => {
    if (it.qty != null && it.price != null && it.amount != null && !near(it.qty * it.price, it.amount)) out.push(`рядок ${i + 1}: кількість × ціна ≠ сума`);
  });
  const amounts = r.items.map(it => it.amount);
  if (r.items.length && amounts.every(a => a != null)) {
    const lines = amounts.reduce((s, a) => s + a!, 0);
    if (!(r.net != null && near(lines, r.net)) && !(r.total != null && near(lines, r.total))) out.push('сума рядків ≠ підсумку');
  }
  if (r.net != null && r.vat != null && r.total != null && !near(r.net + r.vat, r.total)) out.push('без ПДВ + ПДВ ≠ всього');
  if (r.total == null && !NO_SUMS.has(r.kind)) out.push('немає суми');
  return out;
}
