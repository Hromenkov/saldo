// Вивантаження в BAS (EnterpriseData) і зворотне читання нашим же імпортом: суми мають зійтися до копійки. Запуск: npm test
import { DOMParser } from '@xmldom/xmldom';
import { stableUuid, toEnterpriseData } from '../src/import1c/export';
import { parseEnterpriseData } from '../src/import1c/index';
import { DOCS, type Doc } from '../src/data';
import { audit } from '../src/audit/index';

(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = DOMParser;
let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
const today = new Date('2026-11-30T12:00:00');
const org = { name: 'ТОВ «Приклад»', edrpou: '32855961' };

ok(stableUuid('cp:1') === stableUuid('cp:1') && stableUuid('cp:1') !== stableUuid('cp:2') && /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(stableUuid('x')), 'Стабільний UUID: той самий ключ — той самий, формат UUID v5');

const goods: Doc = {
  id: 50, type: 'Видаткова накладна', no: '14', cp: 'ФОП Лучаш & Ко <тест>', edrpou: '3012345670', date: '04.11', sum: 1388.4, vat: 231.4, st: 'ok', src: 'Фото', conf: 98, kind: 'purchase_goods',
  items: [{ name: 'Цукор', qty: 10, price: 45.5, amount: 455, unit: 'кг' }, { name: 'Борошно', qty: 3, price: 167.33, amount: 501.99, unit: 'мішок' }, { name: 'Сіль', qty: 1, price: 200.01, amount: 200.01, unit: 'шт' }],
  lines: [['201', '631', 1157, ''], ['6441', '631', 231.4, '']]
};
const broken: Doc = { ...goods, id: 51, no: '15', vat: 231.45, sum: 1388.45, lines: [['201', '631', 1157, ''], ['6441', '631', 231.45, '']] };
const pending: Doc = { ...goods, id: 52, no: '16', st: 'new' };
const r = toEnterpriseData([...DOCS, goods, broken, pending], org, { today, now: today });

ok(r.sent.some(d => d.id === 50) && r.sent.some(d => d.id === 1) && r.sent.some(d => d.id === 2), 'Вивантажено: накладна № 14, видаткова № 418, акт № 77');
ok(r.held.some(h => h.doc.id === 51 && /ПДВ/.test(h.why)), 'Накладна з ПДВ, що не сходиться на 0,05 ₴, не вивантажується');
ok(r.held.some(h => h.doc.id === 52 && /не проведено/.test(h.why)), 'Непроведена накладна не вивантажується');
ok(!r.sent.some(d => d.kind === 'other' || d.kind === 'pn' || d.kind === 'payroll'), 'ТТН, податкова накладна, зарплата не потрапляють у файл');
ok(r.xml.includes('&amp; Ко &lt;тест&gt;') && !r.xml.includes('<тест>'), 'Спецсимволи в назві екрановано');
ok(r.xml.includes('<КодПоЕДРПОУ>3012345670</КодПоЕДРПОУ>') && r.xml.includes('ФизическоеЛицо'), 'ФОП: код і вид особи');

// ПДВ по рядках у сумі дає рівно ПДВ документа
const rowVat = [...r.xml.matchAll(/<Номер>14<\/Номер>[\s\S]*?<\/Документ\.ПоступлениеТоваровУслуг>/g)][0][0];
const vats = [...rowVat.matchAll(/<Строка>[\s\S]*?<СуммаНДС>([\d.]+)<\/СуммаНДС>/g)].map(m => Math.round(Number(m[1]) * 100));
ok(vats.length === 3 && vats.reduce((a, b) => a + b, 0) === 23140, `ПДВ по рядках (${vats.map(v => v / 100).join(' + ')}) = 231,40 до копійки`);

// зворотне читання
const back = parseEnterpriseData(r.xml);
if (back.kind !== 'docs') throw new Error('очікував документи');
const n14 = back.docs.find(d => d.no === '14')!;
ok(back.docs.length === r.sent.length, `Прочитано назад ${back.docs.length} документів із ${r.sent.length}`);
ok(n14 && n14.sum === 1388.4 && n14.vat === 231.4 && n14.edrpou === '3012345670' && n14.date === '04.11' && n14.y === '2026', 'Накладна № 14: сума, ПДВ, код, дата збереглися');
ok(n14.items?.length === 3 && n14.items[1].qty === 3 && n14.items[1].price === 167.33 && n14.items[1].amount === 501.99 && n14.items[1].unit === 'мішок', 'Рядки накладної збереглися: 3 × 167,33 = 501,99 мішок');
const a77 = back.docs.find(d => d.no === '77')!;
ok(a77?.kind === 'purchase_service' && a77.sum === 12400, 'Акт № 77 читається назад як акт послуг на 12 400,00');
const s418 = back.docs.find(d => d.no === '418')!;
ok(s418?.kind === 'sale' && s418.sum === 48600 && s418.vat === 8100, 'Видаткова № 418: 48 600,00, ПДВ 8 100,00');

const reaudit = audit(back.docs.map((d, i) => ({ ...d, id: 1000 + i })), [], { today });
ok(reaudit.errors === 0, `Прочитане з файлу проходить аудит без помилок (${reaudit.findings.map(f => f.t).join('; ') || 'чисто'})`);

// повторне вивантаження дає ті самі посилання: BAS оновить документ, а не створить дубль
const again = toEnterpriseData([...DOCS, goods], org, { today, now: today });
const refs = (x: string) => [...x.matchAll(/<КлючевыеСвойства><Ссылка>([^<]+)/g)].map(m => m[1]).sort().join();
ok(refs(again.xml) === refs(r.xml), 'Повторне вивантаження: ті самі «Ссылка» документів');

if (fails) { console.log(`\n${fails} перевірок не пройдено`); process.exit(1); }
console.log('\nВивантаження в BAS: усі перевірки пройдено');
