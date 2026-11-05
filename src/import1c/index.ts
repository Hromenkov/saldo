// Імпорт вивантажень з 1С / BAS: банківська виписка 1CClientBankExchange, EnterpriseData (XML), ОСВ (Excel).
// Усе читається в браузері, нічого не надсилається на сервер.
import { unzipSync, strFromU8 } from 'fflate';
import type { BankRow, Doc } from '../data';

export type LedgerRow = [string, string, number, number, number, number, number, number];
/** Позиція номенклатури з BAS: код, назва, одиниця. */
export type BasItem = { code?: string; name: string; unit?: string; archived?: boolean };

export type Imported =
  | { kind: 'bank'; rows: BankRow[]; account: string }
  | { kind: 'docs'; docs: Omit<Doc, 'id'>[]; partners: number; items: BasItem[] }
  | { kind: 'ledger'; rows: LedgerRow[]; period: string };

export const is1cFile = (f: File) => /\.(txt|xml|xlsx|csv)$/i.test(f.name);

/** Файли 1С часто у windows-1251. Пробуємо UTF-8, а якщо бачимо зіпсовані символи, перечитуємо як 1251. */
export function decode(buf: ArrayBuffer): string {
  const u = new TextDecoder('utf-8').decode(buf);
  return u.includes('�') ? new TextDecoder('windows-1251').decode(buf) : u;
}

const num = (s: string | undefined | null) => {
  if (s == null) return 0;
  const n = Number(String(s).replace(/\s| /g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};
const ddmm = (s: string) => {
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return `${m[1]}.${m[2]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}` : s;
};

// ---------- 1CClientBankExchange ----------

export function parseBankExchange(text: string): Imported {
  if (!text.startsWith('1CClientBankExchange')) throw new Error('Це не файл обміну з клієнт-банком 1С');
  const lines = text.split(/\r?\n/);
  const head: Record<string, string> = {};
  const docs: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('СекцияДокумент')) { cur = { _type: line.split('=')[1] || '' }; continue; }
    if (line === 'КонецДокумента') { if (cur) docs.push(cur); cur = null; continue; }
    const i = line.indexOf('='); if (i < 0) continue;
    const k = line.slice(0, i), v = line.slice(i + 1);
    if (cur) cur[k] = v; else if (k === 'РасчСчет' && !head.РасчСчет) head.РасчСчет = v; else head[k] = v;
  }
  const own = (head.РасчСчет || '').replace(/\s/g, '');
  const rows: BankRow[] = docs.map(d => {
    const to = (d.ПолучательСчет || d.ПолучательРасчСчет || '').replace(/\s/g, '');
    const incoming = own ? to === own : !!d.ДатаПоступило;
    const sum = num(d.Сумма);
    const cp = incoming ? (d.Плательщик1 || d.Плательщик || '') : (d.Получатель1 || d.Получатель || '');
    return {
      d: ddmm(d.Дата || d.ДатаСписано || d.ДатаПоступило || ''), cp: cp.trim() || 'Без назви', p: (d.НазначениеПлатежа || '').trim(),
      s: incoming ? sum : -sum, dt: incoming ? '311' : '?', kt: incoming ? '?' : '311', st: 'check'
    };
  });
  return { kind: 'bank', rows, account: own };
}

// ---------- EnterpriseData ----------

const DOC_NAMES: Record<string, [string, string]> = {
  ПоступлениеТоваровУслуг: ['Прибуткова накладна', 'purchase_goods'],
  РеализацияТоваровУслуг: ['Видаткова накладна', 'sale'],
  СчетНаОплатуПокупателю: ['Рахунок покупцю', 'sale'],
  СчетНаОплатуОтПоставщика: ['Рахунок постачальника', 'purchase_service'],
  НалоговаяНакладная: ['Податкова накладна', 'pn'],
  РегистрацияВходящегоНалоговогоДокумента: ['Податкова накладна (вхідна)', 'pn'],
  АвансовыйОтчет: ['Авансовий звіт', 'other'],
  ПлатежноеПоручениеИсходящее: ['Платіжне доручення', 'other'],
  ПоступлениеНаРасчетныйСчет: ['Надходження на рахунок', 'other'],
  ПриходныйКассовыйОрдер: ['Прибутковий касовий ордер', 'other'],
  РасходныйКассовыйОрдер: ['Видатковий касовий ордер', 'other'],
  ОтчетОРозничныхПродажах: ['Звіт про роздрібні продажі', 'sale'],
  АктВыполненныхРабот: ['Акт виконаних робіт', 'purchase_service']
};

// childNodes, а не children: так само працює і в браузері, і в xmldom у перевірках
const kids = (el: Element) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1);
const first = (el: Element | undefined, ...names: string[]): Element | undefined => {
  if (!el) return undefined;
  for (const n of names) {
    const hit = el.getElementsByTagName(n)[0] || Array.from(el.getElementsByTagName('*')).find(x => x.localName === n);
    if (hit) return hit;
  }
  return undefined;
};
const txt = (el: Element | undefined, ...names: string[]) => first(el, ...names)?.textContent?.trim() || '';

export function parseEnterpriseData(text: string): Imported {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('XML пошкоджений або не дочитаний до кінця');
  const body = Array.from(xml.getElementsByTagName('*')).find(e => e.localName === 'Body');
  if (!body) throw new Error('Це не вивантаження EnterpriseData: немає розділу Body');
  const docs: Omit<Doc, 'id'>[] = [];
  let partners = 0;
  // номенклатура: і з довідника, і з рядків документів (там BAS кладе посилання з кодом і назвою)
  const items = new Map<string, BasItem>();
  const addItem = (el: Element, fromCatalog = false) => {
    const key = first(el, 'КлючевыеСвойства') || el;
    const name = txt(key, 'Наименование') || txt(el, 'НаименованиеПолное');
    if (!name) return;
    const code = txt(key, 'Код') || undefined;
    const unitEl = first(el, 'ЕдиницаИзмерения', 'БазоваяЕдиницаИзмерения');
    const unit = unitEl ? (txt(unitEl, 'Наименование') || unitEl.textContent?.trim()) || undefined : undefined;
    // помітку на видалення беремо лише з довідника: у рядку документа її немає
    const archived = fromCatalog ? /^true$/i.test(txt(el, 'ПометкаУдаления')) : undefined;
    const k = code || name.toLowerCase();
    const prev = items.get(k);
    items.set(k, { code, name, unit: unit || prev?.unit, archived: archived ?? prev?.archived });
  };
  for (const el of kids(body)) {
    const name = el.localName;
    if (name === 'Справочник.Контрагенты') { partners++; continue; }
    if (name === 'Справочник.Номенклатура') { addItem(el, true); continue; }
    if (name.startsWith('Документ.')) Array.from(el.getElementsByTagName('*')).filter(x => x.localName === 'Номенклатура' && kids(x).length).forEach(x => addItem(x));
    if (!name.startsWith('Документ.')) continue;
    const short = name.slice('Документ.'.length);
    let [type, kind] = DOC_NAMES[short] || [short.replace(/([а-яієї])([А-ЯІЄЇ])/g, '$1 $2'), 'other'];
    // поступлення лише з табличною частиною «Услуги» — це акт, а не накладна
    if (short === 'ПоступлениеТоваровУслуг' && kids(el).some(t => t.localName === 'Услуги') && !kids(el).some(t => t.localName === 'Товары')) [type, kind] = ['Акт наданих послуг', 'purchase_service'];
    const key = first(el, 'КлючевыеСвойства') || el;
    const cpEl = first(el, 'Контрагент');
    // рядки табличних частин «Товары» і «Услуги»: з них аудит перевіряє кількість × ціну і ПДВ
    const rows = kids(el).filter(t => t.localName === 'Товары' || t.localName === 'Услуги').flatMap(t => kids(t).filter(r => r.localName === 'Строка'));
    const own = (r: Element, n: string) => kids(r).find(x => x.localName === n)?.textContent?.trim() || '';
    const docItems = rows.map(r => {
      const nom = first(r, 'Номенклатура'), unitEl = first(r, 'ЕдиницаИзмерения');
      return {
        name: txt(nom, 'Наименование') || txt(r, 'Содержание') || '—', qty: own(r, 'Количество') ? num(own(r, 'Количество')) : null,
        unit: unitEl ? (txt(unitEl, 'Наименование') || unitEl.textContent?.trim() || null) : null,
        price: own(r, 'Цена') ? num(own(r, 'Цена')) : null, amount: own(r, 'Сумма') ? num(own(r, 'Сумма')) : null,
        vat: num(own(r, 'СуммаНДС'))
      };
    });
    const top = (n: string) => kids(el).find(x => x.localName === n)?.textContent?.trim();
    const sum = num(top('СуммаДокумента') ?? top('Сумма') ?? txt(el, 'СуммаДокумента', 'Сумма'));
    const vat = top('СуммаНДС') != null ? num(top('СуммаНДС')) : rows.length ? Math.round(docItems.reduce((a, x) => a + x.vat, 0) * 100) / 100 : num(txt(el, 'СуммаНДС'));
    docs.push({
      type, no: txt(key, 'Номер') || '—', cp: txt(cpEl, 'НаименованиеПолное', 'Наименование') || '—',
      date: ddmm(txt(key, 'Дата')), y: txt(key, 'Дата').slice(0, 4) || undefined, sum, vat, st: 'ok', src: '1С', conf: 100, kind,
      lines: [], edrpou: txt(cpEl, 'КодПоЕДРПОУ', 'ИНН') || undefined,
      ...(docItems.length ? { items: docItems.map(({ vat: _v, ...it }) => it) } : {})
    });
  }
  if (!docs.length && !items.size) throw new Error(partners ? `У файлі лише довідник контрагентів (${partners}), документів і номенклатури немає` : 'У файлі не знайдено документів');
  return { kind: 'docs', docs, partners, items: [...items.values()] };
}

// ---------- ОСВ з Excel ----------

function xlsxRows(buf: ArrayBuffer): string[][] {
  const z = unzipSync(new Uint8Array(buf));
  const p = new DOMParser();
  const shared = z['xl/sharedStrings.xml']
    ? Array.from(p.parseFromString(strFromU8(z['xl/sharedStrings.xml']), 'application/xml').getElementsByTagName('si')).map(si => si.textContent || '')
    : [];
  const sheetName = Object.keys(z).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new Error('В Excel-файлі немає аркушів');
  const sheet = p.parseFromString(strFromU8(z[sheetName]), 'application/xml');
  const col = (ref: string) => ref.replace(/\d+/g, '').split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return Array.from(sheet.getElementsByTagName('row')).map(r => {
    const out: string[] = [];
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? c.textContent ?? '';
      out[col(c.getAttribute('r') || 'A1')] = t === 's' ? shared[Number(v)] ?? '' : v;
    }
    return Array.from(out, x => x ?? '');
  });
}

function csvRows(text: string): string[][] {
  const sep = (text.split('\n')[0].match(/;/g)?.length || 0) > (text.split('\n')[0].match(/,/g)?.length || 0) ? ';' : ',';
  return text.split(/\r?\n/).map(l => l.split(sep).map(x => x.replace(/^"|"$/g, '').trim()));
}

/** ОСВ у будь-якій типовій формі: рядок рахунку = код рахунку, назва і шість сум (сальдо, обороти, сальдо). */
export function parseOsv(rows: string[][]): Imported {
  const out: LedgerRow[] = [];
  let period = '';
  // колонки сум визначаємо за рядком заголовка «Дебет / Кредит» ×3: порожня клітинка в ОСВ означає нуль
  let cols: number[] | null = null;
  for (const r of rows) {
    const line = r.join(' ');
    if (!period) { const m = line.match(/(\d{2}\.\d{2}\.\d{4})\s*[-–]\s*(\d{2}\.\d{2}\.\d{4})/) || line.match(/за\s+([а-яієїґ]+\s+\d{4})/i); if (m) period = m[0]; }
    if (!cols) {
      const dk = r.map((c, i) => (/^(дебет|кредит|дт|кт)$/i.test((c || '').trim()) ? i : -1)).filter(i => i >= 0);
      if (dk.length >= 6) { cols = dk.slice(0, 6); continue; }
    }
    const ci = r.findIndex(c => /^\d{2,3}(\.\d{1,2})?$/.test((c || '').trim()));
    if (ci < 0 || ci > 1) continue;
    const code = r[ci].trim();
    const name = (r.slice(ci + 1).find(c => c && /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(c)) || '').trim();
    let vals: number[];
    if (cols) vals = cols.map(i => num(r[i]));
    else {
      const nums = r.slice(ci + 1).filter(c => c && /^-?[\d\s\u00a0]+([.,]\d+)?$/.test(c.trim())).map(num);
      if (nums.length !== 6) continue;
      vals = nums;
    }
    if (vals.every(v => v === 0)) continue;
    out.push([code, name, ...(vals as [number, number, number, number, number, number])]);
  }
  if (!out.length) throw new Error('Не знайдено рядків ОСВ: очікую код рахунку, назву і колонки Дебет/Кредит');
  return { kind: 'ledger', rows: out, period };
}

export async function import1c(file: File): Promise<Imported> {
  const buf = await file.arrayBuffer();
  if (/\.xlsx$/i.test(file.name)) return parseOsv(xlsxRows(buf));
  const text = decode(buf).replace(/^﻿/, '');
  if (text.startsWith('1CClientBankExchange')) return parseBankExchange(text);
  if (/\.xml$/i.test(file.name) || text.trimStart().startsWith('<')) return parseEnterpriseData(text);
  if (/\.csv$/i.test(file.name)) return parseOsv(csvRows(text));
  throw new Error(`${file.name}: невідомий формат`);
}
