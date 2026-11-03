// Перевірки кодом, а не моделлю: контрольні суми кодів, арифметика, дублікати.
import type { Doc } from '../data';
import type { Recognized } from './schema';

export type Check = { ok: boolean; t: string };

const digits = (s: string) => s.split('').map(Number);

/** Контрольна сума коду ЄДРПОУ (8 цифр) за алгоритмом ДП «Інформаційно-ресурсний центр». */
export function edrpouValid(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false;
  const d = digits(code);
  const n = Number(code);
  const base = n < 30000000 || n > 60000000 ? [1, 2, 3, 4, 5, 6, 7] : [7, 1, 2, 3, 4, 5, 6];
  const sum = (w: number[]) => w.reduce((a, x, i) => a + x * d[i], 0) % 11;
  let r = sum(base);
  if (r >= 10) { r = sum(base.map(x => x + 2)); if (r >= 10) r = 0; }
  return r === d[7];
}

/** Контрольна сума РНОКПП (ІПН фізособи, 10 цифр). */
export function rnokppValid(code: string): boolean {
  if (!/^\d{10}$/.test(code)) return false;
  const d = digits(code);
  const w = [-1, 5, 7, 9, 4, 6, 10, 5, 7];
  const r = ((w.reduce((a, x, i) => a + x * d[i], 0) % 11) + 11) % 11 % 10;
  return r === d[9];
}

const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;
const money = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FIELD: Record<string, string> = {
  direction: 'хто покупець (вхідний чи вихідний документ)', account: 'рахунок обліку', net: 'сума без ПДВ', vat: 'ПДВ', total: 'загальна сума',
  vat_rate: 'ставка ПДВ', number: 'номер', date: 'дата', doc_type: 'тип документа', kind: 'вид операції', currency: 'валюта',
  'counterparty.name': 'назва контрагента', 'counterparty.edrpou': 'ЄДРПОУ/ІПН контрагента', 'counterparty.vat_ipn': 'ІПН платника ПДВ',
  'our_side.name': 'покупець', amount: 'сума', qty: 'кількість', price: 'ціна', name: 'назва товару', unit: 'одиниця'
};
/** Назви полів схеми (items[0].amount) → зрозумілі бухгалтеру (сума в рядку 1). */
export function fieldLabel(f: string): string {
  const m = f.match(/^items\[(\d+)\]\.?(\w+)?$/);
  if (m) return `${FIELD[m[2] || ''] || 'рядок'} в рядку ${Number(m[1]) + 1}`;
  return FIELD[f] || FIELD[f.split('.').pop() || ''] || f;
}

const norm = (s: string) => s.toLowerCase().replace(/тов|фоп|прат|пат|ат|«|»|"|'|\s|\./g, '');
const sameCompany = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

export function runChecks(r: Recognized, existing: Doc[], today = new Date(), company = ''): Check[] {
  const out: Check[] = [];
  const code = (r.counterparty.edrpou || '').replace(/\D/g, '');
  const ipn = (r.counterparty.vat_ipn || '').replace(/\D/g, '');

  if (!code && ipn.length === 12) {
    // у податковій накладній є лише ІПН платника ПДВ (12 цифр); перші 7–8 цифр збігаються з ЄДРПОУ, окремої контрольної суми немає
    out.push({ ok: true, t: `ІПН платника ПДВ ${ipn}: 12 цифр, звірте з реєстром платників ПДВ` });
  } else if (code.length === 12) {
    out.push({ ok: true, t: `ІПН платника ПДВ ${code}: 12 цифр, звірте з реєстром платників ПДВ` });
  } else if (!code) {
    // у ПКО і РКO з фізособою (підзвіт, зарплата) коду може не бути
    const person = (r.kind === 'cash_in' || r.kind === 'cash_out') && /^(372|661)/.test(r.account);
    if (r.kind !== 'receipt' && !person) out.push({ ok: false, t: 'На документі не знайдено ЄДРПОУ або ІПН контрагента' });
  } else if (code.length === 8) {
    out.push(edrpouValid(code)
      ? { ok: true, t: `ЄДРПОУ ${code}: контрольна сума вірна` }
      : { ok: false, t: `ЄДРПОУ ${code} не проходить контрольну суму, можлива помилка в цифрах` });
  } else if (code.length === 10) {
    out.push(rnokppValid(code)
      ? { ok: true, t: `ІПН ${code}: контрольна сума вірна` }
      : { ok: false, t: `ІПН ${code} не проходить контрольну суму, можлива помилка в цифрах` });
  } else {
    out.push({ ok: false, t: `Код контрагента «${code}» не схожий ні на ЄДРПОУ, ні на ІПН` });
  }

  const { net, vat, total } = r;
  if (total == null) out.push({ ok: false, t: 'Не знайдено загальну суму документа' });

  const lineSum = r.items.reduce((a, x) => a + (x.amount ?? 0), 0);
  if (r.items.length && r.items.every(x => x.amount != null) && net != null) {
    out.push(near(lineSum, net, 1)
      ? { ok: true, t: `Сума рядків (${r.items.length}) дорівнює сумі без ПДВ` }
      : { ok: false, t: `Сума рядків ${money(lineSum)} ₴ не дорівнює сумі без ПДВ ${money(net)} ₴` });
  }

  if (net != null && vat != null && total != null && r.kind !== 'tax_invoice') {
    out.push(near(net + vat, total)
      ? { ok: true, t: 'Сума без ПДВ + ПДВ = всього до сплати' }
      : { ok: false, t: `${money(net)} + ${money(vat)} ≠ ${money(total)} ₴: арифметика не сходиться` });
  }

  if (net != null && vat != null && vat > 0 && r.vat_rate) {
    const expect = Math.round(net * r.vat_rate) / 100;
    out.push(near(expect, vat, 1)
      ? { ok: true, t: `ПДВ ${r.vat_rate}% розраховано правильно` }
      : { ok: false, t: `ПДВ ${money(vat)} ₴ не дорівнює ${r.vat_rate}% від ${money(net)} ₴` });
  }

  if (r.date) {
    const d = new Date(r.date + 'T00:00:00');
    const days = (today.getTime() - d.getTime()) / 864e5;
    if (isNaN(days)) out.push({ ok: false, t: `Дату «${r.date}» не вдалося прочитати` });
    else if (days < -1) out.push({ ok: false, t: 'Дата документа в майбутньому' });
    else if (days > 365) out.push({ ok: false, t: 'Документ старший за рік: перевірте період' });
  } else out.push({ ok: false, t: 'Не знайдено дату документа' });

  if (r.number) {
    const dup = existing.find(x => x.no === r.number && ((code && x.edrpou === code) || x.cp === r.counterparty.name));
    if (dup) out.push({ ok: false, t: `Схоже на дублікат: ${dup.type} № ${dup.no} вже є в системі` });
  } else out.push({ ok: false, t: 'Не знайдено номер документа' });

  if (r.currency && r.currency.toUpperCase() !== 'UAH' && r.currency !== '₴' && r.currency.toLowerCase() !== 'грн') {
    out.push({ ok: false, t: `Валюта ${r.currency}: потрібен перерахунок за курсом НБУ` });
  }

  const NOT_POSTING: Partial<Record<Recognized['kind'], string>> = {
    invoice: 'Рахунок на оплату — не первинний документ: проводки будуть за накладною або актом',
    order: 'Заявка (замовлення) — не первинний документ: проводки будуть за накладною або актом',
    tax_invoice: 'Податкова накладна — податковий документ: проводок не створює, звіримо з ЄРПН',
    receipt: 'Чек — додаток до авансового звіту: проводок не створює',
    other: 'Це не накладна і не акт: проводок не створює'
  };
  if (NOT_POSTING[r.kind]) out.push({ ok: false, t: NOT_POSTING[r.kind]! });
  const ours = (r.our_side?.name || '').trim();
  if (ours && company && !sameCompany(ours, company)) out.push({ ok: false, t: `У документі наша сторона — ${ours}, а не ${company}. Перевірте, чи це документ вашої компанії` });
  if (r.uncertain.length) out.push({ ok: false, t: 'Перевірте вручну: ' + [...new Set(r.uncertain.map(fieldLabel))].join(', ') });
  return out;
}

const accNo = (acc: string) => acc.split(' ')[0];

/** Типові проводки за видом документа. Рахунок витрат або доходу вже обраний (моделлю, правилом або людиною). */
export function postings(r: Recognized, acc: string): Doc['lines'] {
  const total = r.total ?? 0, vat = r.vat ?? 0, net = r.net ?? total - vat;
  const a = accNo(acc);
  const L: Doc['lines'] = [];
  switch (r.kind) {
    case 'sale':
      L.push(['361', a.startsWith('70') ? a : '702', total, 'Дохід від реалізації']);
      if (vat) L.push([a.startsWith('70') ? a : '702', '6412', vat, 'ПДВ зобов’язання (перша подія — відвантаження)']);
      break;
    case 'purchase_goods':
    case 'purchase_service':
      L.push([a, '631', net, r.kind === 'purchase_goods' ? 'Оприбутковано від постачальника' : 'Витрати за документом постачальника']);
      if (vat) L.push(['6441', '631', vat, 'ПДВ до отримання ПН']);
      break;
    // гроші: ПКО і РКО через касу 301, платіжки через рахунок 311; сума — всього до сплати, ПДВ окремо не проводиться
    case 'cash_in':
      L.push(['301', a, total, 'ПКО: надходження в касу']);
      break;
    case 'cash_out':
      L.push([a, '301', total, 'РКО: видача з каси']);
      break;
    case 'payment_in':
      L.push(['311', a, total, 'Надходження на поточний рахунок']);
      if (a === '681' && vat) L.push(['643', '6412', vat, 'ПДВ з отриманого авансу']);
      break;
    case 'payment_out':
      // ПДВ сплачується лише з електронного рахунку ПДВ (315), не з поточного
      L.push([a, a === '6412' ? '315' : '311', total, a === '6412' ? 'Сплата ПДВ з електронного рахунку' : 'Оплата з поточного рахунку']);
      break;
    default:
      break; // товари й послуги проводяться лише за накладною або актом; рахунок, заявка, ПН, ТТН, чек проводок не створюють
  }
  return L;
}

/** Документ готовий до проведення без людини, лише якщо всі перевірки пройдено і модель упевнена. */
export const autoReady = (checks: Check[], conf: number) => checks.every(c => c.ok) && conf >= 85;
