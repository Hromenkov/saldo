// Перевірка кредитів і курсових різниць: графіки, проводки, перекласифікація, різниці за курсом НБУ.
// Запуск: npm test
import { checkLines } from '../src/recognize/chart';
import { schedule, loanPostings, loanBalances, postingsFor, toLines, type Loan } from '../src/finance/loans';
import { fxDifferences, fxReport, movementsFrom, toUah, carryingUah, type FxItem } from '../src/finance/fx';
import { ratesFrom, parseNbu, nbuUrl } from '../src/finance/nbu';
import { addMonths, monthEnds, r2 } from '../src/finance/dates';

let fails = 0;
const ok = (cond: boolean, msg: string, extra?: unknown) => { if (!cond) { fails++; console.log('✗ ' + msg, extra ?? ''); } else console.log('✓ ' + msg); };
const eq = (a: number, b: number) => Math.abs(a - b) < 0.005;
const sum = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0));
const valid = (name: string, ps: { dt: string; kt: string; amount: number; text: string }[]) => {
  const issues = checkLines(ps.map(p => [p.dt, p.kt, p.amount, p.text]));
  ok(!issues.length, `${name}: усі кореспонденції в плані рахунків`, issues.slice(0, 3));
};

// дати
ok(addMonths('2026-01-31', 1) === '2026-02-28', 'Дати: 31.01 + 1 міс. = 28.02');
ok(monthEnds('2026-11-15', '2027-01-03').join() === '2026-11-30,2026-12-31,2027-01-31', 'Дати: кінці місяців через рік');

// 1. Класичний (рівні частки тіла), короткостроковий, факт/365
const L1: Loan = { id: 'k1', bank: 'ПриватБанк', contract: '15/26', currency: 'UAH', principal: 120000, rate: 24, start: '2026-01-15', months: 12, method: 'equal' };
const s1 = schedule(L1);
ok(s1.length === 12 && s1.every(r => r.principal === 10000), 'Класичний: 12 платежів по 10 000 тіла');
ok(s1[0].days === 31 && eq(s1[0].interest, 2446.03), 'Класичний: відсотки 1-го місяця 120 000 × 24% × 31/365 = 2 446,03', s1[0]);
ok(s1[11].closing === 0, 'Класичний: залишок після останнього платежу 0');
const p1 = loanPostings(L1);
valid('Класичний', p1);
ok(p1[0].dt === '311' && p1[0].kt === '601' && p1[0].amount === 120000, 'Короткостроковий кредит: Дт 311 Кт 601');
ok(!p1.some(p => p.kt === '611' || p.dt === '501'), 'Короткостроковий кредит не переноситься на 611');
const acc1 = p1.filter(p => p.dt === '951');
ok(eq(sum(acc1.map(p => p.amount)), sum(s1.map(r => r.interest))), 'Нараховані відсотки (951/684) дорівнюють відсоткам за графіком');
ok(monthEnds('2026-01-31', '2026-12-31').every(e => acc1.some(p => p.date === e)), 'Відсотки нараховуються наприкінці кожного місяця');
ok(s1.every(r => eq(loanBalances(L1, r.date, p1).interest, 0)), 'На дату кожного платежу 684 закрито в нуль');
ok(eq(loanBalances(L1, '2026-01-31', p1).interest, r2(120000 * 0.24 * 16 / 365)), 'На 31.01 у 684 відсотки за 16 днів січня');
const nov = postingsFor(L1, '2026-11-01', '2026-11-30', p1);
ok(nov.some(p => p.dt === '601' && p.kt === '311') && nov.some(p => p.dt === '684' && p.kt === '311'), 'Закриття листопада: погашення тіла й відсотків');
const fin1 = loanBalances(L1, '2027-01-15', p1);
ok(fin1.current === 0 && fin1.interest === 0 && eq(fin1.expense, sum(s1.map(r => r.interest))), 'Після погашення сальдо 601 і 684 нульові, витрати = відсотки');

// 2. Ануїтет 30/360
const L2: Loan = { id: 'k2', bank: 'Ощадбанк', contract: 'A-7', currency: 'UAH', principal: 100000, rate: 12, start: '2026-02-10', months: 12, method: 'annuity' };
const s2 = schedule(L2);
ok(s2.slice(0, 11).every(r => eq(r.payment, 8884.88)), 'Ануїтет: щомісячний платіж 8 884,88', s2[0]);
ok(eq(s2[0].interest, 1000) && eq(s2[0].principal, 7884.88), 'Ануїтет: 1-й платіж 1 000 відсотків + 7 884,88 тіла');
ok(eq(sum(s2.map(r => r.principal)), 100000) && Math.abs(s2[11].payment - 8884.88) < 0.1, 'Ануїтет: тіло сходиться до копійки, останній платіж вирівнює');
valid('Ануїтет', loanPostings(L2));

// 3. Довгостроковий, 36 місяців: 501 → 611
const L3: Loan = { id: 'k3', bank: 'Райффайзен', contract: 'LT-1', currency: 'UAH', principal: 360000, rate: 18, start: '2026-03-10', months: 36, method: 'equal' };
const p3 = loanPostings(L3);
valid('Довгостроковий', p3);
ok(p3[0].kt === '501' && p3[1].dt === '501' && p3[1].kt === '611' && p3[1].amount === 120000, 'Довгостроковий: при отриманні 12 платежів (120 000) одразу на 611');
const b3 = loanBalances(L3, '2026-12-31', p3);
ok(eq(b3.current, 120000) && eq(b3.longTerm, 150000), 'На 31.12.2026: 611 = 120 000 (наступні 12 міс.), 501 = 150 000', b3);
const b3q = loanBalances(L3, '2027-06-30', p3);
ok(eq(b3q.current, 120000) && eq(b3q.longTerm, 90000), 'На 30.06.2027: сплачено 15 платежів, 611 = 120 000, 501 = 90 000', b3q);
ok(p3.filter(p => p.dt === '611' && p.kt === '311').length === 36 && !p3.some(p => p.dt === '501' && p.kt === '311'), 'Довгостроковий: тіло завжди гаситься з 611');
const b3end = loanBalances(L3, '2029-03-10', p3);
ok(b3end.current === 0 && b3end.longTerm === 0, 'Довгостроковий: після погашення 501 і 611 нульові');
const L3m = { ...L3, reclass: 'year' as const };
const p3m = loanPostings(L3m);
ok(p3m.filter(p => p.kt === '611').every(p => p.date === L3.start || p.date.endsWith('-12-31')), 'Перекласифікація раз на рік: лише при отриманні й 31.12');
ok(!checkLines(toLines(p3m)).length && loanBalances(L3m, '2029-03-10', p3m).current === 0, 'Річна перекласифікація теж закриває 611 в нуль');

// 4. Тіло в кінці строку
const L4: Loan = { id: 'k4', bank: 'Укрсиббанк', contract: 'B-2', currency: 'UAH', principal: 200000, rate: 20, start: '2026-06-01', months: 24, method: 'bullet' };
const p4 = loanPostings(L4);
valid('Тіло в кінці', p4);
ok(loanBalances(L4, '2026-12-31', p4).current === 0 && eq(loanBalances(L4, '2027-06-30', p4).current, 200000), 'Тіло в кінці: на 611 лише коли до погашення ≤ 12 міс.');

// 5. Курсові різниці за документом: поставка, часткова оплата, баланс, остаточна оплата
const rates = ratesFrom({ EUR: { '2026-10-01': 45, '2026-10-20': 46, '2026-10-31': 45.5, '2026-11-10': 47, '2026-11-30': 46.2, '2026-12-31': 46.8 } });
const inv: FxItem = { doc: 'Інвойс 88 від 01.10.2026', account: '632', currency: 'EUR', movements: [{ date: '2026-10-01', amount: 10000 }, { date: '2026-10-20', amount: -4000 }, { date: '2026-11-10', amount: -6000 }] };
const d5 = fxDifferences(inv, rates, ['2026-10-31', '2026-11-30']);
ok(d5.length === 3, 'Кредиторка: різниці на дату оплати, на баланс і на остаточну оплату (після погашення різниць немає)', d5.map(d => [d.date, d.diff]));
ok(d5[0].posting.dt === '945' && d5[0].posting.kt === '632' && d5[0].posting.amount === 10000, '20.10: курс 45 → 46 на 10 000 EUR, Дт 945 Кт 632 10 000');
ok(d5[1].posting.dt === '632' && d5[1].posting.kt === '714' && d5[1].posting.amount === 3000 && d5[1].reason === 'balance', '31.10: залишок 6 000 EUR, 46 → 45,5, Дт 632 Кт 714 3 000');
ok(d5[2].posting.dt === '945' && d5[2].posting.amount === 9000, '10.11: 45,5 → 47, Дт 945 Кт 632 9 000');
valid('Курсові різниці кредиторки', d5.map(d => d.posting));
ok(carryingUah(inv, rates, '2026-10-31') === 273000, 'Оцінка кредиторки на 31.10: 6 000 × 45,5 = 273 000');

const rec: FxItem = { doc: 'Експорт 12', account: '362', currency: 'EUR', movements: [{ date: '2026-10-01', amount: 2000 }] };
const d6 = fxDifferences(rec, rates, ['2026-10-31']);
ok(d6.length === 1 && d6[0].posting.dt === '362' && d6[0].posting.kt === '714' && d6[0].posting.amount === 1000, 'Дебіторка: курс зріс 45 → 45,5, дохід Дт 362 Кт 714 1 000');
ok(fxDifferences({ ...inv, advance: true }, rates, ['2026-10-31']).length === 0, 'Аванс немонетарний: курсових різниць немає');

const cash: FxItem = { doc: 'Валютний рахунок', account: '312', currency: 'EUR', movements: [{ date: '2026-10-01', amount: 5000 }, { date: '2026-10-20', amount: -4000 }] };
const d7 = fxDifferences(cash, rates, ['2026-10-31']);
ok(d7[0].posting.dt === '312' && d7[0].posting.kt === '714' && d7[0].posting.amount === 5000, 'Валютний рахунок 20.10: 5 000 EUR × (46 − 45) = 5 000, Дт 312 Кт 714');
ok(d7[1].posting.dt === '945' && d7[1].posting.kt === '312' && d7[1].posting.amount === 500, 'Валютний рахунок 31.10: 1 000 EUR × (45,5 − 46), Дт 945 Кт 312 500');

// 6. Валютний кредит: 602, відсотки в гривні за курсом дня, різниці 974/744
const L5: Loan = { id: 'k5', bank: 'ОТП Банк', contract: 'EUR-3', currency: 'EUR', principal: 20000, rate: 6, start: '2026-10-01', months: 3, method: 'equal' };
const p5 = loanPostings(L5);
ok(p5[0].dt === '312' && p5[0].kt === '602', 'Валютний кредит: Дт 312 Кт 602');
const er = ratesFrom({ EUR: { '2026-10-01': 45, '2026-10-31': 45.5, '2026-11-01': 46, '2026-11-30': 46.2, '2026-12-01': 46.5, '2026-12-31': 46.8, '2027-01-01': 47 } });
const uah5 = toUah(p5, 'EUR', er);
valid('Валютний кредит у гривні', uah5);
ok(uah5[0].amount === 900000, 'Отримання 20 000 EUR × 45 = 900 000 ₴');
const items5: FxItem[] = ['602', '684'].map(a => ({ doc: 'ОТП Банк EUR-3', account: a, currency: 'EUR', movements: movementsFrom(p5, a) }));
const rep = fxReport(items5, er, ['2026-10-31', '2026-11-30', '2026-12-31']);
valid('Курсові різниці валютного кредиту', rep.diffs.map(d => d.posting));
ok(rep.diffs.every(d => ['974', '744'].includes(d.gain ? d.posting.kt : d.posting.dt)), 'Валютний кредит: різниці лише неопераційні 974/744');
ok(rep.diffs[0].date === '2026-10-31' && rep.diffs[0].posting.dt === '974' && rep.diffs[0].posting.amount === 10000, '31.10: 20 000 EUR × (45,5 − 45) = 10 000, Дт 974 Кт 602');
ok(rep.loss945 === 0 && rep.income714 === 0 && rep.loss974 > 0, 'Звіт: операційних різниць за кредитом немає');

// 7. Курс НБУ
ok(rates('UAH', '2026-01-01') === 1, 'Курс гривні 1');
let missed = '';
const rr = ratesFrom({ USD: { '2026-11-01': 41.5 } }, (c, d, u) => { missed = `${c} ${d} ← ${u}`; });
ok(rr('USD', '2026-11-03') === 41.5 && missed === 'USD 2026-11-03 ← 2026-11-01', 'Немає курсу на дату — береться попередній і це позначається');
let threw = false; try { rr('USD', '2026-10-01'); } catch { threw = true; }
ok(threw, 'Немає жодного попереднього курсу — помилка, а не нуль');
ok(parseNbu([{ r030: 978, txt: 'Євро', rate: 48.1234, cc: 'EUR', exchangedate: '02.11.2026' }], 'EUR') === 48.1234 && parseNbu([], 'EUR') === null, 'Розбір відповіді НБУ');
ok(nbuUrl('EUR', '2026-11-02').endsWith('valcode=EUR&date=20261102&json'), 'Адреса API НБУ з датою YYYYMMDD');

console.log(fails ? `\nПомилок: ${fails}` : '\nУсі перевірки кредитів і курсових різниць пройдено');
process.exit(fails ? 1 : 0);
