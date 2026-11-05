// «Пульс» власника: цифри з тих самих документів і банку. Запуск: npm test
import { pulse } from '../src/audit/pulse';
import { BANK, DOCS } from '../src/data';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const today = new Date('2026-11-30T12:00:00');
const p = pulse(DOCS, BANK, 11, 2026, { today });

ok(p.cashIn === 52200 && p.cashOut === 63365.4, `Банк за листопад: надійшло 52 200,00, сплачено 63 365,40 (${p.cashIn} / ${p.cashOut})`);
ok(p.revenue === 40500, `Виручка без ПДВ за проведеними документами: 40 500,00 (${p.revenue})`);
ok(p.costs === 12400, `Витрати: лише проведені листопадові документи, 12 400,00 (${p.costs})`);
ok(p.theyOwe === 0 && p.weOwe === 0, 'Борги: Агроресурс, Коваленко і Логістик-Захід оплачені повністю');
ok(p.docs === 6 && p.posted === 2 && p.waiting === 4, `Документи листопада: 6, проведено 2, чекають 4 (${p.docs}/${p.posted}/${p.waiting})`);
ok(p.lagDays === 20, `Найстаріший непроведений документ (10.11) лежить 20 днів (${p.lagDays})`);
ok(p.notInBas === 2, 'Не вивантажено в BAS: видаткова № 418 і акт № 77');
ok(pulse(DOCS.map(d => ({ ...d, basAt: '2026-11-30' })), BANK, 11, 2026, { today }).notInBas === 0, 'Після вивантаження «не в BAS» = 0');

const debt = pulse([...DOCS, { ...DOCS[0], id: 99, no: '419', sum: 1200, vat: 200, lines: [['361', '702', 1200, ''], ['702', '6412', 200, '']] as [string, string, number, string][] }], BANK, 11, 2026, { today });
ok(debt.theyOwe === 1200, `Неоплачена видаткова на 1 200,00: нам винні 1 200,00 (${debt.theyOwe})`);
ok(pulse(DOCS.map(d => ({ ...d, st: 'ok' as const })), BANK, 11, 2026, { today }).lagDays === 0, 'Усе проведено: облік не відстає');

if (fails) { console.log(`\n${fails} перевірок не пройдено`); process.exit(1); }
console.log('\nПульс: усі перевірки пройдено');
