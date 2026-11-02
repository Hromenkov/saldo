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

export function runChecks(r: Recognized, existing: Doc[], today = new Date()): Check[] {
  const out: Check[] = [];
  const code = (r.counterparty.edrpou || '').replace(/\D/g, '');

  if (!code) {
    if (r.kind !== 'receipt') out.push({ ok: false, t: 'На документі не знайдено ЄДРПОУ або ІПН контрагента' });
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

  if (r.uncertain.length) out.push({ ok: false, t: 'Погано читається: ' + r.uncertain.join(', ') });
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
      if (vat) L.push([a.startsWith('70') ? a : '702', '643', vat, 'ПДВ зобов’язання']);
      break;
    case 'tax_invoice':
      if (r.direction === 'incoming') L.push(['641', '644', vat || total, 'Податковий кредит']);
      else L.push(['643', '641', vat || total, 'Податкові зобов’язання з ПДВ']);
      break;
    case 'receipt':
      L.push([a, '372', total, 'Покупка за чеком через підзвітну особу']);
      break;
    default:
      L.push([a, '631', net, r.kind === 'purchase_goods' ? 'Оприбутковано від постачальника' : 'Витрати за документом постачальника']);
      if (vat) L.push(['644', '631', vat, 'ПДВ до отримання ПН']);
  }
  return L;
}

/** Документ готовий до проведення без людини, лише якщо всі перевірки пройдено і модель упевнена. */
export const autoReady = (checks: Check[], conf: number) => checks.every(c => c.ok) && conf >= 85;
