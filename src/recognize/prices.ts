// Історія закупівельних цін: ціна за одиницю з кожної проведеної товарної накладної, за позицією нашого довідника
// і постачальником. З неї видно, як змінювалась ціна, і підсвічується скачок до попередньої поставки
// («ковбаса +17 % до минулої поставки»). Поріг скачка налаштовується. Поки немає бекенду, історія живе у браузері.
import { useSyncExternalStore } from 'react';
import { partyKey, sameParty } from './suppliers';

/** Одна закупівля позиції: ціна за одиницю так, як у накладній. */
export type PricePoint = { item: string; party: string; cp: string; date: string; price: number; qty: number; unit?: string; doc: string; docId?: number };

const KEY = 'saldo-prices';
const TH = 'saldo-price-threshold';
export const DEFAULT_THRESHOLD = 15;

// демо: закупівлі ресторану за вересень–листопад; листопадові збігаються з надходженнями на склад
const P = (item: string, cp: string, date: string, price: number, qty: number, doc: string): PricePoint => ({ item, party: partyKey(undefined, cp)!, cp, date, price, qty, doc });
const AG = 'ТОВ «Агроресурс»', ML = 'ФОП Мельник О.', MK = 'ТОВ «Молочний край»';
export const DEMO_PRICES: PricePoint[] = [
  P('n1', AG, '2026-09-08', 236, 8, 'Видаткова накладна № 9'), P('n1', AG, '2026-10-06', 240, 10, 'Видаткова накладна № 16'), P('n1', AG, '2026-11-01', 280, 10, 'Видаткова накладна № 23'),
  P('n2', AG, '2026-09-08', 272, 6, 'Видаткова накладна № 9'), P('n2', AG, '2026-10-06', 275, 8, 'Видаткова накладна № 16'), P('n2', AG, '2026-11-01', 280, 8, 'Видаткова накладна № 23'),
  P('n3', AG, '2026-09-08', 300, 5, 'Видаткова накладна № 9'), P('n3', AG, '2026-10-06', 305, 5, 'Видаткова накладна № 16'), P('n3', AG, '2026-11-01', 330, 5, 'Видаткова накладна № 23'),
  P('n4', AG, '2026-10-06', 33, 40, 'Видаткова накладна № 16'), P('n4', AG, '2026-11-01', 34, 40, 'Видаткова накладна № 23'),
  P('n5', AG, '2026-09-08', 21, 25, 'Видаткова накладна № 9'), P('n5', AG, '2026-11-01', 21, 25, 'Видаткова накладна № 23'),
  P('n6', AG, '2026-09-08', 27, 20, 'Видаткова накладна № 9'), P('n6', AG, '2026-11-01', 28, 20, 'Видаткова накладна № 23'),
  P('n7', AG, '2026-09-08', 4.2, 360, 'Видаткова накладна № 9'), P('n7', AG, '2026-10-06', 4.4, 360, 'Видаткова накладна № 16'), P('n7', AG, '2026-11-01', 5, 360, 'Видаткова накладна № 23'),
  P('n8', AG, '2026-09-08', 640, 6, 'Видаткова накладна № 9'), P('n8', AG, '2026-10-06', 650, 6, 'Видаткова накладна № 16'), P('n8', AG, '2026-11-01', 700, 6, 'Видаткова накладна № 23'),
  P('n4', ML, '2026-10-20', 35, 30, 'Видаткова накладна № 131'), P('n4', ML, '2026-11-05', 36, 30, 'Видаткова накладна № 147'),
  P('n7', ML, '2026-10-20', 4.6, 180, 'Видаткова накладна № 131'), P('n7', ML, '2026-11-05', 5.5, 180, 'Видаткова накладна № 147'),
  P('n4', MK, '2026-10-13', 31, 50, 'Видаткова накладна № 512'), P('n4', MK, '2026-11-03', 31.5, 50, 'Видаткова накладна № 540')
];

function read<T>(key: string, def: T): T { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : def; } catch { return def; } }
function write(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* приватний режим */ } }

type State = { points: PricePoint[]; threshold: number };
let state: State = { points: read(KEY, DEMO_PRICES), threshold: read(TH, DEFAULT_THRESHOLD) };
const subs = new Set<() => void>();
function set(next: State) {
  state = next;
  write(KEY, next.points); write(TH, next.threshold);
  subs.forEach(f => f());
}
export const getPrices = () => state;
export const usePrices = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => state);

/** Поріг скачка у відсотках: від 1 до 500. */
export function setThreshold(pct: number) {
  if (!Number.isFinite(pct)) return;
  set({ ...state, threshold: Math.min(500, Math.max(1, Math.round(pct))) });
}

/** Ціна за одиницю з рядка накладної: як написано, а якщо ціни немає — сума на кількість. */
export function unitPrice(row: { qty: number | null; price: number | null; amount: number | null }): number | null {
  if (row.price != null && row.price > 0) return row.price;
  if (row.amount != null && row.qty) return Math.round(row.amount / row.qty * 100) / 100;
  return null;
}

/** Записати ціни проведеної накладної. Повторне проведення того самого документа замінює його рядки. */
export function recordDoc(docId: number, points: Omit<PricePoint, 'docId'>[]) {
  const good = points.filter(p => p.item && p.price > 0).map(p => ({ ...p, docId }));
  set({ ...state, points: [...state.points.filter(p => p.docId !== docId), ...good] });
}
/** Прибрати ціни документа (скасування проведення). */
export function forgetDoc(docId: number) {
  if (state.points.some(p => p.docId === docId)) set({ ...state, points: state.points.filter(p => p.docId !== docId) });
}

const sameSupplier = (p: PricePoint, party: string | undefined, cp: string) => (!!party && p.party === party) || sameParty(p.cp, cp);
const byDate = (a: PricePoint, b: PricePoint) => a.date.localeCompare(b.date);
export const pct = (now: number, was: number) => Math.round((now / was - 1) * 1000) / 10;

export type Compare = {
  /** з чим порівнюємо: остання закупівля в цього постачальника, а якщо її немає — остання в будь-кого */
  ref: PricePoint; same: boolean; pct: number; jump: boolean;
  /** дешевше в іншого постачальника за останні 90 днів */
  alt?: PricePoint;
};

/** Порівняти ціну нової закупівлі з попередніми закупівлями тієї самої позиції. */
export function compare(hist: PricePoint[], q: { item: string; party?: string; cp: string; date: string; price: number; docId?: number }, threshold: number): Compare | undefined {
  const before = hist.filter(p => p.item === q.item && (q.docId == null || p.docId !== q.docId) && p.date <= q.date).sort(byDate);
  if (!before.length) return undefined;
  const own = before.filter(p => sameSupplier(p, q.party, q.cp));
  const ref = own.length ? own[own.length - 1] : before[before.length - 1];
  const d = pct(q.price, ref.price);
  const since = new Date(Date.parse(q.date) - 90 * 864e5).toISOString().slice(0, 10);
  const others = new Map<string, PricePoint>();
  for (const p of before) if (!sameSupplier(p, q.party, q.cp) && p.date >= since) others.set(p.party, p);
  const alt = [...others.values()].filter(p => p.price < q.price).sort((a, b) => a.price - b.price)[0];
  return { ref, same: own.length > 0, pct: d, jump: d >= threshold, alt };
}

export type Line = { item: string; party: string; cp: string; points: PricePoint[]; last: PricePoint; prev?: PricePoint; pct?: number; jump: boolean };

/** Динаміка за кожною парою «позиція + постачальник»: остання ціна, попередня і зміна. */
export function lines(hist: PricePoint[], threshold: number): Line[] {
  const g = new Map<string, PricePoint[]>();
  for (const p of hist) {
    const k = p.item + '|' + ([...g.keys()].find(x => x.startsWith(p.item + '|') && sameSupplier(g.get(x)![0], p.party, p.cp))?.split('|')[1] ?? p.party);
    g.set(k, [...(g.get(k) || []), p]);
  }
  return [...g.values()].map(ps => {
    const points = ps.sort(byDate), last = points[points.length - 1], prev = points[points.length - 2];
    const d = prev ? pct(last.price, prev.price) : undefined;
    return { item: last.item, party: last.party, cp: last.cp, points, last, prev, pct: d, jump: d != null && d >= threshold };
  });
}
