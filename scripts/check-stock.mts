// Перевірка складу: партії, середня і FIFO, техкарти з напівфабрикатами, інвентаризація,
// заборона від'ємних залишків і відповідність усіх складських проводок плану рахунків. Запуск: npm test
import { checkLines } from '../src/recognize/chart';
import { balanceOf, explode, r2, replay, tryAdd, tryRemove, type Movement, type CostMethod } from '../src/stock/engine';
import { DEMO, canChangeMethod } from '../src/stock/store';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const mv = DEMO.movements;

for (const method of ['avg', 'fifo'] as CostMethod[]) {
  const L = replay(mv, method);
  ok(Object.values(L.results).every(r => r.ok), `${method}: демо-журнал проводиться повністю`);
  for (const r of Object.values(L.results)) {
    const iss = checkLines(r.postings);
    ok(!iss.length, `${method}: проводки руху ${r.id} допустимі` + (iss.length ? ': ' + iss.map(x => x.t).join('; ') : ''));
  }
  // вартість не губиться: надійшло = залишок + списано на витрати й собівартість
  const inV = mv.filter(m => m.type === 'in').flatMap(m => m.rows as { value: number }[]).reduce((s, r) => s + r.value, 0);
  const left = L.lots.reduce((s, l) => s + l.value, 0);
  const spent = Object.values(L.results).flatMap(r => r.postings).filter(p => p[0] === '23' || p[0] === '902').reduce((s, p) => s + p[2], 0);
  ok(near(inV, left + spent), `${method}: надійшло ${r2(inV)} = залишок ${r2(left)} + списано ${r2(spent)}`);
  ok(L.lots.every(l => l.qty > 0 && l.value >= 0), `${method}: немає від’ємних партій`);
}

// FIFO: кухня отримала першу партію молока (34 ₴/л) і яєць (5 ₴/шт)
const F = replay(mv, 'fifo');
const fk = F.results.d5.postings.find(p => p[0] === '23')!;
ok(near(fk[2], 690 + 272 + 336 + 330 + 50.4 + 8.4), `FIFO: сировина кухні за зміну ${fk[2]} = 1686,80`);
ok(JSON.stringify(F.results.d5.postings.map(p => [p[0], p[1]])) === JSON.stringify([['23', '201'], ['26', '23'], ['901', '26']]), 'Страви: Дт 23 Кт 201 → Дт 26 Кт 23 → Дт 901 Кт 26');
ok(near(F.results.d6.rows.find(r => r.item === 'n4')!.value, 810), 'FIFO: бар отримав молоко з другої партії (36 ₴/л), 22,5 л = 810,00');
// Середня: 540 яєць на 2 790 ₴; кухня отримала 300 шт за 1 550 ₴, списала 138 шт
const A = replay(mv, 'avg');
ok(near(A.results.d5.rows.find(r => r.item === 'n7')!.value, 713), 'Середня: 138 яєць на кухні = 713,00');
ok(near(balanceOf(A.lots, 'main', 'n7').value, 2790 - 1550), 'Середня: на центральному складі лишилось яєць на 1 240,00');

// техкарти: напівфабрикат розкладається на сировину
const ex = explode(DEMO.cards, [{ card: 'c3', qty: 60 }]);
const q = (id: string) => ex.rows.find(r => r.item === id)?.qty;
ok(q('n5') === 2.4 && q('n4') === 6 && q('n7') === 18 && q('n3') === 0.6 && q('n6') === 0.3, 'Млинці × 60: борошно 2,4, молоко 6, яйця 18, масло 0,6, цукор 0,3');
ok(!!explode([{ id: 'a', name: 'А', out: 1, unit: 'кг', rows: [{ card: 'b', qty: 1 }] }, { id: 'b', name: 'Б', out: 1, unit: 'кг', rows: [{ card: 'a', qty: 1 }] }], [{ card: 'a', qty: 1 }]).error, 'Цикл у напівфабрикатах виявляється');
ok(!!explode(DEMO.cards, [{ card: 'nope', qty: 1 }]).error, 'Невідома техкарта — помилка');

// від'ємних залишків немає
const tooMuch: Movement = { id: 'x1', type: 'prod', date: '2026-11-11', loc: 'kitchen', sales: [], rows: [{ item: 'n7', qty: 1000 }] };
const t1 = tryAdd(mv, tooMuch, 'fifo');
ok(!t1.ok && /Не вистачає/.test(t1.error), 'Списання понад залишок відхиляється');
const partial: Movement = { id: 'x2', type: 'prod', date: '2026-11-11', loc: 'kitchen', sales: [], rows: [{ item: 'n5', qty: 1 }, { item: 'n7', qty: 1000 }] };
const P = replay([...mv, partial], 'fifo');
ok(!P.results.x2.ok && near(balanceOf(P.lots, 'kitchen', 'n5').qty, 10 - 2.4), 'Рух з помилкою не списує навіть рядки, яких вистачало');
const back: Movement = { id: 'x3', type: 'prod', date: '2026-11-02', loc: 'main', sales: [], rows: [{ item: 'n7', qty: 300 }] };
const t3 = tryAdd(mv, back, 'fifo');
ok(!t3.ok && /Пізніший/.test(t3.error), 'Списання заднім числом, що зламає пізніше переміщення, відхиляється');
ok(!tryRemove(mv, 'd1', 'fifo').ok, 'Не можна скасувати надходження, з якого вже списано');
ok(!tryRemove(mv, 'd2', 'avg').ok, 'Без другої партії молока бару не вистачить: скасування відхиляється');
ok(tryRemove(mv, 'd6', 'avg').ok, 'Останнє списання можна скасувати');

// переміщення, списання на витрати, інвентаризація
ok(JSON.stringify(A.results.d3.postings.map(p => [p[0], p[1]])) === '[["201","201"]]', 'Переміщення: Дт 201 Кт 201');
const out: Movement = { id: 'x4', type: 'out', date: '2026-11-12', loc: 'main', cost: '92', rows: [{ item: 'n1', qty: 1 }] };
const t4 = tryAdd(mv, out, 'fifo');
ok(t4.ok && t4.result.postings[0][0] === '92' && t4.result.postings[0][1] === '201' && near(t4.result.postings[0][2], 280) && !checkLines(t4.result.postings).length, 'Списання на витрати: Дт 92 Кт 201 280,00');
ok(!tryAdd(mv, { ...out, id: 'x5', cost: '631' } as Movement, 'fifo').ok, 'Списання на рахунок не з витрат відхиляється');
const cnt: Movement = { id: 'x6', type: 'count', date: '2026-11-15', loc: 'kitchen', rows: [{ item: 'n7', acc: '201', fact: 160 }, { item: 'n5', acc: '201', fact: 8 }] };
const t6 = tryAdd(mv, cnt, 'fifo');
ok(t6.ok && t6.result.postings.some(p => p[0] === '947' && p[1] === '201' && near(p[2], 10)) && t6.result.postings.some(p => p[0] === '201' && p[1] === '719' && near(p[2], 8.4)) && !checkLines(t6.result.postings).length,
  'Інвентаризація: нестача 2 яєць Дт 947 Кт 201 10,00; надлишок 0,4 кг борошна Дт 201 Кт 719 8,40');
const smallProd: Movement[] = [{ id: 'y1', type: 'in', date: '2026-11-01', loc: 'main', rows: [{ item: 'z', acc: '22', qty: 2, value: 100 }] }, { id: 'y2', type: 'prod', date: '2026-11-02', loc: 'main', sales: [], rows: [{ item: 'z', qty: 1 }] }];
ok(!replay(smallProd, 'fifo').results.y2.ok, 'МШП (22) за техкартою не списуються');
const goods: Movement[] = [{ id: 'g1', type: 'in', date: '2026-11-01', loc: 'bar', rows: [{ item: 'beer', acc: '281', qty: 24, value: 960 }] }, { id: 'g2', type: 'prod', date: '2026-11-02', loc: 'bar', sales: [], rows: [{ item: 'beer', qty: 6 }] }];
const G = replay(goods, 'fifo').results.g2;
ok(G.ok && G.postings.length === 1 && G.postings[0][0] === '902' && G.postings[0][1] === '281' && near(G.postings[0][2], 240), 'Покупний товар у барі: Дт 902 Кт 281 240,00');
ok(!canChangeMethod(DEMO), 'Метод оцінки не змінюється, коли вже є списання');

console.log(fails ? `\nПомилок: ${fails}` : '\nУсі перевірки складу пройдено');
process.exit(fails ? 1 : 0);
