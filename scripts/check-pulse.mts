// «Пульс» власника: цифри з тих самих документів і банку. Запуск: npm test
import { pulse } from '../src/audit/pulse';
import { BANK, DOCS } from '../src/data';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const today = new Date('2026-11-18T12:00:00');
const p = pulse(DOCS, BANK, 11, 2026, { today });

ok(p.cashIn === 52200 && p.cashOut === 73365.4, `Банк за листопад: надійшло 52 200,00, сплачено 73 365,40 (${p.cashIn} / ${p.cashOut})`);
ok(p.revenue === 52500, `Виручка без ПДВ за проведеними документами: 40 500 + 12 000 = 52 500,00 (${p.revenue})`);
ok(p.costs === 34400, `Витрати: лише проведені листопадові документи, 12 400 + 22 000 = 34 400,00 (${p.costs})`);
ok(p.theyOwe === 14400 && p.weOwe === 16400, `Борги: Бізнес-центр не оплатив 14 400,00, Кавовому двору лишилось 16 400,00 (${p.theyOwe} / ${p.weOwe})`);
ok(p.debtors.length === 1 && p.debtors[0].cp === 'ТОВ «Бізнес-центр Поділ»' && p.creditors.length === 1 && p.creditors[0].sum === 16400, 'Списки боржників: Агроресурс, Коваленко і Логістик-Захід оплачені й туди не потрапляють');
ok(p.docs === 8 && p.posted === 4 && p.waiting === 4, `Документи листопада: 8, проведено 4, чекають 4 (${p.docs}/${p.posted}/${p.waiting})`);
ok(p.lagDays === 8 && p.oldest?.no === '2291', `Найстаріший непроведений документ (Енергозбут, 10.11) лежить 8 днів (${p.lagDays})`);
ok(p.notInBas === 3, 'Не вивантажено в BAS: видаткова № 418, акт № 77 і накладна КД-3307 (№ 421 уже в BAS)');
ok(pulse(DOCS.map(d => ({ ...d, basAt: '2026-11-30' })), BANK, 11, 2026, { today }).notInBas === 0, 'Після вивантаження «не в BAS» = 0');

const debt = pulse([...DOCS, { ...DOCS[0], id: 99, no: '419', sum: 1200, vat: 200, lines: [['361', '702', 1200, ''], ['702', '6412', 200, '']] as [string, string, number, string][] }], BANK, 11, 2026, { today });
ok(debt.theyOwe === 15600, `Ще одна неоплачена видаткова на 1 200,00: нам винні 15 600,00 (${debt.theyOwe})`);
ok(pulse(DOCS.map(d => ({ ...d, st: 'ok' as const })), BANK, 11, 2026, { today }).lagDays === 0, 'Усе проведено: облік не відстає');

if (fails) { console.log(`\n${fails} перевірок не пройдено`); process.exit(1); }
console.log('\nПульс: усі перевірки пройдено');
