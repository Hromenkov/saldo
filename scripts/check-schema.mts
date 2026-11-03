// API структурованого виводу допускає не більше 16 параметрів-об’єднань (nullable, anyOf, масив типів). Перевищення — 400 на кожному завантаженні.
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { RecognizedWire, fromWire } from '../src/recognize/schema';

const LIMIT = 16;
const f: any = betaZodOutputFormat(RecognizedWire);
const unions: string[] = [];
const walk = (o: any, p = '') => { if (o && typeof o === 'object') { if (Array.isArray(o.type) || o.anyOf || o.oneOf) unions.push(p); for (const k in o) walk(o[k], p + '.' + k); } };
walk(f.schema ?? f);
let fails = 0;
const ok = (c: boolean, t: string) => { console.log(`${c ? '✓' : '✗'} ${t}`); if (!c) fails++; };
ok(unions.length <= LIMIT, `Схема для моделі: ${unions.length} полів-об’єднань (межа API ${LIMIT})${unions.length > LIMIT ? ': ' + unions.join(', ') : ''}`);
const w = RecognizedWire.parse({ doc_type: 'Накладна', kind: 'purchase_goods', direction: 'incoming', number: '', date: '2026-08-22',
  counterparty: { name: 'ФОП Бригар', edrpou: '', vat_ipn: '' }, our_side: { name: '', code: '' },
  items: [{ name: 'Сир', qty: 1, unit: '', price: 1, amount: 1 }], net: 1, vat: 0, total: 1, vat_rate: null, currency: 'UAH', account: '201 Сировина й матеріали',
  refs: { contract_no: '', contract_date: '', order_no: '', invoice_no: '', primary_no: '', period: '' }, purpose: '', account_sure: true,
  account_reason: '', handwritten: true, confidence: 90, uncertain: [], margin_notes: ' ', note: '' });
const r = fromWire(w);
ok(r.number === null && r.counterparty.edrpou === null && r.items[0].unit === null && r.refs.period === null && r.margin_notes === null, 'Порожні рядки від моделі стають null');
ok(r.counterparty.name === 'ФОП Бригар' && r.date === '2026-08-22', 'Заповнені поля не змінюються');
console.log(fails ? `\nПомилок: ${fails}` : '\nСхема розпізнавання в межах API');
process.exit(fails ? 1 : 0);
