// Схема, яку повертає розпізнавання. Спільна для серверної функції і браузера.
import { z } from 'zod';
import { ACCOUNTS, DOC_KINDS } from './accounts';

const build = (wire: boolean) => {
  // у схемі для моделі текстові поля — звичайні рядки ("" = немає): API допускає не більше 16 полів-об’єднань (nullable)
  const str = (d: string) => wire ? z.string().describe(d + '. Порожній рядок "", якщо немає') : z.string().nullable().describe(d);
  return z.object({
  doc_type: z.string().describe('Заголовок документа точно як надруковано (наприклад «Рахунок № 356» → «Рахунок»). '+'Назва типу документа українською, як у бухгалтерії: «Видаткова накладна», «Рахунок на оплату», «Акт наданих послуг», «Податкова накладна», «Фіскальний чек», «ТТН» тощо'),
  kind: z.enum(DOC_KINDS).describe('Первинні документи лише два: накладна і акт. purchase_goods: накладна, ми отримуємо товари чи матеріали; purchase_service: акт, ми отримуємо роботи чи послуги; sale: ми продаємо (видаткова накладна чи акт від нас); invoice: рахунок на оплату, рахунок-фактура (не первинний документ, лише вимога оплатити); order: заявка, замовлення (проводок не створює); tax_invoice: податкова накладна; receipt: касовий чек; cash_in: прибутковий касовий ордер (ПКО); cash_out: видатковий касовий ордер (РКО); payment_in: платіжна інструкція чи доручення, гроші надходять нам; payment_out: платіжна інструкція чи доручення, ми платимо; other: інше'),
  direction: z.enum(['incoming', 'outgoing']).describe('incoming, якщо наша компанія покупець або отримувач; outgoing, якщо наша компанія продавець'),
  number: str('Номер документа точно як надруковано'),
  date: str('Дата документа у форматі YYYY-MM-DD'),
  counterparty: z.object({
    name: str('Назва контрагента (не нашої компанії) з організаційно-правовою формою, лапки «»'),
    edrpou: str('Код ЄДРПОУ (8 цифр) або РНОКПП/ІПН ФОП (10 цифр) контрагента, лише цифри, як надруковано'),
    vat_ipn: str('Індивідуальний податковий номер платника ПДВ (12 цифр), якщо є')
  }),
  our_side: z.object({
    name: str('Назва нашої сторони, як надруковано в документі (покупець для вхідних, продавець для вихідних)'),
    code: str('ЄДРПОУ або ІПН нашої сторони, лише цифри')
  }),
  items: z.array(z.object({
    name: z.string(),
    qty: z.number().nullable(),
    unit: str('Одиниця виміру як написано: кг, шт, л, уп'),
    price: z.number().nullable(),
    amount: z.number().nullable().describe('Сума рядка без ПДВ, як надруковано')
  })),
  net: z.number().nullable().describe('Сума без ПДВ, грн'),
  vat: z.number().nullable().describe('Сума ПДВ, грн; 0 якщо «без ПДВ»'),
  total: z.number().nullable().describe('Всього до сплати з ПДВ, грн'),
  vat_rate: z.number().nullable().describe('Ставка ПДВ у відсотках: 20, 14, 7 або 0; null, якщо ставок кілька'),
  currency: z.string().describe('Валюта, зазвичай UAH'),
  account: z.enum(ACCOUNTS).describe('Для накладної й акта — рахунок витрат або доходу. Для ПКО, РКО і платіжок — кореспондуючий рахунок до каси 301 чи банку 311 (361, 681, 631, 371, 372, 661, 6411, 6412, 642, 651, 685, 333, 311, 301)'),
  refs: z.object({
    contract_no: str('Номер договору, на який посилається документ або призначення платежу'),
    contract_date: str('Дата договору, як надруковано'),
    order_no: str('Номер заявки чи замовлення'),
    invoice_no: str('Номер рахунку на оплату'),
    primary_no: str('Номер накладної, акта чи реалізації, за якими платять'),
    period: str('Період для податків і зарплати, як у призначенні: «жовтень 2026», «10.2026»')
  }).describe('Підстави документа: на що посилається платіжка, ордер чи накладна'),
  purpose: str('Призначення платежу або підстава ордера, дослівно як надруковано'),
  account_sure: z.boolean().describe('true лише якщо зміст документа однозначно визначає рахунок; якщо сумнів між 23, 91, 92, 93, 949 або між 201, 22, 281, 152 — false'),
  account_reason: z.string().describe('Одне коротке речення українською, чому саме цей рахунок'),
  handwritten: z.boolean().describe('true, якщо номер, дата, суми або кількості на документі вписані від руки'),
  confidence: z.number().describe('Впевненість у розпізнаванні від 0 до 100'),
  uncertain: z.array(z.string()).describe('Поля, які погано читаються, відсутні на документі або сумнівні; назви полів схеми (net, items[0].amount)'),
  margin_notes: str('Рукописні приписки на полях і поверх бланку (телефон, ім’я, «оплачено», «борг» тощо), дослівно, через «; ». Нерозбірливе слово чи цифру познач знаком «?» після неї'),
  note: str('Коротке зауваження українською для бухгалтера, якщо щось незвичне')
});
};

export const Recognized = build(false);
/** Схема, яку бачить модель: менше nullable-полів. Відповідь переводиться в Recognized через fromWire. */
export const RecognizedWire = build(true);
export type Recognized = z.infer<typeof Recognized>;
export type RecognizedWire = z.infer<typeof RecognizedWire>;

const nul = (v: string | null | undefined) => (v == null || !v.trim() ? null : v);
/** Порожні рядки зі схеми моделі → null, як чекає решта коду. */
export function fromWire(w: RecognizedWire): Recognized {
  return {
    ...w,
    number: nul(w.number), date: nul(w.date), purpose: nul(w.purpose), margin_notes: nul(w.margin_notes), note: nul(w.note),
    counterparty: { name: nul(w.counterparty.name), edrpou: nul(w.counterparty.edrpou), vat_ipn: nul(w.counterparty.vat_ipn) },
    our_side: { name: nul(w.our_side.name), code: nul(w.our_side.code) },
    items: w.items.map(it => ({ ...it, unit: nul(it.unit) })),
    refs: Object.fromEntries(Object.entries(w.refs).map(([k, v]) => [k, nul(v)])) as Recognized['refs']
  };
}

export type RecognizeRequest = { name: string; mime: string; data: string; company: string };
/** passes — скільки незалежних читань зроблено (для фото два), diff — поля, де вони розійшлися. */
export type RecognizeResponse = { ok: true; result: Recognized; model: string; passes?: number; diff?: string[] } | { ok: false; error: string };
