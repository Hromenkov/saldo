// Перевірка ПДВ: перша подія, РК, строки ЄРПН, штрафи, ліміт СЕА, декларація. Запуск: npm test
import { addDays, canMove, declarationDraft, firstEvent, inboundLines, penalty, registrationDeadline, seaLimit, seaLines, toXmlData, topUpNeeded, vatIn, type SaleContract } from '../src/vat/rules';
import { ISSUED, RECEIVED } from '../src/vat/demo';
import { checkLines } from '../src/recognize/chart';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const num = () => { let n = 0; return () => String(++n); };
const C = (events: SaleContract['events'], ipn: string | null = '123456789012'): SaleContract => ({ id: 'D1', buyer: 'Покупець', buyerIpn: ipn, contract: '1', rate: 20, revenue: '702', events });
const net = (lines: [string, string, number, string][], acc: string, side: 0 | 1) => Math.round(lines.filter(l => l[side] === acc).reduce((s, l) => s + l[2], 0) * 100) / 100;

ok(vatIn(1200, 20) === 200 && vatIn(1070, 7) === 70 && vatIn(1000, 0) === 0, 'ПДВ у сумі з ПДВ: 20%, 7%, 0%');

// 1. Спочатку відвантаження, потім оплата: одна ПН на дату відвантаження
let r = firstEvent(C([{ date: '2026-11-03', type: 'shipment', amount: 1200, doc: 'ВН 1' }, { date: '2026-11-10', type: 'payment', amount: 1200, doc: 'оплата' }]), num());
ok(r.docs.length === 1 && r.docs[0].kind === 'pn' && r.docs[0].date === '2026-11-03' && r.docs[0].vat === 200 && r.docs[0].base === 1000, 'Відвантаження першим: ПН на 03.11, база 1000, ПДВ 200');
ok(eq(r.lines.map(l => [l[0], l[1], l[2]]), [['702', '6412', 200]]), 'Відвантаження першим: Дт 702 Кт 6412 200, оплата проводок ПДВ не дає');

// 2. Передоплата, потім відвантаження: ПН на аванс, при відвантаженні ПДВ з 643 закривається
r = firstEvent(C([{ date: '2026-11-05', type: 'payment', amount: 1200, doc: 'аванс' }, { date: '2026-11-12', type: 'shipment', amount: 1200, doc: 'ВН 2' }]), num());
ok(r.docs.length === 1 && r.docs[0].date === '2026-11-05' && r.docs[0].cause === 'payment', 'Передоплата першою: ПН на дату оплати');
ok(eq(r.lines.map(l => [l[0], l[1], l[2]]), [['643', '6412', 200], ['702', '643', 200]]), 'Передоплата: Дт 643 Кт 6412, при відвантаженні Дт 702 Кт 643');

// 3. Частковий аванс і більше відвантаження: друга ПН лише на різницю
r = firstEvent(C([{ date: '2026-11-05', type: 'payment', amount: 600, doc: 'аванс' }, { date: '2026-11-12', type: 'shipment', amount: 1800, doc: 'ВН 3' }]), num());
ok(eq(r.docs.map(d => [d.no, d.vat]), [['1', 100], ['2', 200]]), 'Аванс 600 + відвантаження 1800: ПН № 1 на 100 ПДВ, ПН № 2 на 200 ПДВ');
ok(net(r.lines, '6412', 1) === 300 && net(r.lines, '702', 0) === 300 && net(r.lines, '643', 0) - net(r.lines, '643', 1) === 0, 'Тотожність: Кт 6412 = Дт 702 + сальдо 643, аванс закрито');

// 4. Повернення авансу: РК на зменшення до ПН на аванс, реєструє покупець-платник
r = firstEvent(C([{ date: '2026-11-05', type: 'payment', amount: 3600, doc: 'аванс' }, { date: '2026-11-12', type: 'shipment', amount: 2400, doc: 'ВН' }, { date: '2026-11-16', type: 'refund', amount: 1200, doc: 'повернення' }]), num());
const rk = r.docs.find(d => d.kind === 'rk')!;
ok(r.docs.length === 2 && rk.toPn === '1' && rk.vat === -200 && rk.registrant === 'buyer', 'Повернення авансу 1200: РК № 1 на −200 ПДВ, реєструє покупець');
ok(net(r.lines, '6412', 1) === 400 && net(r.lines, '643', 0) - net(r.lines, '643', 1) === 0, 'Після повернення: зобов’язання 400 (на відвантажене), сальдо 643 нуль');

// 5. Повернення товару без повернення грошей зобов’язання не зменшує (гроші лишаються авансом)
r = firstEvent(C([{ date: '2026-11-03', type: 'shipment', amount: 1200, doc: 'ВН' }, { date: '2026-11-04', type: 'payment', amount: 1200, doc: 'оплата' }, { date: '2026-11-08', type: 'return', amount: 600, doc: 'повернення товару' }]), num());
ok(r.docs.length === 1 && net(r.lines, '6412', 1) === 200, 'Повернення товару при отриманій оплаті: РК немає, база = оплата');
ok(net(r.lines, '643', 0) - net(r.lines, '643', 1) === 100, 'Повернений товар: ПДВ 100 знову як з авансу на 643');

// 6. Повернення товару без оплати: РК на зменшення
r = firstEvent(C([{ date: '2026-11-03', type: 'shipment', amount: 1200, doc: 'ВН' }, { date: '2026-11-08', type: 'return', amount: 600, doc: 'повернення' }]), num());
ok(r.docs[1]?.kind === 'rk' && r.docs[1].vat === -100 && eq(r.lines.map(l => [l[0], l[1], l[2]]), [['702', '6412', 200], ['702', '6412', -100]]), 'Повернення неоплаченого товару: РК −100, сторно Дт 702 Кт 6412');

// 7. Зміна ціни в бік збільшення: РК на збільшення, реєструє продавець
r = firstEvent(C([{ date: '2026-11-03', type: 'shipment', amount: 1200, doc: 'ВН' }, { date: '2026-11-20', type: 'adjust', amount: 120, doc: 'допугода' }]), num());
ok(r.docs.length === 2 && r.docs[1].kind === 'rk' && r.docs[1].vat === 20 && r.docs[1].toPn === '1' && r.docs[1].registrant === 'seller', 'Збільшення ціни: РК +20 до ПН № 1, реєструє продавець');

// 8. Неплатник: тип причини 02, умовний ІПН, РК на зменшення реєструє продавець
r = firstEvent(C([{ date: '2026-11-03', type: 'shipment', amount: 1200, doc: 'акт' }, { date: '2026-11-05', type: 'return', amount: 1200, doc: 'повернення' }], null), num());
ok(r.docs[0].reasonCode === '02' && r.docs[1].registrant === 'seller', 'Неплатник: ПН з типом причини 02, РК реєструє продавець');
ok(toXmlData(r.docs[0], { name: 'ТОВ «Приклад»', ipn: '111111111111' }, []).buyer.ipn === '100000000000', 'XML: неплатнику ставиться ІПН 100000000000');
ok(toXmlData(r.docs[1], { name: 'ТОВ «Приклад»', ipn: '111111111111' }, [], r.docs[0]).form === 'J12012', 'XML: РК — форма J12012 з посиланням на ПН');

// усі проводки першої події допустимі в плані рахунків
for (const ev of [[{ date: '2026-11-05', type: 'payment', amount: 600, doc: '' }, { date: '2026-11-12', type: 'shipment', amount: 1800, doc: '' }, { date: '2026-11-14', type: 'return', amount: 1500, doc: '' }]] as SaleContract['events'][]) {
  const lines = firstEvent(C(ev), num()).lines;
  ok(!checkLines(lines).length, 'Проводки першої події допустимі в плані рахунків: ' + lines.map(l => `${l[0]}/${l[1]}`).join(', '));
}

// Строки реєстрації (п. 201.10)
const D = (date: string, kind: 'pn' | 'rk' = 'pn', registrant: 'seller' | 'buyer' = 'seller') => ({ date, kind, registrant });
ok(registrationDeadline(D('2026-11-03')) === '2026-11-30', 'ПН від 03.11 — до 30.11');
ok(registrationDeadline(D('2026-11-15')) === '2026-11-30', 'ПН від 15.11 — до 30.11');
ok(registrationDeadline(D('2026-11-16')) === '2026-12-15', 'ПН від 16.11 — до 15.12');
ok(registrationDeadline(D('2026-12-20')) === '2027-01-15', 'ПН від 20.12 — до 15.01 наступного року');
ok(registrationDeadline(D('2026-02-10')) === '2026-02-28', 'ПН від 10.02 — до 28.02');
ok(registrationDeadline(D('2026-11-16', 'rk', 'buyer')) === '2026-12-01', 'РК на зменшення, яку реєструє покупець: 15 днів');
ok(addDays('2026-11-30', 1) === '2026-12-01', 'Дати: перехід місяця');

// Штрафи (п. 120-1.1, воєнний стан — п. 90 підрозд. 2 розд. XX)
const pn = { date: '2026-11-03', kind: 'pn' as const, registrant: 'seller' as const, vat: 1000, rate: 20 as const };
ok(penalty(pn, '2026-11-30').sum === 0, 'Вчасна реєстрація — без штрафу');
ok(eq(penalty(pn, '2026-12-10'), { late: 10, pct: 2, sum: 20 }), 'Прострочка 10 днів, воєнний стан: 2%');
ok(penalty(pn, '2026-12-10', false).pct === 10, 'Прострочка 10 днів, звичайні ставки: 10%');
ok(penalty(pn, '2027-01-20').pct === 10 && penalty(pn, '2027-06-01').pct === 15 && penalty(pn, '2028-01-01').pct === 25, 'Прострочка 51, 183, 397 днів: 10%, 15%, 25%');
ok(penalty({ ...pn, rate: 0 }, '2027-06-01').sum === 0, 'Нульова ставка — штраф не застосовується');

// Статуси ЄРПН
ok(canMove('draft', 'sent') && canMove('sent', 'blocked') && canMove('blocked', 'explained') && canMove('rejected', 'registered'), 'ЄРПН: складено → надіслано → зупинено → пояснення → рішення');
ok(!canMove('registered', 'draft') && !canMove('blocked', 'registered'), 'ЄРПН: зареєстровану не повернути, зупинену не зареєструвати без пояснень');

// Вхідні ПН: кредит лише після реєстрації
ok(eq(inboundLines(RECEIVED[0]).map(l => [l[0], l[1], l[2]]), [['6442', '6441', 5208.33]]), 'Зареєстрована вхідна ПН: Дт 6442 Кт 6441');
ok(inboundLines(RECEIVED[2]).length === 0, 'Зупинена вхідна ПН: кредит лишається на 6441');

// СЕА ПДВ і рахунок 315
ok(seaLimit({ received: 1000, customs: 200, topUps: 300, overdraft: 50, issued: 900, refundClaimed: 100, excess: 0 }) === 550, 'Ліміт СЕА: 1000 + 200 + 300 + 50 − 900 − 100 = 550');
ok(topUpNeeded(550, 800) === 250 && topUpNeeded(550, 100) === 0, 'Поповнення для реєстрації: 250, а якщо ліміту вистачає — 0');
ok(!checkLines(seaLines(1000, 1000, 50)).length, 'Проводки СЕА: Дт 315 Кт 311, Дт 6412 Кт 315, Дт 311 Кт 315');
ok(checkLines([['6412', '311', 0, '']]).length > 0, 'Сплата ПДВ напряму з поточного рахунку Дт 6412 Кт 311 відхиляється');

// Чернетка декларації за демо
const decl = declarationDraft({ issued: ISSUED, received: RECEIVED, carry: 0, period: '2026-11' });
const row = (n: string) => decl.rows.find(x => x.row === n)!;
ok(row('1.1').vat === 15300 && row('1.1').base === 76500, 'Декларація: ряд. 1.1 = ПН 152, 153, 154 (ПДВ 15 300)');
ok(row('7').vat === 0, 'Декларація: незареєстрована покупцем РК до ряд. 7 не йде');
ok(row('10.1').vat === 7008.33, 'Декларація: ряд. 10.1 лише зареєстровані вхідні ПН (5 208,33 + 1 800)');
ok(decl.toPay === 8291.67 && row('9').vat - row('17').vat === decl.toPay, 'Декларація: ряд. 18 = ряд. 9 − ряд. 17');
ok(decl.notes.some(n => n.includes('без реєстрації')), 'Декларація: попередження про незареєстровані вхідні ПН');
const neg = declarationDraft({ issued: [], received: RECEIVED, carry: 500, period: '2026-11' });
ok(neg.toPay === 0 && neg.negative === 7508.33, 'Декларація: від’ємне значення з урахуванням ряд. 16.1');

console.log(fails ? `\nПомилок ПДВ: ${fails}` : '\nУсі перевірки ПДВ пройдено');
process.exit(fails ? 1 : 0);
