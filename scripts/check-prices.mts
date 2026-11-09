// Перевірка історії цін: ціна за одиницю, порівняння з попередньою поставкою, поріг скачка,
// дешевший постачальник і динаміка за парою «позиція + постачальник». Запуск: npm test
import { compare, DEMO_PRICES, lines, recordDoc, forgetDoc, getPrices, unitPrice, type PricePoint } from '../src/recognize/prices';
import { partyKey } from '../src/recognize/suppliers';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const H = DEMO_PRICES;

ok(unitPrice({ qty: 10, price: 28, amount: 280 }) === 28, 'ціна з рядка накладної');
ok(unitPrice({ qty: 8, price: null, amount: 2240 }) === 280, 'без ціни: сума / кількість');
ok(unitPrice({ qty: null, price: null, amount: 100 }) === null, 'без кількості й ціни ціни немає');

// ковбаса в Агроресурсу: 240 → 280, це +16,7 %; при порозі 15 % — скачок, при 20 % — ні
const ag = 'ТОВ «Агроресурс»';
const c1 = compare(H, { item: 'n1', party: partyKey(undefined, ag), cp: ag, date: '2026-11-01', price: 280 }, 15);
// у демо вже є закупівля 01.11 за 280: без docId вона теж «до», тому беремо дату раніше
const c2 = compare(H.filter(p => p.date < '2026-11-01'), { item: 'n1', party: partyKey(undefined, ag), cp: ag, date: '2026-11-01', price: 280 }, 15);
ok(c1?.pct === 0, `та сама поставка дає 0 %, а не скачок (${c1?.pct})`);
ok(!!c2 && c2.same && c2.ref.price === 240 && c2.pct === 16.7 && c2.jump, `ковбаса +16,7 % до минулої поставки (${c2?.pct})`);
ok(compare(H.filter(p => p.date < '2026-11-01'), { item: 'n1', cp: ag, date: '2026-11-01', price: 280 }, 20)?.jump === false, 'поріг 20 %: не скачок');
// інша назва того самого постачальника (без лапок і з іншим регістром) упізнається
ok(compare(H, { item: 'n1', cp: 'Агроресурс ТОВ', date: '2026-12-01', price: 300 }, 15)?.same === true, 'постачальник упізнається за назвою');

// молоко від Мельника за 36 ₴: є дешевший постачальник за 90 днів
const m = compare(H, { item: 'n4', cp: 'ФОП Мельник О.', date: '2026-11-20', price: 40 }, 15);
ok(!!m && m.ref.price === 36 && m.alt?.cp === 'ТОВ «Молочний край»' && m.alt.price === 31.5, `молоко: дешевше в «Молочний край» (${m?.alt?.cp} ${m?.alt?.price})`);
// новий постачальник порівнюється з останньою закупівлею будь-де
const n = compare(H, { item: 'n8', cp: 'ТОВ «Кава-Трейд»', date: '2026-11-20', price: 900 }, 15);
ok(!!n && !n.same && n.ref.price === 700 && n.jump, 'новий постачальник: порівняння з останньою закупівлею в іншого');
ok(compare(H, { item: 'nX', cp: ag, date: '2026-11-20', price: 1 }, 15) === undefined, 'нова позиція: порівнювати нема з чим');

// динаміка: пари «позиція + постачальник», скачки в демо — ковбаса й яйця Мельника (+19,6 %)
const L = lines(H, 15);
const pairs = new Set(H.map(p => p.item + '|' + p.party));
ok(L.length === pairs.size, `рядків динаміки ${L.length} = пар ${pairs.size}`);
const j = L.filter(l => l.jump).map(l => l.item + ' ' + l.cp + ' ' + l.pct).sort();
ok(j.length === 2 && j.some(x => x.startsWith('n1 ')) && j.some(x => x.startsWith('n7 ФОП Мельник')), 'скачки в демо: ' + j.join('; '));
ok(L.every(l => l.points.every((p, i, a) => !i || a[i - 1].date <= p.date)), 'точки йдуть за датою');

// проведення і скасування документа
const before = getPrices().points.length;
const pt: Omit<PricePoint, 'docId'> = { item: 'n1', party: 'cp:x', cp: 'X', date: '2026-11-20', price: 300, qty: 1, doc: 'Накладна № 1' };
recordDoc(901, [pt, { ...pt, item: '', price: 1 }, { ...pt, item: 'n2', price: 0 }]);
ok(getPrices().points.length === before + 1, 'записуються лише рядки з позицією і ціною');
recordDoc(901, [pt]);
ok(getPrices().points.length === before + 1, 'повторне проведення не дублює ціни');
ok(compare(getPrices().points, { item: 'n1', cp: 'X', date: '2026-11-20', price: 300, docId: 901 }, 15)?.ref.docId !== 901, 'документ не порівнюється сам із собою');
forgetDoc(901);
ok(getPrices().points.length === before, 'скасування прибирає ціни документа');

if (fails) { console.log(`\n${fails} перевірок не пройдено`); process.exit(1); }
console.log('\nІсторія цін: усе гаразд');
