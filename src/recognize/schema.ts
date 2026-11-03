// Схема, яку повертає розпізнавання. Спільна для серверної функції і браузера.
import { z } from 'zod';
import { ACCOUNTS, DOC_KINDS } from './accounts';

export const Recognized = z.object({
  doc_type: z.string().describe('Назва типу документа українською, як у бухгалтерії: «Видаткова накладна», «Рахунок на оплату», «Акт наданих послуг», «Податкова накладна», «Фіскальний чек», «ТТН» тощо'),
  kind: z.enum(DOC_KINDS).describe('purchase_goods: купуємо товари чи матеріали; purchase_service: купуємо роботи чи послуги, комуналку, оренду; sale: ми продаємо; tax_invoice: податкова накладна; receipt: касовий чек; other: інше'),
  direction: z.enum(['incoming', 'outgoing']).describe('incoming, якщо наша компанія покупець або отримувач; outgoing, якщо наша компанія продавець'),
  number: z.string().nullable().describe('Номер документа точно як надруковано'),
  date: z.string().nullable().describe('Дата документа у форматі YYYY-MM-DD'),
  counterparty: z.object({
    name: z.string().nullable().describe('Назва контрагента (не нашої компанії) з організаційно-правовою формою, лапки «»'),
    edrpou: z.string().nullable().describe('Код ЄДРПОУ (8 цифр) або РНОКПП/ІПН ФОП (10 цифр) контрагента, лише цифри, як надруковано'),
    vat_ipn: z.string().nullable().describe('Індивідуальний податковий номер платника ПДВ (12 цифр), якщо є')
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
  uncertain: z.array(z.string()).describe('Назви полів, які погано читаються, відсутні або сумнівні'),
  note: z.string().nullable().describe('Коротке зауваження українською для бухгалтера, якщо щось незвичне; інакше null')
});

export type Recognized = z.infer<typeof Recognized>;

export type RecognizeRequest = { name: string; mime: string; data: string; company: string };
export type RecognizeResponse = { ok: true; result: Recognized; model: string } | { ok: false; error: string };
