// Перевірка плану рахунків: усі шаблони операцій, демо-документи і типові проводки розпізнавання
// мають використовувати рахунки з плану і допустимі кореспонденції. Запуск: npm test
import { OPS, DOCS } from '../src/data';
import { CHART, checkLines, fitsKind, purposeAccount, TAX_PURPOSE } from '../src/recognize/chart';
import { ruleKey } from '../src/recognize/rules';
import { basisChain, cashFlowArticle, monthOf } from '../src/recognize/basis';
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
for (const k of ['invoice', 'order', 'tax_invoice', 'receipt', 'other'] as const) ok(P(k, '92 Адміністративні витрати').length === 0, `${k}: проводок немає`);
for (const k of ['purchase_goods', 'purchase_service', 'sale', 'cash_in', 'cash_out', 'payment_in', 'payment_out'] as const) for (const a of ACCOUNTS) if (fitsKind(k, a)) ok(!checkLines(P(k, a)).length, `${k} + ${a.split(' ')[0]}: кореспонденції допустимі`);

const pay = OPS.find(o => o[1] === 'Нарахування зарплати')![3];
ok(pay.some(l => l[0] === '661' && l[1] === '6411'), 'Зарплата: ПДФО Дт 661 Кт 6411');
ok(pay.some(l => l[0] === '661' && l[1] === '642'), 'Зарплата: військовий збір Дт 661 Кт 642');
ok(pay.some(l => l[1] === '651'), 'Зарплата: ЄСВ на 651');
ok(checkLines([['92', '641', 0, '']]).length > 0, 'Неіснуючий субрахунок 641 без деталізації відхиляється');
ok(checkLines([['91', '6411', 0, '']]).length > 0, 'Недопустима пара Дт 91 Кт 6411 відхиляється');

// касові ордери і платіжки
const pko = P('cash_in', '361 Розрахунки з вітчизняними покупцями');
ok(JSON.stringify(pko.map(l => [l[0], l[1], l[2]])) === JSON.stringify([['301', '361', 1200]]), 'ПКО від покупця: Дт 301 Кт 361 1200');
const rko = P('cash_out', '372 Розрахунки з підзвітними особами');
ok(rko[0][0] === '372' && rko[0][1] === '301', 'РКО під звіт: Дт 372 Кт 301');
const pin = P('payment_in', '681 Розрахунки за авансами одержаними');
ok(JSON.stringify(pin.map(l => [l[0], l[1], l[2]])) === JSON.stringify([['311', '681', 1200], ['643', '6412', 200]]), 'Аванс від покупця: Дт 311 Кт 681, ПДВ Дт 643 Кт 6412');
const pout = P('payment_out', '6411 Розрахунки з ПДФО');
ok(pout[0][0] === '6411' && pout[0][1] === '311', 'Сплата ПДФО: Дт 6411 Кт 311');
ok(!fitsKind('cash_out', '92 Адміністративні витрати'), 'РКО не може йти напряму на 92');
ok(!fitsKind('payment_out', '201 Сировина й матеріали'), 'Платіжка не може йти на 201');
ok(TAX_PURPOSE['6411'].test('*;101;12345678;ПДФО із зарплати за жовтень 2026') && !TAX_PURPOSE['642'].test('ПДФО із зарплати'), 'Призначення «ПДФО» розпізнається як 6411, не 642');
ok(purposeAccount('Військовий збір за жовтень') === '642', 'Призначення «Військовий збір» → 642');
ok(purposeAccount('*;101;00032129;ПДФО із зарплати за жовтень') === '6411', '«ПДФО із зарплати» → 6411, а не 661');
ok(purposeAccount('Заробітна плата за жовтень 2026') === '661', '«Заробітна плата» → 661');
ok(purposeAccount('ЄСВ із зарплати за жовтень') === '651', '«ЄСВ із зарплати» → 651');
ok(purposeAccount('Оплата за товар згідно рах. 356') === undefined, 'Оплата постачальнику не є податком');
ok(TAX_PURPOSE['651'].test('ЄСВ за жовтень 2026'), 'Призначення «ЄСВ» → 651');
ok(ruleKey('12345678', 'payment_out') !== ruleKey('12345678', 'purchase_goods'), 'Правило для платіжок окреме від правила для накладних');

// підстава платежу і статті ДДС
const act = DOCS.find(d => d.no === '1532')!;
const ch1 = basisChain({ id: 0, kind: 'payment_out', acc: '631', edrpou: undefined, cp: act.cp, sum: act.sum, refs: { contract_no: '7', primary_no: '1532' } }, DOCS);
ok(ch1.find(s => s.label === 'Накладна або акт')?.docId === act.id, 'Платіжка постачальнику знаходить акт № 1532');
const ch2 = basisChain({ id: 0, kind: 'payment_out', acc: '631', edrpou: undefined, cp: 'ТОВ «Новий»', sum: 500, refs: {} }, DOCS);
ok(!!ch2.find(s => s.note?.includes('371')), 'Без накладної система підказує аванс 371');
const ch3 = basisChain({ id: 0, kind: 'payment_out', acc: '6411', edrpou: undefined, cp: 'ГУ ДПС', sum: 4320, refs: { period: 'жовтень 2026' } }, DOCS);
ok(ch3.every(s => s.ok), 'ПДФО 4320 за жовтень збігається з нарахуванням');
const ch4 = basisChain({ id: 0, kind: 'payment_out', acc: '6411', edrpou: undefined, cp: 'ГУ ДПС', sum: 4000, refs: { period: 'жовтень 2026' } }, DOCS);
ok(ch4.some(s => !s.ok), 'ПДФО 4000 замість 4320 позначається розбіжністю');
ok(monthOf('за жовтень 2026') === 10 && monthOf('10.2026') === 10, 'Період «жовтень 2026» і «10.2026» → 10');
ok(JSON.stringify(P('payment_out', '6412 Розрахунки з ПДВ').map(l => [l[0], l[1]])) === JSON.stringify([['6412', '315']]), 'ПДВ сплачується з електронного рахунку: Дт 6412 Кт 315');
ok(JSON.stringify(P('payment_out', '315 Електронний рахунок ПДВ').map(l => [l[0], l[1]])) === JSON.stringify([['315', '311']]), 'Поповнення рахунку ПДВ: Дт 315 Кт 311');
ok(checkLines([['6412', '311', 0, '']]).length > 0, 'ПДВ з поточного рахунку Дт 6412 Кт 311 відхиляється');
ok(cashFlowArticle('payment_out', '651') === 'Витрачання на оплату відрахувань на соціальні заходи', 'Стаття ДДС для ЄСВ');
ok(cashFlowArticle('payment_in', '681') === 'Надходження авансів від покупців і замовників', 'Стаття ДДС для авансу від покупця');
ok(cashFlowArticle('payment_out', '315')!.startsWith('Внутрішнє'), 'Поповнення рахунку ПДВ — внутрішнє переміщення');

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
