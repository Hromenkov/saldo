// Перевірка плану рахунків: усі шаблони операцій, демо-документи і типові проводки розпізнавання
// мають використовувати рахунки з плану і допустимі кореспонденції. Запуск: npm test
import { OPS, DOCS } from '../src/data';
import { CHART, checkLines, fitsKind } from '../src/recognize/chart';
import { postings } from '../src/recognize/checks';
import { ACCOUNTS } from '../src/recognize/accounts';
import type { Recognized } from '../src/recognize/schema';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };

for (const o of OPS) {
  const issues = checkLines(o[3]);
  ok(!issues.length, `Шаблон «${o[1]}»` + (issues.length ? ': ' + issues.map(x => x.t).join('; ') : ''));
}
for (const d of DOCS) {
  const issues = checkLines(d.lines);
  ok(!issues.length, `Демо ${d.type} № ${d.no}` + (issues.length ? ': ' + issues.map(x => x.t).join('; ') : ''));
}
for (const a of ACCOUNTS) ok(!!CHART[a.split(' ')[0]], `Рахунок зі списку вибору ${a} є в плані`);

const base = { doc_type: '', direction: 'incoming', number: '1', date: '2026-11-01', counterparty: { name: '', edrpou: null, vat_ipn: null }, our_side: { name: '', code: null },
  items: [], net: 1000, vat: 200, total: 1200, vat_rate: 20, currency: 'UAH', account_reason: '', handwritten: false, confidence: 99, uncertain: [], note: '' } as unknown as Recognized;
const P = (kind: Recognized['kind'], acc: string) => postings({ ...base, kind } as Recognized, acc);

// ключові податкові проводки: перевіряємо точні рахунки й суми
const buy = P('purchase_goods', '201 Сировина й матеріали');
ok(JSON.stringify(buy.map(l => [l[0], l[1], l[2]])) === JSON.stringify([['201', '631', 1000], ['6441', '631', 200]]), 'Закупівля товару: Дт 201 Кт 631 1000, Дт 6441 Кт 631 200');
const svc = P('purchase_service', '92 Адміністративні витрати');
ok(svc[0][0] === '92' && svc[1][0] === '6441', 'Послуга: витрати на обраний рахунок 92, ПДВ на 6441');
const sale = P('sale', '703 Дохід від реалізації робіт і послуг');
ok(JSON.stringify(sale.map(l => [l[0], l[1], l[2]])) === JSON.stringify([['361', '703', 1200], ['703', '6412', 200]]), 'Продаж: Дт 361 Кт 703 1200, Дт 703 Кт 6412 200');
for (const k of ['invoice', 'tax_invoice', 'receipt', 'other'] as const) ok(P(k, '92 Адміністративні витрати').length === 0, `${k}: проводок немає`);
for (const k of ['purchase_goods', 'purchase_service', 'sale'] as const) for (const a of ACCOUNTS) if (fitsKind(k, a)) ok(!checkLines(P(k, a)).length, `${k} + ${a.split(' ')[0]}: кореспонденції допустимі`);

const pay = OPS.find(o => o[1] === 'Нарахування зарплати')![3];
ok(pay.some(l => l[0] === '661' && l[1] === '6411'), 'Зарплата: ПДФО Дт 661 Кт 6411');
ok(pay.some(l => l[0] === '661' && l[1] === '642'), 'Зарплата: військовий збір Дт 661 Кт 642');
ok(pay.some(l => l[1] === '651'), 'Зарплата: ЄСВ на 651');
ok(checkLines([['92', '641', 0, '']]).length > 0, 'Неіснуючий субрахунок 641 без деталізації відхиляється');
ok(checkLines([['91', '6411', 0, '']]).length > 0, 'Недопустима пара Дт 91 Кт 6411 відхиляється');

// ланцюжки капіталу, ОЗ, кредитів, валюти і прибутку
ok(!checkLines([['46', '40', 0, ''], ['311', '46', 0, '']]).length, 'Статутний капітал: Дт 46 Кт 40, Дт 311 Кт 46');
ok(!checkLines([['152', '631', 0, ''], ['104', '152', 0, ''], ['92', '131', 0, ''], ['131', '104', 0, ''], ['976', '104', 0, '']]).length, 'ОЗ: придбання → введення → амортизація → ліквідація');
ok(checkLines([['131', '92', 0, '']]).length > 0, 'Сторно-напрям амортизації Дт 131 Кт 92 відхиляється');
ok(!checkLines([['311', '601', 0, ''], ['951', '684', 0, ''], ['684', '311', 0, ''], ['601', '311', 0, '']]).length, 'Кредит: отримання, відсотки, погашення');
ok(!checkLines([['632', '312', 0, ''], ['945', '632', 0, ''], ['632', '714', 0, '']]).length, 'Курсові різниці: 945 / 714');
ok(!checkLines([['791', '441', 0, ''], ['443', '671', 0, ''], ['671', '6411', 0, ''], ['671', '642', 0, '']]).length, 'Розподіл прибутку і дивіденди з ПДФО та ВЗ');
ok(checkLines([['40', '311', 0, '']]).length > 0, 'Виплата грошей зі статутного капіталу напряму відхиляється');

console.log(fails ? `\nПомилок: ${fails}` : '\nУсі перевірки плану рахунків пройдено');
process.exit(fails ? 1 : 0);
