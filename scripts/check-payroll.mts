// Перевірка розрахунку зарплати: суми податків, середня для відпускних і лікарняних, проводки,
// платіжки з прив'язкою до нарахування і дані для 4ДФ / Д1. Запуск: npm test
import { average, calcEmployee, prevMonths, runPayroll, workdays, type Employee } from '../src/payroll/engine';
import { outstanding, paymentOrders, payrollPostings } from '../src/payroll/postings';
import { build4DF, buildD1 } from '../src/payroll/report';
import { EMPLOYEES, INPUTS, PAY_COMPANY, PAY_MONTH } from '../src/payroll/demo';
import { checkLines } from '../src/recognize/chart';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const eq = (a: number, b: number, msg: string) => ok(Math.abs(a - b) < 0.005, `${msg}: ${a}${Math.abs(a - b) < 0.005 ? '' : ' ≠ ' + b}`);

const M = '2026-10';
const emp = (o: Partial<Employee>): Employee => ({ id: 'x', name: 'Тест', ipn: '1234567890', position: '', dept: '', hired: '2020-01-01',
  pay: { type: 'monthly', rate: 20000 }, costAccount: '92', insuranceYears: 10, history: prevMonths(M, 12).map(month => ({ month, earnings: 20000 })), ...o });
const N = workdays(M);
ok(N === 22, `Робочих днів у жовтні 2026: ${N}`);

// повний місяць
let r = calcEmployee(emp({}), { employeeId: 'x', normDays: N }, M);
eq(r.gross, 20000, 'Оклад 20 000 за повний місяць');
eq(r.pdfo, 3600, 'ПДФО 18%');
eq(r.vz, 1000, 'Військовий збір 5%');
eq(r.net, 15400, 'До виплати');
eq(r.esv, 4400, 'ЄСВ 22%');

// неповний місяць за табелем
r = calcEmployee(emp({}), { employeeId: 'x', normDays: N, workedDays: 11 }, M);
eq(r.accruals[0].amount, 10000, 'Оклад пропорційно відпрацьованим дням 11/22');

// мінімальний і максимальний ЄСВ
r = calcEmployee(emp({ pay: { type: 'monthly', rate: 4500 } }), { employeeId: 'x', normDays: N }, M);
eq(r.esvTopUp, 4147, 'Доплата до мінімальної бази 8 647');
eq(r.esv, 1902.34, 'ЄСВ з мінімальної зарплати');
r = calcEmployee(emp({ pay: { type: 'monthly', rate: 4500 }, minBase: false }), { employeeId: 'x', normDays: N }, M);
eq(r.esv, 990, 'Не основне місце: ЄСВ з фактичної суми');
r = calcEmployee(emp({ pay: { type: 'monthly', rate: 200000 } }), { employeeId: 'x', normDays: N }, M);
eq(r.esvBase, 129705, 'База ЄСВ обмежена 15 мінімальними');
eq(r.esv, 28535.1, 'ЄСВ з максимальної бази');
eq(r.pdfo, 36000, 'ПДФО без обмеження бази');

// ПСП
r = calcEmployee(emp({ pay: { type: 'monthly', rate: 4500 }, psp: true }), { employeeId: 'x', normDays: N }, M);
eq(r.psp, 1664, 'ПСП 1 664');
eq(r.pdfo, 510.48, 'ПДФО з урахуванням ПСП');
eq(r.vz, 225, 'Військовий збір без ПСП');
r = calcEmployee(emp({ pay: { type: 'monthly', rate: 5000 }, psp: true }), { employeeId: 'x', normDays: N }, M);
ok(r.psp === 0 && r.issues.some(t => t.includes('ліміт ПСП')), 'Дохід понад 4 660: ПСП не застосовано, є попередження');

// відпускні: 12 місяців × 18 000 / 365 к. дн.
const vac = emp({ pay: { type: 'monthly', rate: 18000 }, history: prevMonths(M, 12).map(month => ({ month, earnings: 18000 })) });
const av = average(vac, M, 'vacation');
ok(av.days === 365 && av.months.length === 12, `Розрахунковий період відпустки: ${av.months[0]}…${av.months[11]}, ${av.days} дн.`);
eq(av.daily, 591.78, 'Середньоденна для відпускних');
r = calcEmployee(vac, { employeeId: 'x', normDays: N, workedDays: 17, vacation: { days: 7 } }, M);
eq(r.accruals.find(a => a.kind === 'vacation')!.amount, 4142.46, 'Відпускні за 7 к. дн.');
r = calcEmployee(vac, { employeeId: 'x', normDays: N, vacation: { days: 7 } }, M);
ok(r.issues.some(t => t.includes('табелем')), 'Відпустка без табеля: питання до бухгалтера');
const excl = emp({ history: prevMonths(M, 12).map((month, i) => ({ month, earnings: i === 0 ? 10000 : 20000, excludedDays: i === 0 ? 15 : 0 })) });
ok(average(excl, M, 'vacation').days === 350, 'Дні лікарняного й без збереження виключаються з періоду');
const fresh = emp({ hired: '2026-08-15', history: [{ month: '2026-08', earnings: 10000 }, { month: '2026-09', earnings: 20000 }] });
const avF = average(fresh, M, 'vacation');
ok(avF.days === 17 + 30 && avF.earnings === 30000, 'Новий працівник: період з дня прийняття');

// лікарняні: стаж 2 роки → 50%, перші 5 днів роботодавець, решта ПФУ
const sick = emp({ pay: { type: 'monthly', rate: 12000 }, insuranceYears: 2, history: prevMonths(M, 12).map(month => ({ month, earnings: 12000 })) });
r = calcEmployee(sick, { employeeId: 'x', normDays: N, workedDays: 18, sick: { days: 6 } }, M);
eq(r.accruals.find(a => a.kind === 'sick')!.amount, 986.3, 'Лікарняні роботодавця 394,52 × 50% × 5 дн.');
eq(r.fundSick, 197.26, 'Частина ПФУ — для інформації');
ok(r.esvTopUp === 0 && !r.issues.some(t => t.includes('мінімальний внесок')), 'Лікарняний, база вище мінімальної: питань немає');
r = calcEmployee({ ...sick, pay: { type: 'monthly', rate: 6000 } }, { employeeId: 'x', normDays: N, workedDays: 10, sick: { days: 14 } }, M);
ok(r.esvTopUp === 0 && r.issues.some(t => t.includes('мінімальний внесок')), 'Місяць з лікарняним ПФУ і базою нижче мінімальної: ЄСВ перевіряє бухгалтер, система не донараховує');
const rich = emp({ insuranceYears: 9, history: prevMonths(M, 12).map(month => ({ month, earnings: 300000 })) });
eq(average(rich, M, 'sick').daily, 4184.51, 'Лікарняні: заробіток у межах максимальної бази ЄСВ кожного місяця (120 000 у 2025, 129 705 у 2026)');
r = calcEmployee(emp({ insuranceYears: 4 }), { employeeId: 'x', normDays: N, workedDays: 20, sick: { days: 3 } }, M);
ok(r.accruals.find(a => a.kind === 'sick')!.note.includes('60%') && r.fundSick === 0, 'Стаж 3–5 років: 60%, короткий лікарняний повністю роботодавець');

// рахунок витрат ніколи не обирається сам
r = calcEmployee(emp({ costAccount: null }), { employeeId: 'x', normDays: N }, M);
ok(r.issues.some(t => t.includes('не затверджено рахунок витрат')), 'Без затвердженого рахунку витрат — питання');
r = calcEmployee(emp({ costAccount: '631' }), { employeeId: 'x', normDays: N }, M);
ok(r.issues.some(t => t.includes('не є рахунком витрат')), 'Рахунок 631 замість витрат відхиляється');

// демо-нарахування готелю
const run = runPayroll(PAY_MONTH, EMPLOYEES, INPUTS);
ok(!run.canPost, 'Демо: кухар без рахунку витрат блокує проведення');
ok(payrollPostings(run).every(l => !l[3].includes('Лисенко')), 'Без затвердженого рахунку проводок по працівнику немає');
let threw = false; try { paymentOrders(run, PAY_COMPANY, '2026-11-05'); } catch { threw = true; }
ok(threw, 'Платіжки за непроведеним нарахуванням не формуються');

const fixed = runPayroll(PAY_MONTH, EMPLOYEES.map(e => e.costAccount ? e : { ...e, costAccount: '23' }), INPUTS);
ok(fixed.canPost, 'Після затвердження рахунку нарахування можна провести');
const lines = payrollPostings(fixed);
const issues = checkLines(lines);
ok(!issues.length, 'Проводки зарплати відповідають плану рахунків' + (issues.length ? ': ' + issues.map(x => x.t).join('; ') : ''));
const sumBy = (d: string, k: string) => Math.round(lines.filter(l => l[0].match(d) && l[1] === k).reduce((s, l) => s + l[2], 0) * 100) / 100;
eq(sumBy('^(23|91|92|93|949)$', '661'), fixed.totals.gross, 'Дт витрат Кт 661 = нараховано');
eq(sumBy('^661$', '6411'), fixed.totals.pdfo, 'Дт 661 Кт 6411 = ПДФО');
eq(sumBy('^661$', '642'), fixed.totals.vz, 'Дт 661 Кт 642 = ВЗ');
eq(sumBy('^(23|91|92|93|949)$', '651'), fixed.totals.esv, 'Дт витрат Кт 651 = ЄСВ');
ok(['23', '91', '92', '93'].every(a => lines.some(l => l[0] === a && l[1] === '661')), 'Витрати рознесено на 23, 91, 92, 93 за затвердженими рахунками');

// платіжки прив'язані до нарахування
const orders = paymentOrders(fixed, PAY_COMPANY, '2026-11-05');
ok(orders.length === 4 && orders.every(o => o.accrualId === fixed.id), 'Чотири платіжки: зарплата, ПДФО, ВЗ, ЄСВ — усі з номером нарахування');
ok(!checkLines(orders.map(o => [o.dt, o.kt])).length, 'Проводки платіжок допустимі');
for (const [k, v] of [['net', fixed.totals.net], ['pdfo', fixed.totals.pdfo], ['vz', fixed.totals.vz], ['esv', fixed.totals.esv]] as const)
  eq(orders.find(o => o.kind === k)!.amount, v, `Платіжка ${k} = нараховано`);
const pdfoOrder = orders.find(o => o.kind === 'pdfo')!;
ok(pdfoOrder.purpose.startsWith('*;101;12345678;ПДФО') && pdfoOrder.purpose.includes(fixed.id) && pdfoOrder.purpose.includes('за жовтень 2026'), 'Призначення ПДФО: формат бюджету і номер нарахування');
ok(pdfoOrder.article === 'Податки: ПДФО' && orders.find(o => o.kind === 'esv')!.article === 'Податки: ЄСВ', 'Платіжки мають статтю руху коштів');
ok(paymentOrders(fixed, PAY_COMPANY, '2026-11-06', orders).length === 0, 'Повторно за те саме нарахування платіжки не формуються');
ok(outstanding(fixed, 'pdfo', orders).length === 0, 'Залишок ПДФО по нарахуванню нуль');

// 4ДФ і Д1
const df = build4DF([fixed], orders, 2026, 4);
eq(df.reduce((s, x) => s + x.accrued, 0), fixed.totals.gross, '4ДФ: нараховано = нарахування за квартал');
eq(df.reduce((s, x) => s + x.pdfoPaid, 0), fixed.totals.pdfo, '4ДФ: ПДФО перераховано за платіжками');
ok(df.find(x => x.ipn === '3678901237')!.pspSign === '01', '4ДФ: ознака ПСП для працівника із заявою');
const dfUnpaid = build4DF([fixed], [], 2026, 4);
ok(dfUnpaid.every(x => x.paid === 0 && x.pdfoPaid === 0), '4ДФ: без платіжок виплачено нуль');
const d1 = buildD1([fixed]);
eq(d1.reduce((s, x) => s + x.esv, 0), fixed.totals.esv, 'Д1: ЄСВ = нарахування');
ok(d1.find(x => x.name.startsWith('Ткачук'))!.sickDays === 6, 'Д1: дні непрацездатності');

console.log(fails ? `\nПомилок: ${fails}` : '\nУсі перевірки зарплати пройдено');
process.exit(fails ? 1 : 0);
