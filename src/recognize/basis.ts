// Підстава платежу і статті руху грошових коштів.
// Платіжка (ПКО, РКО) має посилатися на документи, за якими платимо або отримуємо гроші:
//   вихідна постачальнику: договір → заявка → накладна або акт;
//   вхідна від покупця: договір → рахунок → реалізація;
//   податки й зарплата: нарахування за період.
// Без зовнішніх залежностей: файл використовується в браузері й у скрипті перевірки.
import type { Doc } from '../data';

export type Refs = {
  contract_no?: string | null; contract_date?: string | null; order_no?: string | null;
  invoice_no?: string | null; primary_no?: string | null; period?: string | null;
};

export type BasisStep = { label: string; text: string; ok: boolean; docId?: number; note?: string };

const accN = (acc?: string) => (acc || '').split(' ')[0];
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.replace(/\D/g, '') === b.replace(/\D/g, '') && a.replace(/\D/g, '') !== '';
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const isPrimary = (d: Doc) => /накладн|акт|реаліз/i.test(d.type) && !/податков|ттн/i.test(d.type);
const fmtN = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ['січ', 'лют', 'берез', 'квіт', 'трав', 'черв', 'лип', 'серп', 'верес', 'жовт', 'листоп', 'груд'];
/** Номер місяця (1–12) з тексту «за жовтень 2026», «10.2026», «жовтень». */
export function monthOf(text?: string | null): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  const i = MONTHS.findIndex(m => t.includes(m));
  if (i >= 0) return i + 1;
  const m = t.match(/\b(0?[1-9]|1[0-2])[./](20\d\d)\b/);
  return m ? Number(m[1]) : undefined;
}

/** Ланцюжок підстав для грошового документа. Шукає документи того самого контрагента серед уже внесених. */
export function basisChain(d: Pick<Doc, 'kind' | 'acc' | 'edrpou' | 'cp' | 'sum' | 'id'> & { refs?: Refs }, docs: Doc[]): BasisStep[] {
  const a = accN(d.acc), r = d.refs || {};
  const mine = docs.filter(x => x.id !== d.id && ((d.edrpou && x.edrpou === d.edrpou) || x.cp === d.cp));
  const contract: BasisStep = r.contract_no
    ? { label: 'Договір', text: `№ ${r.contract_no}${r.contract_date ? ' від ' + r.contract_date : ''}`, ok: true }
    : { label: 'Договір', text: 'не вказано в призначенні', ok: false };
  const byNo = (no: string | null | undefined, pred: (x: Doc) => boolean) => no ? mine.find(x => pred(x) && same(x.no, no)) : undefined;
  const step = (label: string, no: string | null | undefined, pred: (x: Doc) => boolean, optional = false): BasisStep => {
    const hit = byNo(no, pred);
    if (hit) return { label, text: `${hit.type} № ${hit.no} від ${hit.date}`, ok: true, docId: hit.id };
    if (no) return { label, text: `№ ${no}: немає в системі`, ok: optional };
    return { label, text: 'не вказано', ok: optional };
  };

  // податки й зарплата: підстава — нарахування за період
  if (['6411', '642', '651', '661'].includes(a)) {
    const mon = monthOf(r.period);
    const pay = docs.find(x => x.kind === 'payroll' && (!mon || monthOf(x.type + ' ' + (x.note || '')) === mon || Number(x.date.split('.')[1]) === mon));
    if (!pay) return [{ label: 'Нарахування', text: `зарплати${r.period ? ' за ' + r.period : ''}: немає в системі`, ok: false }];
    const line = pay.lines.find(l => (a === '661' ? l[1] === '661' : l[1] === a));
    const amount = a === '661' ? pay.lines.filter(l => l[1] === '661').reduce((s, l) => s + l[2], 0) - pay.lines.filter(l => l[0] === '661').reduce((s, l) => s + l[2], 0) : line?.[2];
    const ok = amount != null && near(amount, d.sum);
    return [{ label: 'Нарахування', text: `${pay.type} № ${pay.no}`, ok: true, docId: pay.id },
      { label: 'Сума', text: amount == null ? `у нарахуванні немає рядка на ${a}` : ok ? `${fmtN(d.sum)} ₴ збігається з нарахуванням` : `нараховано ${fmtN(amount)} ₴, сплачено ${fmtN(d.sum)} ₴`, ok }];
  }
  if (a === '6412') return [{ label: 'Декларація з ПДВ', text: r.period ? `за ${r.period}` : 'період не вказано в призначенні', ok: !!r.period }];

  // постачальнику: договір → заявка → накладна або акт
  if (d.kind === 'payment_out' || d.kind === 'cash_out') {
    if (!['631', '371'].includes(a)) return [];
    const order = step('Заявка', r.order_no, x => x.kind === 'order', true);
    let prim = step('Накладна або акт', r.primary_no, x => isPrimary(x) && x.kind !== 'sale');
    if (!prim.docId) {
      const bySum = mine.find(x => isPrimary(x) && x.kind !== 'sale' && near(x.sum, d.sum));
      if (bySum) prim = { label: 'Накладна або акт', text: `${bySum.type} № ${bySum.no} від ${bySum.date} (знайдено за сумою)`, ok: true, docId: bySum.id };
    }
    if (!prim.docId) prim.note = a === '371' ? 'Оплата до отримання товару: аванс постачальнику, 371' : 'Накладної чи акта ще немає: якщо це передоплата, рахунок 371, а не 631';
    else if (a === '371') prim.note = 'Накладна вже є: оплата закриває борг, рахунок 631, а не 371';
    return [contract, order, prim];
  }

  // від покупця: договір → рахунок → реалізація
  if (d.kind === 'payment_in' || d.kind === 'cash_in') {
    if (!['361', '681'].includes(a)) return [];
    const inv = step('Рахунок', r.invoice_no, x => x.kind === 'invoice' || /рахунок/i.test(x.type), true);
    let sale = step('Реалізація', r.primary_no, x => x.kind === 'sale');
    if (!sale.docId) {
      const bySum = mine.find(x => x.kind === 'sale' && near(x.sum, d.sum));
      if (bySum) sale = { label: 'Реалізація', text: `${bySum.type} № ${bySum.no} від ${bySum.date} (знайдено за сумою)`, ok: true, docId: bySum.id };
    }
    if (!sale.docId) sale.note = a === '681' ? 'Відвантаження ще не було: аванс від покупця, 681 і ПДВ з авансу 643/6412' : 'Реалізації ще немає: якщо це передоплата, рахунок 681 і ПДВ першою подією з авансу';
    else if (a === '681') sale.note = 'Реалізація вже є: оплата закриває борг покупця, рахунок 361, а не 681';
    return [contract, inv, sale];
  }
  return [];
}

/** Статті руху грошових коштів (прямий метод, форма № 3 за НП(С)БО 1). */
export const CF_ARTICLES = [
  'Надходження від реалізації продукції (товарів, робіт, послуг)',
  'Надходження авансів від покупців і замовників',
  'Надходження від повернення авансів',
  'Інші надходження',
  'Витрачання на оплату товарів (робіт, послуг)',
  'Витрачання на оплату авансів',
  'Витрачання на оплату праці',
  'Витрачання на оплату відрахувань на соціальні заходи',
  'Витрачання на оплату зобов’язань з податку на прибуток',
  'Витрачання на оплату зобов’язань з ПДВ',
  'Витрачання на оплату зобов’язань з інших податків і зборів (ПДФО, військовий збір)',
  'Інші витрачання',
  'Внутрішнє переміщення коштів (не входить у звіт)'
] as const;

/** Стаття ДДС визначається кореспондуючим рахунком і напрямом, а не вгадується. */
export function cashFlowArticle(kind: string, acc?: string): string | undefined {
  const a = accN(acc), inflow = kind === 'cash_in' || kind === 'payment_in';
  if (!/^(cash|payment)_/.test(kind)) return undefined;
  if (['301', '311', '315', '333'].includes(a)) return CF_ARTICLES[12];
  if (inflow) return a === '361' ? CF_ARTICLES[0] : a === '681' ? CF_ARTICLES[1] : a === '371' ? CF_ARTICLES[2] : CF_ARTICLES[3];
  switch (a) {
    case '631': return CF_ARTICLES[4];
    case '371': return CF_ARTICLES[5];
    case '661': return CF_ARTICLES[6];
    case '651': return CF_ARTICLES[7];
    case '6413': return CF_ARTICLES[8];
    case '6412': return CF_ARTICLES[9];
    case '6411': case '642': return CF_ARTICLES[10];
    default: return CF_ARTICLES[11];
  }
}
