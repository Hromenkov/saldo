// Схема, яку повертає розпізнавання. Спільна для серверної функції і браузера.
import { z } from 'zod';
import { ACCOUNTS, DOC_KINDS } from './accounts';

export const Recognized = z.object({
  doc_type: z.string().describe('Заголовок документа точно як надруковано (наприклад «Рахунок № 356» → «Рахунок»). '+'Назва типу документа українською, як у бухгалтерії: «Видаткова накладна», «Рахунок на оплату», «Акт наданих послуг», «Податкова накладна», «Фіскальний чек», «ТТН» тощо'),
  kind: z.enum(DOC_KINDS).describe('Первинні документи лише два: накладна і акт. purchase_goods: накладна, ми отримуємо товари чи матеріали; purchase_service: акт, ми отримуємо роботи чи послуги; sale: ми продаємо (видаткова накладна чи акт від нас); invoice: рахунок на оплату, рахунок-фактура (не первинний документ, лише вимога оплатити); tax_invoice: податкова накладна; receipt: касовий чек; other: інше'),
  direction: z.enum(['incoming', 'outgoing']).describe('incoming, якщо наша компанія покупець або отримувач; outgoing, якщо наша компанія продавець'),
  number: z.string().nullable().describe('Номер документа точно як надруковано'),
  date: z.string().nullable().describe('Дата документа у форматі YYYY-MM-DD'),
  counterparty: z.object({
    name: z.string().nullable().describe('Назва контрагента (не нашої компанії) з організаційно-правовою формою, лапки «»'),
    edrpou: z.string().nullable().describe('Код ЄДРПОУ (8 цифр) або РНОКПП/ІПН ФОП (10 цифр) контрагента, лише цифри, як надруковано'),
    vat_ipn: z.string().nullable().describe('Індивідуальний податковий номер платника ПДВ (12 цифр), якщо є')
  }),
  our_side: z.object({
    name: z.string().nullable().describe('Назва нашої сторони, як надруковано в документі (покупець для вхідних, продавець для вихідних)'),
    code: z.string().nullable().describe('ЄДРПОУ або ІПН нашої сторони, лише цифри')
  }),
  items: z.array(z.object({
    name: z.string(),
    qty: z.number().nullable(),
    unit: z.string().nullable(),
    price: z.number().nullable(),
    amount: z.number().nullable().describe('Сума рядка без ПДВ, як надруковано')
  })),
  net: z.number().nullable().describe('Сума без ПДВ, грн'),
  vat: z.number().nullable().describe('Сума ПДВ, грн; 0 якщо «без ПДВ»'),
  total: z.number().nullable().describe('Всього до сплати з ПДВ, грн'),
  vat_rate: z.number().nullable().describe('Ставка ПДВ у відсотках: 20, 14, 7 або 0; null, якщо ставок кілька'),
  currency: z.string().describe('Валюта, зазвичай UAH'),
  account: z.enum(ACCOUNTS).describe('Найімовірніший рахунок обліку для витрат або доходу за цим документом'),
  account_reason: z.string().describe('Одне коротке речення українською, чому саме цей рахунок'),
  handwritten: z.boolean().describe('true, якщо номер, дата, суми або кількості на документі вписані від руки'),
  confidence: z.number().describe('Впевненість у розпізнаванні від 0 до 100'),
  uncertain: z.array(z.string()).describe('Поля, які погано читаються, відсутні на документі або сумнівні; назви полів схеми (net, items[0].amount)'),
  note: z.string().nullable().describe('Коротке зауваження українською для бухгалтера, якщо щось незвичне; інакше null')
});

export type Recognized = z.infer<typeof Recognized>;

export type RecognizeRequest = { name: string; mime: string; data: string; company: string };
export type RecognizeResponse = { ok: true; result: Recognized; model: string } | { ok: false; error: string };
