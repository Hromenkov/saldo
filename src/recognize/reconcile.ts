// Звірка двох незалежних читань одного фото. Рукопис читається з помилками в окремих цифрах,
// а дві незалежні спроби рідко помиляються однаково. Беремо читання, де сходиться арифметика,
// а кожне поле, у якому читання розійшлися, позначаємо для ручної перевірки.
import type { Recognized } from './schema';

const near = (a: number | null | undefined, b: number | null | undefined, tol = 0.01) => a != null && b != null && Math.abs(a - b) <= tol;
const eqNum = (a: number | null | undefined, b: number | null | undefined) => (a == null && b == null) || near(a, b);
const normStr = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^0-9a-zа-яіїєґ]/g, '');
const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '');

/** Наскільки читання узгоджене саме з собою: рядки, підсумок, ПДВ. */
export function consistency(r: Recognized): number {
  let s = 0;
  for (const it of r.items) if (it.qty != null && it.price != null && it.amount != null && near(it.qty * it.price, it.amount, 0.05)) s++;
  const lines = r.items.reduce((a, x) => a + (x.amount ?? 0), 0);
  if (r.items.length && (near(lines, r.net, 0.05) || near(lines, r.total, 0.05))) s += 2;
  if (r.net != null && r.vat != null && near(r.net + r.vat, r.total, 0.05)) s += 1;
  return s;
}

/** Поля, у яких два читання не збігаються (назви полів схеми). */
export function disagreements(a: Recognized, b: Recognized): string[] {
  const out: string[] = [];
  if (digits(a.number) !== digits(b.number)) out.push('number');
  if ((a.date || '') !== (b.date || '')) out.push('date');
  for (const f of ['net', 'vat', 'total'] as const) if (!eqNum(a[f], b[f])) out.push(f);
  if (digits(a.counterparty.edrpou) !== digits(b.counterparty.edrpou)) out.push('counterparty.edrpou');
  if (a.kind !== b.kind) out.push('kind');
  if (a.items.length !== b.items.length) out.push('items');
  else a.items.forEach((x, i) => {
    const y = b.items[i];
    for (const f of ['qty', 'price', 'amount'] as const) if (!eqNum(x[f], y[f])) out.push(`items[${i}].${f}`);
    if (normStr(x.unit) !== normStr(y.unit)) out.push(`items[${i}].unit`);
  });
  return out;
}

/** Підсумкове читання з двох: основа — узгодженіше, розбіжності в uncertain, впевненість знижується. */
export function reconcile(a: Recognized, b: Recognized): { result: Recognized; diff: string[] } {
  const [base, other] = consistency(b) > consistency(a) ? [b, a] : [a, b];
  const diff = disagreements(base, other);
  const uncertain = [...new Set([...base.uncertain, ...other.uncertain.filter(u => diff.includes(u)), ...diff])];
  const confidence = Math.max(0, Math.min(base.confidence, other.confidence) - diff.length * 10);
  return { result: { ...base, uncertain, confidence, handwritten: base.handwritten || other.handwritten }, diff };
}
