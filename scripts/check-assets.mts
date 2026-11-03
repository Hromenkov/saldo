// Перевірка обліку основних засобів: методи амортизації, строки, проводки. Запуск: npm test
import { accrue, commissionLines, disposalIssues, disposalLines, monthAmount, newAsset, schedule, validate, wear, type Asset } from '../src/assets/fixed';
import { ASSETS } from '../src/data';
import { checkLines } from '../src/recognize/chart';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;
const A = (p: Partial<Asset>): Asset => ({ ...newAsset('t'), inv: '1', name: 'Тест', expense: '92', ...p });

// прямолінійний
const st = A({ cost: 100000, liq: 10000, months: 60 });
const s1 = schedule(st);
ok(s1.length === 60 && s1[0] === 1500 && sum(s1) === 90000, 'Прямолінійний: 1 500 ₴ на місяць, разом 90 000 за 60 міс.');
const odd = schedule(A({ cost: 10000, liq: 0, months: 7 }));
ok(sum(odd) === 10000 && odd[0] === 1428.57 && odd[6] === 1428.58, 'Прямолінійний: копійки округлення в останньому місяці');

// зменшення залишкової вартості: норма = 1 − (ліквідаційна / первісна)^(1/n)
const rd = A({ cost: 100000, liq: 10000, months: 60, method: 'reducing' });
const s2 = schedule(rd);
const rate = 1 - Math.pow(0.1, 1 / 5);
ok(Math.abs(s2[0] * 12 - 100000 * rate) < 1 && sum(s2) === 90000, 'Зменшення залишкової вартості: перший рік за нормою, разом 90 000');
ok(s2[0] > s2[12] && s2[12] > s2[24], 'Зменшення залишкової вартості: суми зменшуються щороку');

// прискореного зменшення: подвійна норма прямолінійного від залишкової вартості
const ac = schedule(A({ cost: 100000, liq: 10000, months: 60, method: 'accelerated' }));
ok(Math.abs(ac[0] - 100000 * 0.4 / 12) < 0.01 && Math.abs(ac[12] - 60000 * 0.4 / 12) < 0.01 && sum(ac) === 90000, 'Прискорений: 40% від залишкової, останній рік до ліквідаційної');

// кумулятивний: 5/15, 4/15, … від вартості, що амортизується
const cu = schedule(A({ cost: 100000, liq: 10000, months: 60, method: 'cumulative' }));
ok(cu[0] === 2500 && cu[12] === 2000 && cu[48] === 500 && sum(cu) === 90000, 'Кумулятивний: 30 000, 24 000 … 6 000 за роки');

// виробничий
const pr = A({ cost: 100000, liq: 10000, months: 60, method: 'production', units: 90000, commissioned: '2026-10' });
ok(monthAmount(pr, '2026-11', 1200) === 1200, 'Виробничий: 1 ₴ на одиницю, 1 200 одиниць → 1 200 ₴');

// з якого місяця і до якого
const sv = A({ cost: 60000, liq: 0, months: 60, commissioned: '2026-10' });
ok(monthAmount(sv, '2026-10') === 0 && monthAmount(sv, '2026-11') === 1000, 'Амортизація з місяця, наступного за введенням');
const dsp = { ...sv, accrued: { '2026-11': 1000, '2026-12': 1000 }, disposed: { ym: '2026-12', how: 'liquidation' as const } };
ok(monthAmount(dsp, '2027-01') === 0, 'Після місяця вибуття не нараховується');
const near = { ...sv, wearStart: 59500 };
ok(monthAmount(near, '2026-11') === 500, 'Не більше залишку вартості, що амортизується');

// перевірки картки
const has = (a: Asset, re: RegExp) => validate(a).some(i => re.test(i.t));
ok(has(A({ cost: 50000, liq: 50000 }), /Ліквідаційна вартість має бути меншою/), 'Ліквідаційна ≥ первісної — помилка');
ok(has(A({ cost: 50000, months: 30, method: 'cumulative' }), /повних роках/), 'Кумулятивний зі строком 30 міс. — помилка');
ok(has(A({ cost: 50000, method: 'reducing' }), /ліквідаційної вартості більшої/), 'Зменшення залишкової без ліквідаційної — помилка');
ok(has(A({ cost: 50000, method: 'production' }), /обсяг продукції/), 'Виробничий без обсягу — помилка');
ok(has(A({ tg: '4', cost: 50000, months: 36 }), /мінімальний строк 5 років/), 'Машини 36 міс.: попередження про мінімальний строк 5 років');
ok(!has(A({ tg: '4e', cost: 50000, months: 24 }), /мінімальний строк/), 'Комп’ютер 24 міс.: строк відповідає ПКУ');
ok(has(A({ tg: '3b', cost: 5e6, months: 180 }), /мінімальний строк 20 років/), 'Будівля 15 років: попередження про 20 років');
ok(has(A({ cost: 15000 }), /малоцінний необоротний актив/), 'Вартість до 20 000 ₴: попередження про МНМА');
ok(validate(A({ cost: 50000, expense: null })).some(i => i.level === 'warn' && /не обрано/.test(i.t)), 'Без рахунку витрат — попередження');

// проводки: введення, амортизація, вибуття
const asset = A({ id: 'x', tg: '5', cost: 60000, liq: 0, months: 60, commissioned: '2026-10', expense: '93' });
ok(JSON.stringify(commissionLines(asset).map(l => l.slice(0, 3))) === JSON.stringify([['105', '152', 60000]]), 'Введення авто: Дт 105 Кт 152');
const acr = accrue([asset], '2026-11');
ok(acr.lines.length === 1 && acr.lines[0][0] === '93' && acr.lines[0][1] === '131' && acr.lines[0][2] === 1000, 'Амортизація: Дт 93 Кт 131 1 000');
const noExp = accrue([{ ...asset, expense: null }], '2026-11');
ok(noExp.lines.length === 0 && noExp.issues.length === 1, 'Без рахунку витрат амортизацію не нараховано, система не обирає сама');
ok(accrue([{ ...asset, accrued: { '2026-11': 1000 } }], '2026-11').lines.length === 0, 'Повторне нарахування за місяць не створює проводок');
ok(accrue([{ ...asset, commissioned: undefined }], '2026-11').lines.length === 0, 'Об’єкт на 152 не амортизується');
ok(accrue([{ ...asset, method: 'production', units: 1000 }], '2026-11').issues.length === 1, 'Виробничий без обсягу за місяць — питання, а не нуль');

const used = { ...asset, accrued: { '2026-11': 1000, '2026-12': 1000 } };
ok(disposalIssues(used, { ym: '2027-01', how: 'liquidation' }).some(t => /Спершу нарахуйте/.test(t)) && !disposalIssues(used, { ym: '2026-12', how: 'liquidation' }).length, 'Вибуття без амортизації місяця вибуття — зупинка');
const liq = disposalLines(used, { ym: '2026-12', how: 'liquidation' });
ok(JSON.stringify(liq.map(l => l.slice(0, 3))) === JSON.stringify([['131', '105', 2000], ['976', '105', 58000]]), 'Ліквідація: Дт 131 Кт 105 знос, Дт 976 Кт 105 залишкова');
const sale = disposalLines(used, { ym: '2026-12', how: 'sale', price: 72000, vat: 12000 });
ok(JSON.stringify(sale.map(l => l.slice(0, 3))) === JSON.stringify([['131', '105', 2000], ['286', '105', 58000], ['377', '712', 72000], ['712', '6412', 12000], ['943', '286', 58000]]), 'Продаж: 131, 286, 377/712, ПДВ 712/6412, собівартість 943/286');
ok(wear(used) === 2000, 'Знос = сума нарахувань');

for (const ls of [commissionLines(asset), acr.lines, liq, sale]) { const iss = checkLines(ls); ok(!iss.length, 'Кореспонденції ОЗ допустимі' + (iss.length ? ': ' + iss.map(x => x.t).join('; ') : '')); }
for (const tg of ['3b', '4', '5', '6', '7', '8', '9']) ok(!checkLines(commissionLines(A({ tg, cost: 1 }))).length, `Група ${tg}: рахунок є в плані, введення Дт 10x Кт 152 допустиме`);
for (const e of ['23', '91', '92', '93', '949']) ok(!checkLines([[e, '131', 1, '']]).length, `Амортизація на ${e} допустима`);

// демо-об'єкти
for (const a of ASSETS) ok(!validate(a).some(i => i.level === 'error'), `Демо ${a.name}: картка без помилок`);
ok(sum(Object.values(accrue(ASSETS, '2026-11').amounts)) === 5200, 'Демо: амортизація за листопад 5 200,00 ₴ по трьох об’єктах');

console.log(fails ? `\nПомилок: ${fails}` : '\nУсі перевірки ОЗ пройдено');
process.exit(fails ? 1 : 0);
