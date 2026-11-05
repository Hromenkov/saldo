// Вивантаження в BAS / 1С у форматі обміну EnterpriseData (XML). BAS завантажує його штатно:
// «Вивантаження і завантаження даних EnterpriseData». На стороні клієнта нічого встановлювати не треба.
// У файл потрапляють лише проведені документи без помилок аудиту: те, що не зійшлося до копійки, в 1С не йде.
import type { Doc } from '../data';
import { auditDoc, kop, type AuditOpts } from '../audit';

export const FORMAT_VERSION = '1.8';
const NS = `http://v8.1c.ru/edi/edi_stnd/EnterpriseData/${FORMAT_VERSION}`;

/** Які документи вміємо вивантажувати і як вони називаються в EnterpriseData. */
const DOC_TYPE: Record<string, { obj: string; op: string; table: 'Товары' | 'Услуги' }> = {
  purchase_goods: { obj: 'ПоступлениеТоваровУслуг', op: 'ПокупкаУПоставщика', table: 'Товары' },
  purchase_service: { obj: 'ПоступлениеТоваровУслуг', op: 'ПокупкаУПоставщика', table: 'Услуги' },
  sale: { obj: 'РеализацияТоваровУслуг', op: 'РеализацияКлиенту', table: 'Товары' }
};
export const exportable = (d: Doc) => !!DOC_TYPE[d.kind];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const amt = (n: number) => (kop(n) / 100).toFixed(2);
const qtyS = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * Стабільний UUID з ключа: той самий контрагент чи документ при повторному вивантаженні отримує ту саму «Ссылку»,
 * тож BAS оновлює його, а не створює дубль. Два незалежні 64-бітні FNV-1a дають 128 біт.
 */
export function stableUuid(key: string): string {
  const fnv = (seed: bigint) => {
    let h = seed;
    for (const ch of new TextEncoder().encode(key)) { h ^= BigInt(ch); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
    return h.toString(16).padStart(16, '0');
  };
  const hex = (fnv(0xcbf29ce484222325n) + fnv(0x84222325cbf29ce4n)).split('');
  hex[12] = '5'; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16); // версія і варіант, як у UUID v5
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const isoDate = (d: Doc, year: number) => {
  const [dd, mm] = d.date.split('.');
  return `${d.y || year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T12:00:00`;
};

/** Ставка ПДВ документа: з суми ПДВ до бази, до найближчої з 20/14/7/0. */
function vatRate(d: Doc): number {
  const net = d.sum - d.vat;
  if (!d.vat || net <= 0) return 0;
  const r = d.vat / net * 100;
  return [20, 14, 7].reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
}
const RATE_ENUM: Record<number, string> = { 20: 'НДС20', 14: 'НДС14', 7: 'НДС7', 0: 'БезНДС' };

export type Company = { name: string; edrpou?: string };

function counterparty(d: Doc): string {
  const code = (d.edrpou || '').replace(/\D/g, '');
  const ref = stableUuid('cp:' + (code || d.cp.toLowerCase()));
  const person = code.length === 10 || /^ФОП\b/i.test(d.cp);
  return `<Контрагент><Ссылка>${ref}</Ссылка><Наименование>${esc(d.cp)}</Наименование><НаименованиеПолное>${esc(d.cp)}</НаименованиеПолное>` +
    `${code ? `<КодПоЕДРПОУ>${code}</КодПоЕДРПОУ>` : ''}<ЮридическоеФизическоеЛицо>${person ? 'ФизическоеЛицо' : 'ЮридическоеЛицо'}</ЮридическоеФизическоеЛицо></Контрагент>`;
}

function rows(d: Doc, rate: number): string {
  const items = d.items?.length && d.items.every(i => i.amount != null)
    ? d.items
    : [{ name: d.type, qty: 1, unit: null, price: d.sum - d.vat, amount: d.sum - d.vat }];
  // ПДВ по рядках розкладаємо так, щоб сума рядків збіглася з ПДВ документа до копійки: залишок округлення — в останній рядок
  const totalVat = kop(d.vat);
  const net = items.reduce((s, i) => s + kop(i.amount!), 0);
  let rest = totalVat;
  const lines = items.map((it, i) => {
    const v = i === items.length - 1 ? rest : net ? Math.round(totalVat * kop(it.amount!) / net) : 0;
    rest -= v;
    const nomRef = stableUuid('nom:' + (it.nom || it.name).toLowerCase());
    return `<Строка><ДанныеНоменклатуры><Номенклатура><Ссылка>${nomRef}</Ссылка><Наименование>${esc(it.nom || it.name)}</Наименование></Номенклатура></ДанныеНоменклатуры>` +
      `${it.unit ? `<ЕдиницаИзмерения><Наименование>${esc(it.unit)}</Наименование></ЕдиницаИзмерения>` : ''}` +
      `<Количество>${qtyS(it.qty ?? 1)}</Количество><Цена>${amt(it.price ?? it.amount!)}</Цена><Сумма>${amt(it.amount!)}</Сумма>` +
      `<СтавкаНДС>${RATE_ENUM[rate]}</СтавкаНДС><СуммаНДС>${amt(v / 100)}</СуммаНДС></Строка>`;
  });
  return lines.join('');
}

function docXml(d: Doc, org: Company, year: number): string {
  const t = DOC_TYPE[d.kind];
  const rate = vatRate(d);
  const ref = stableUuid(`doc:${t.obj}:${d.no}:${isoDate(d, year)}:${d.edrpou || d.cp}`);
  const orgXml = `<Организация><Ссылка>${stableUuid('org:' + (org.edrpou || org.name))}</Ссылка><Наименование>${esc(org.name)}</Наименование>${org.edrpou ? `<КодПоЕДРПОУ>${org.edrpou}</КодПоЕДРПОУ>` : ''}</Организация>`;
  return `<Документ.${t.obj}><КлючевыеСвойства><Ссылка>${ref}</Ссылка><Дата>${isoDate(d, year)}</Дата><Номер>${esc(d.no)}</Номер>${orgXml}</КлючевыеСвойства>` +
    `<ВидОперации>${t.op}</ВидОперации><Валюта><Код>980</Код><Наименование>грн</Наименование></Валюта>` +
    `<Сумма>${amt(d.sum)}</Сумма><СуммаНДС>${amt(d.vat)}</СуммаНДС><ЦенаВключаетНДС>false</ЦенаВключаетНДС>${counterparty(d)}` +
    `${d.comment ? `<Комментарий>${esc(d.comment)}</Комментарий>` : ''}<${t.table}>${rows(d, rate)}</${t.table}></Документ.${t.obj}>`;
}

export type ExportResult = {
  xml: string;
  /** вивантажені документи */
  sent: Doc[];
  /** не вивантажені: причина для кожного */
  held: { doc: Doc; why: string }[];
};

/** Готує файл EnterpriseData: лише проведені документи потрібних видів і без помилок аудиту. */
export function toEnterpriseData(docs: Doc[], org: Company, opts: AuditOpts & { now?: Date } = {}): ExportResult {
  const now = opts.now ?? new Date();
  const sent: Doc[] = [], held: ExportResult['held'] = [];
  for (const d of docs) {
    if (!exportable(d) || d.src === '1С') continue; // те, що прийшло з 1С, назад не відправляємо
    if (d.st !== 'ok') { held.push({ doc: d, why: 'ще не проведено' }); continue; }
    const err = auditDoc(d, opts).find(f => f.sev === 'error');
    if (err) { held.push({ doc: d, why: err.t }); continue; }
    sent.push(d);
  }
  const created = now.toISOString().slice(0, 19);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Message xmlns:msg="http://www.1c.ru/SSL/Exchange/Message" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n` +
    `<msg:Header><msg:Format>${NS}</msg:Format><msg:CreationDate>${created}</msg:CreationDate><msg:AvailableVersion>${FORMAT_VERSION}</msg:AvailableVersion></msg:Header>\n` +
    `<Body xmlns="${NS}">\n${sent.map(d => docXml(d, org, now.getFullYear())).join('\n')}\n</Body>\n</Message>\n`;
  return { xml, sent, held };
}
