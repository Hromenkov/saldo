// Сховище складу. Поки немає бекенду, журнал рухів, техкарти й облікова політика живуть у браузері,
// як і довідник номенклатури. Усі залишки рахуються з журналу (engine.replay), окремо не зберігаються.
import { useSyncExternalStore } from 'react';
import { catalog } from '../recognize/nomenclature';
import { replay, tryAdd, tryRemove, type CostMethod, type Location, type Movement, type StockAcc, type TechCard } from './engine';

export type StockState = { method: CostMethod; locations: Location[]; cards: TechCard[]; movements: Movement[] };
const KEY = 'saldo-stock';

export const DEMO: StockState = {
  method: 'avg',
  locations: [
    { id: 'main', name: 'Центральний склад', note: 'Приймає товар від постачальників' },
    { id: 'kitchen', name: 'Кухня ресторану' },
    { id: 'bar', name: 'Бар' },
    { id: 'hk', name: 'Господарський склад готелю', note: 'Миючі засоби, косметика для номерів, білизна' }
  ],
  cards: [
    { id: 'c1', name: 'Омлет з сиром', out: 1, unit: 'порц', rows: [{ item: 'n7', qty: 3 }, { item: 'n4', qty: 0.05 }, { item: 'n2', qty: 0.03 }, { item: 'n3', qty: 0.01 }] },
    { id: 'c2', name: 'Тісто для млинців (напівфабрикат)', out: 1.5, unit: 'кг', rows: [{ item: 'n5', qty: 0.4 }, { item: 'n4', qty: 1 }, { item: 'n7', qty: 3 }, { item: 'n6', qty: 0.05 }] },
    { id: 'c3', name: 'Млинці з маслом', out: 1, unit: 'порц', rows: [{ card: 'c2', qty: 0.15 }, { item: 'n3', qty: 0.01 }] },
    { id: 'c4', name: 'Капучино', out: 1, unit: 'порц', rows: [{ item: 'n8', qty: 0.018 }, { item: 'n4', qty: 0.15 }, { item: 'n6', qty: 0.01 }] }
  ],
  movements: [
    { id: 'd1', type: 'in', date: '2026-11-01', loc: 'main', doc: 'Видаткова накладна № 23, ТОВ «Агроресурс»', rows: [
      { item: 'n1', acc: '201', qty: 10, value: 2800 }, { item: 'n2', acc: '201', qty: 8, value: 2240 }, { item: 'n3', acc: '201', qty: 5, value: 1650 },
      { item: 'n4', acc: '201', qty: 40, value: 1360 }, { item: 'n5', acc: '201', qty: 25, value: 525 }, { item: 'n6', acc: '201', qty: 20, value: 560 },
      { item: 'n7', acc: '201', qty: 360, value: 1800 }, { item: 'n8', acc: '201', qty: 6, value: 4200 }] },
    { id: 'd2', type: 'in', date: '2026-11-05', loc: 'main', doc: 'Видаткова накладна № 147, ФОП Мельник О.', rows: [
      { item: 'n4', acc: '201', qty: 30, value: 1080 }, { item: 'n7', acc: '201', qty: 180, value: 990 }] },
    { id: 'd3', type: 'move', date: '2026-11-06', loc: 'main', to: 'kitchen', rows: [
      { item: 'n4', qty: 40 }, { item: 'n7', qty: 300 }, { item: 'n5', qty: 10 }, { item: 'n6', qty: 5 }, { item: 'n3', qty: 2 }, { item: 'n2', qty: 3 }] },
    { id: 'd4', type: 'move', date: '2026-11-06', loc: 'main', to: 'bar', rows: [{ item: 'n8', qty: 3 }, { item: 'n4', qty: 25 }, { item: 'n6', qty: 3 }] },
    { id: 'd5', type: 'prod', date: '2026-11-10', loc: 'kitchen', note: 'Продажі за ПРРО, зміна 10.11', sales: [{ card: 'c1', name: 'Омлет з сиром', qty: 40 }, { card: 'c3', name: 'Млинці з маслом', qty: 60 }],
      rows: [{ item: 'n7', qty: 138 }, { item: 'n4', qty: 8 }, { item: 'n2', qty: 1.2 }, { item: 'n3', qty: 1 }, { item: 'n5', qty: 2.4 }, { item: 'n6', qty: 0.3 }] },
    { id: 'd6', type: 'prod', date: '2026-11-10', loc: 'bar', note: 'Продажі за ПРРО, зміна 10.11', sales: [{ card: 'c4', name: 'Капучино', qty: 150 }],
      rows: [{ item: 'n8', qty: 2.7 }, { item: 'n4', qty: 22.5 }, { item: 'n6', qty: 1.5 }] }
  ]
};

let state: StockState = load();
const subs = new Set<() => void>();
function load(): StockState {
  try { const v = localStorage.getItem(KEY); if (v) return { ...structuredClone(DEMO), ...JSON.parse(v) as StockState }; } catch { /* приватний режим */ }
  return structuredClone(DEMO);
}
function save(next: StockState) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* приватний режим */ }
  subs.forEach(f => f());
}

export const getStock = () => state;
export const useStock = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => state);

/** Назва позиції, техкарти чи складу за id (архівні позиції теж: вони є в старих рухах). */
export function nameOf(id: string, s = state): string {
  return catalog().find(c => c.id === id)?.name ?? s.locations.find(l => l.id === id)?.name ?? s.cards.find(c => c.id === id)?.name ?? id;
}
export const unitOf = (id: string) => catalog().find(c => c.id === id)?.unit ?? '';
export const opts = () => ({ name: (id: string) => nameOf(id) });
export const ledger = (s = state, upTo?: string) => replay(s.movements, s.method, { ...opts(), upTo });

export const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** Додати рух. Повертає помилку, якщо не вистачає залишку або зламається пізніший рух. */
export function addMovement(mv: Movement): string | null {
  const r = tryAdd(state.movements, mv, state.method, opts());
  if (!r.ok) return r.error;
  save({ ...state, movements: [...state.movements, mv] });
  return null;
}
export function removeMovement(id: string): string | null {
  const r = tryRemove(state.movements, id, state.method, opts());
  if (!r.ok) return r.error;
  save({ ...state, movements: state.movements.filter(m => m.id !== id) });
  return null;
}

/**
 * Метод оцінки — облікова політика (П(С)БО 9): для однакових запасів один метод, протягом року не змінюється.
 * Змінити можна, лише поки немає жодного списання; інакше собівартість уже проведених документів зміниться.
 */
export function canChangeMethod(s = state) { return !s.movements.some(m => m.type !== 'in'); }
export function setMethod(method: CostMethod): string | null {
  if (!canChangeMethod()) return 'Вже є списання за поточним методом. Метод змінюється з нового року наказом про облікову політику';
  save({ ...state, method });
  return null;
}

export function saveCard(card: TechCard) {
  const cards = state.cards.some(c => c.id === card.id) ? state.cards.map(c => c.id === card.id ? card : c) : [...state.cards, card];
  save({ ...state, cards });
}
/** Техкарти не видаляються: на них посилаються проведені списання і інші картки (напівфабрикати). */
export function archiveCard(id: string, archived: boolean) { save({ ...state, cards: state.cards.map(c => c.id === id ? { ...c, archived } : c) }); }

export function addLocation(name: string) { const loc = { id: newId('l'), name: name.trim() }; save({ ...state, locations: [...state.locations, loc] }); return loc.id; }

/** Надходження з проведеної товарної накладної. Рахунки 152–154 (ОЗ) склад не веде. */
export function receiveFromDoc(docId: number, title: string, date: string, loc: string, acc: string, rows: { item: string; qty: number | null; price: number | null; amount: number | null }[]): { id?: string; error?: string } {
  const a = acc.split(' ')[0] as StockAcc;
  if (!['201', '281', '22'].includes(a)) return {};
  const good = rows.filter(r => r.qty && r.qty > 0).map(r => ({ item: r.item, acc: a, qty: r.qty!, value: r.amount ?? Math.round((r.price ?? 0) * r.qty! * 100) / 100 }));
  if (!good.length) return {};
  const id = 'doc' + docId;
  const err = addMovement({ id, type: 'in', date, loc, doc: title, rows: good });
  return err ? { error: err } : { id };
}
