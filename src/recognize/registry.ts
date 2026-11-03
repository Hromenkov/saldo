// Реєстр підтверджених документів. Поки немає бекенду, список документів живе лише до перезавантаження сторінки,
// а дублікати треба ловити й після нього: тому номер, дата, контрагент, сума і товари підтверджених документів
// зберігаються у браузері.
import type { Doc } from '../data';

const KEY = 'saldo-posted';
type Lite = Pick<Doc, 'id' | 'type' | 'no' | 'cp' | 'date' | 'y' | 'sum' | 'vat' | 'edrpou' | 'kind'> & { items?: { name: string }[] };

function load(): Lite[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Lite[]; } catch { return []; } }

export function remember(d: Doc) {
  const list = load().filter(x => x.id !== d.id || x.no !== d.no);
  list.push({ id: d.id, type: d.type, no: d.no, cp: d.cp, date: d.date, y: d.y, sum: d.sum, vat: d.vat, edrpou: d.edrpou, kind: d.kind, items: d.items?.map(it => ({ name: it.name })) });
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-5000))); } catch { /* приватний режим */ }
}

/** Поточні документи плюс підтверджені раніше (з реєстру), без повторів. */
export function withPosted(docs: Doc[]): Doc[] {
  const seen = new Set(docs.map(d => `${d.no}|${d.cp}|${d.date}|${d.sum}`));
  const old = load().filter(x => !seen.has(`${x.no}|${x.cp}|${x.date}|${x.sum}`))
    .map(x => ({ ...x, st: 'ok' as const, src: 'Сальдо', conf: 100, lines: [], items: x.items?.map(it => ({ name: it.name, qty: null, unit: null, price: null, amount: null })) }));
  return [...docs, ...old];
}
