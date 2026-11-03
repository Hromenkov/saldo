// Складський облік: партії за місцями зберігання, собівартість (середня або FIFO), списання за техкартами.
// Без React і без браузерних API: той самий код працює в застосунку і в скрипті перевірки (npm test).
//
// Головна ідея: залишки не зберігаються, а щоразу виходять з журналу рухів. Журнал «програється» за датою,
// тому документ заднім числом, скасування чи зміна методу оцінки дають правильну собівартість усіх
// наступних списань. Рух, для якого не вистачає залишку, не проводиться: від'ємних залишків немає.
import { COST_ACCOUNTS } from '../recognize/chart';

/** Рахунки запасів, які веде склад. */
export const STOCK_ACCOUNTS = ['201', '281', '22'] as const;
export type StockAcc = typeof STOCK_ACCOUNTS[number];
/** Метод оцінки вибуття (П(С)БО 9, п. 16). Середньозважена рахується по кожному місцю зберігання окремо. */
export type CostMethod = 'avg' | 'fifo';

export type Location = { id: string; name: string; note?: string };
/** Рядок техкарти: позиція довідника або напівфабрикат (інша техкарта), кількість брутто на вихід картки. */
export type CardRow = { item?: string; card?: string; qty: number };
export type TechCard = { id: string; name: string; out: number; unit: string; rows: CardRow[]; archived?: boolean };

type Base = { id: string; date: string; loc: string; note?: string; doc?: string };
/** Надходження: вартість без ПДВ береться з накладної, проводку Дт 201/281/22 Кт 631 робить сама накладна. */
export type MvIn = Base & { type: 'in'; rows: { item: string; acc: StockAcc; qty: number; value: number }[] };
/** Переміщення між місцями зберігання: партії переходять зі своєю собівартістю і датою. */
export type MvMove = Base & { type: 'move'; to: string; rows: { item: string; acc?: StockAcc; qty: number }[] };
/** Списання за техкартами: продані страви розкладено на сировину в момент створення (rows), щоб зміна картки не переписала історію. */
export type MvProd = Base & { type: 'prod'; sales: { card: string; name: string; qty: number }[]; rows: { item: string; acc?: StockAcc; qty: number }[] };
/** Списання на витрати (господарські матеріали готелю, МШП у експлуатацію). Рахунок витрат затверджує бухгалтер. */
export type MvOut = Base & { type: 'out'; cost: string; rows: { item: string; acc?: StockAcc; qty: number }[] };
/** Інвентаризація: фактичні залишки; різниця з обліковими стає нестачею (947) або надлишком (719). */
export type MvCount = Base & { type: 'count'; rows: { item: string; acc: StockAcc; fact: number }[] };
export type Movement = MvIn | MvMove | MvProd | MvOut | MvCount;

export type Lot = { id: string; item: string; acc: StockAcc; loc: string; date: string; src: string; qty: number; value: number };
export type Posting = [string, string, number, string];
/** Що рух зробив насправді: скільки й за якою собівартістю списано з яких партій. */
export type RowResult = { item: string; acc: StockAcc; qty: number; value: number; lots: { lot: string; qty: number; value: number }[] };
export type MvResult = { id: string; ok: boolean; error?: string; rows: RowResult[]; postings: Posting[] };
export type Ledger = { lots: Lot[]; results: Record<string, MvResult> };

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 1e-9;

/** Порядок програвання: дата, потім надходження раніше витрат того самого дня, потім порядок введення. */
const TYPE_ORDER: Record<Movement['type'], number> = { in: 0, move: 1, count: 2, prod: 3, out: 4 };
export const ordered = (mv: Movement[]) => mv.map((m, i) => ({ m, i }))
  .sort((a, b) => a.m.date.localeCompare(b.m.date) || TYPE_ORDER[a.m.type] - TYPE_ORDER[b.m.type] || a.i - b.i).map(x => x.m);

const open = (lots: Lot[], loc: string, item: string, acc?: StockAcc) =>
  lots.filter(l => l.loc === loc && l.item === item && (!acc || l.acc === acc) && l.qty > EPS)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

export const balanceOf = (lots: Lot[], loc: string, item: string, acc?: StockAcc) =>
  open(lots, loc, item, acc).reduce((s, l) => ({ qty: r3(s.qty + l.qty), value: r2(s.value + l.value) }), { qty: 0, value: 0 });

/** Рахунок, з якого брати позицію, якщо його не вказано: сировина, потім товари, потім МШП. */
function pickAcc(lots: Lot[], loc: string, item: string, qty: number): StockAcc | undefined {
  for (const a of STOCK_ACCOUNTS) if (balanceOf(lots, loc, item, a).qty + EPS >= qty) return a;
  return undefined;
}

/**
 * Списати qty з партій (loc, item, acc). FIFO: кожна партія за своєю ціною, від найстарішої.
 * Середня: вартість = частка від загальної вартості залишку, партії зменшуються від найстарішої
 * і переоцінюються за середньою, щоб сума партій дорівнювала обліковому залишку.
 */
function take(lots: Lot[], loc: string, item: string, acc: StockAcc, qty: number, method: CostMethod): RowResult {
  const ls = open(lots, loc, item, acc);
  const tot = ls.reduce((s, l) => ({ qty: s.qty + l.qty, value: s.value + l.value }), { qty: 0, value: 0 });
  const res: RowResult = { item, acc, qty: r3(qty), value: 0, lots: [] };
  let left = qty;
  for (const l of ls) {
    if (left <= EPS) break;
    const q = Math.min(l.qty, left);
    const v = Math.abs(q - l.qty) < EPS ? l.value : r2(l.value * q / l.qty);
    res.lots.push({ lot: l.id, qty: r3(q), value: v });
    l.qty = r3(l.qty - q); l.value = r2(l.value - v); left = r3(left - q);
  }
  if (method === 'fifo') res.value = r2(res.lots.reduce((s, x) => s + x.value, 0));
  else {
    // середня: увесь залишок, якщо списуємо все, інакше пропорційно кількості
    res.value = Math.abs(qty - tot.qty) < EPS ? r2(tot.value) : r2(tot.value * qty / tot.qty);
    const rest = r2(tot.value - res.value), remain = ls.filter(l => l.qty > EPS), rq = remain.reduce((s, l) => s + l.qty, 0);
    let acc2 = 0;
    remain.forEach((l, i) => { l.value = i === remain.length - 1 ? r2(rest - acc2) : r2(rest * l.qty / rq); acc2 = r2(acc2 + l.value); });
    // у розбивці по партіях показуємо середню собівартість, остання партія бере копійки округлення
    let given = 0;
    res.lots.forEach((x, i) => { x.value = i === res.lots.length - 1 ? r2(res.value - given) : r2(res.value * x.qty / qty); given = r2(given + x.value); });
  }
  return res;
}

const sumBy = (rows: RowResult[], acc?: StockAcc) => r2(rows.filter(r => !acc || r.acc === acc).reduce((s, r) => s + r.value, 0));

/** Програти журнал: партії на кінець і результат кожного руху. Рух з помилкою не змінює залишків. */
export type ReplayOpts = { upTo?: string; name?: (id: string) => string };
export function replay(movements: Movement[], method: CostMethod, opts: ReplayOpts = {}): Ledger {
  const { upTo, name = (id: string) => id } = opts;
  const lots: Lot[] = []; const results: Record<string, MvResult> = {};
  let seq = 0;
  for (const m of ordered(movements)) {
    if (upTo && m.date > upTo) break;
    const snapshot = lots.map(l => ({ ...l }));
    const res: MvResult = { id: m.id, ok: true, rows: [], postings: [] };
    const fail = (e: string) => { res.ok = false; res.error = e; res.rows = []; res.postings = []; lots.splice(0, lots.length, ...snapshot.map(l => ({ ...l }))); };
    const issue = (rows: { item: string; acc?: StockAcc; qty: number }[]) => {
      // рядки списуються по черзі; якщо якогось не вистачає, рух відкочується повністю
      for (const r of rows) {
        if (!(r.qty > 0)) { fail('Кількість має бути більшою за нуль'); return false; }
        const acc = r.acc || pickAcc(lots, m.loc, r.item, r.qty);
        const have = balanceOf(lots, m.loc, r.item, acc).qty;
        if (!acc || have + EPS < r.qty) { fail(`Не вистачає «${name(r.item)}» на складі «${name(m.loc)}»: потрібно ${r3(r.qty)}, є ${have}`); return false; }
        res.rows.push(take(lots, m.loc, r.item, acc, r.qty, method));
      }
      return true;
    };
    switch (m.type) {
      case 'in':
        for (const r of m.rows) {
          if (!(r.qty > 0) || r.value < 0) { fail('Кількість має бути більшою за нуль, вартість не від’ємною'); break; }
          const lot: Lot = { id: `${m.id}#${++seq}`, item: r.item, acc: r.acc, loc: m.loc, date: m.date, src: m.doc || m.note || 'Надходження', qty: r3(r.qty), value: r2(r.value) };
          lots.push(lot);
          res.rows.push({ item: r.item, acc: r.acc, qty: lot.qty, value: lot.value, lots: [{ lot: lot.id, qty: lot.qty, value: lot.value }] });
        }
        // проводку Дт 201/281/22 Кт 631 і ПДВ робить накладна; склад лише приймає партії
        break;
      case 'move':
        if (m.to === m.loc) { fail('Склад-відправник і склад-отримувач однакові'); break; }
        if (!issue(m.rows)) break;
        for (const r of res.rows) for (const x of r.lots) {
          const src = snapshot.find(l => l.id === x.lot)!;
          lots.push({ id: `${m.id}#${++seq}`, item: r.item, acc: r.acc, loc: m.to, date: src.date, src: src.src, qty: x.qty, value: x.value });
        }
        for (const a of STOCK_ACCOUNTS) { const v = sumBy(res.rows, a); if (v) res.postings.push([a, a, v, 'Переміщення між складами']); }
        break;
      case 'prod': {
        if (!issue(m.rows)) break;
        const raw = sumBy(res.rows, '201'), goods = sumBy(res.rows, '281'), small = sumBy(res.rows, '22');
        if (small) { fail('МШП (рахунок 22) не списуються за техкартою: оформіть списання на витрати'); break; }
        // продукція громадського харчування: сировина у виробництво, випуск і собівартість реалізованої
        if (raw) res.postings.push(['23', '201', raw, 'Сировина за техкартами у виробництво'], ['26', '23', raw, 'Випуск страв'], ['901', '26', raw, 'Собівартість реалізованих страв']);
        // покупні товари, продані без переробки (пляшкові напої тощо)
        if (goods) res.postings.push(['902', '281', goods, 'Собівартість реалізованих товарів']);
        break;
      }
      case 'out':
        if (!COST_ACCOUNTS.includes(m.cost)) { fail(`Рахунок витрат ${m.cost} не з переліку ${COST_ACCOUNTS.join(', ')}`); break; }
        if (!issue(m.rows)) break;
        for (const a of STOCK_ACCOUNTS) { const v = sumBy(res.rows, a); if (v) res.postings.push([m.cost, a, v, a === '22' ? 'МШП передано в експлуатацію' : 'Списання матеріалів на витрати']); }
        break;
      case 'count': {
        const short: { item: string; acc: StockAcc; qty: number }[] = [];
        for (const r of m.rows) {
          if (r.fact < 0) { fail('Фактичний залишок не може бути від’ємним'); break; }
          const b = balanceOf(lots, m.loc, r.item, r.acc), d = r3(r.fact - b.qty);
          if (d < -EPS) short.push({ item: r.item, acc: r.acc, qty: -d });
          else if (d > EPS) {
            // надлишок оприбутковується за останньою відомою ціною (справедлива вартість уточнюється бухгалтером)
            const last = [...snapshot, ...lots].filter(l => l.item === r.item && l.acc === r.acc && l.qty > EPS).sort((a, b) => b.date.localeCompare(a.date))[0];
            const unit = last ? last.value / last.qty : 0;
            const lot: Lot = { id: `${m.id}#${++seq}`, item: r.item, acc: r.acc, loc: m.loc, date: m.date, src: 'Надлишок за інвентаризацією', qty: d, value: r2(unit * d) };
            lots.push(lot);
            res.rows.push({ item: r.item, acc: r.acc, qty: d, value: lot.value, lots: [{ lot: lot.id, qty: d, value: lot.value }] });
            if (lot.value) res.postings.push([r.acc, '719', lot.value, 'Надлишок за інвентаризацією']);
          }
        }
        if (!res.ok) break;
        const before = res.rows.length;
        for (const s of short) res.rows.push({ ...take(lots, m.loc, s.item, s.acc, s.qty, method), qty: -s.qty });
        for (const a of STOCK_ACCOUNTS) { const v = sumBy(res.rows.slice(before), a); if (v) res.postings.push(['947', a, v, 'Нестача за інвентаризацією']); }
        break;
      }
    }
    results[m.id] = res;
  }
  return { lots: lots.filter(l => l.qty > EPS), results };
}

/** Перевірити новий рух на журналі: рух і всі наступні мають провестися без помилок. */
export function tryAdd(movements: Movement[], mv: Movement, method: CostMethod, opts: ReplayOpts = {}): { ok: true; result: MvResult; ledger: Ledger } | { ok: false; error: string } {
  const prev = replay(movements, method, opts);
  const next = replay([...movements, mv], method, opts);
  const r = next.results[mv.id];
  if (!r?.ok) return { ok: false, error: r?.error || 'Рух не проведено' };
  const broken = Object.values(next.results).find(x => !x.ok && prev.results[x.id]?.ok);
  if (broken) return { ok: false, error: `Пізніший рух перестане проводитися: ${broken.error}` };
  return { ok: true, result: r, ledger: next };
}

/** Скасувати рух можна, лише якщо після цього всі інші рухи проводяться (не можна прибрати надходження, яке вже списано). */
export function tryRemove(movements: Movement[], id: string, method: CostMethod, opts: ReplayOpts = {}): { ok: true } | { ok: false; error: string } {
  const rest = movements.filter(m => m.id !== id);
  const prev = replay(movements, method, opts), next = replay(rest, method, opts);
  const broken = Object.values(next.results).find(x => !x.ok && prev.results[x.id]?.ok);
  return broken ? { ok: false, error: `Без цього руху не проведеться інший: ${broken.error}` } : { ok: true };
}

/**
 * Розкласти продані страви на сировину. Напівфабрикати (рядок з card) розкладаються далі за своєю карткою.
 * Кількість у рядку — брутто на вихід картки (out), тож на qty порцій береться qty / out від рядка.
 */
export function explode(cards: TechCard[], sales: { card: string; qty: number }[]): { rows: { item: string; qty: number }[]; error?: string } {
  const need = new Map<string, number>();
  const walk = (id: string, k: number, path: string[]): string | undefined => {
    const c = cards.find(x => x.id === id);
    if (!c) return `Техкарту ${id} не знайдено`;
    if (path.includes(id)) return `Техкарта «${c.name}» містить сама себе через напівфабрикати`;
    if (!(c.out > 0)) return `У техкарті «${c.name}» не вказано вихід`;
    if (!c.rows.length) return `Техкарта «${c.name}» порожня`;
    for (const r of c.rows) {
      const q = k * r.qty / c.out;
      if (r.card) { const e = walk(r.card, q, [...path, id]); if (e) return e; }
      else if (r.item) need.set(r.item, (need.get(r.item) || 0) + q);
    }
    return undefined;
  };
  for (const s of sales) {
    if (!(s.qty > 0)) continue;
    const e = walk(s.card, s.qty, []);
    if (e) return { rows: [], error: e };
  }
  return { rows: [...need].map(([item, qty]) => ({ item, qty: r3(qty) })).filter(r => r.qty > 0) };
}

/** Собівартість однієї порції за поточними залишками (для калькуляції і ціни в меню). */
export function cardCost(cards: TechCard[], cardId: string, lots: Lot[], loc: string): { cost: number; missing: string[] } {
  const { rows, error } = explode(cards, [{ card: cardId, qty: 1 }]);
  if (error) return { cost: 0, missing: [error] };
  let cost = 0; const missing: string[] = [];
  for (const r of rows) {
    const b = balanceOf(lots, loc, r.item);
    const all = lots.filter(l => l.item === r.item && l.qty > EPS);
    const unit = b.qty > EPS ? b.value / b.qty : all.length ? all.reduce((s, l) => s + l.value, 0) / all.reduce((s, l) => s + l.qty, 0) : NaN;
    if (Number.isNaN(unit)) missing.push(r.item); else cost += unit * r.qty;
  }
  return { cost: r2(cost), missing };
}

/** Залишки: місце × позиція × рахунок, з кількістю партій і середньою ціною. */
export function balances(lots: Lot[]) {
  const m = new Map<string, { loc: string; item: string; acc: StockAcc; qty: number; value: number; lots: number; oldest: string }>();
  for (const l of lots) {
    const k = `${l.loc}|${l.item}|${l.acc}`;
    const b = m.get(k) || { loc: l.loc, item: l.item, acc: l.acc, qty: 0, value: 0, lots: 0, oldest: l.date };
    b.qty = r3(b.qty + l.qty); b.value = r2(b.value + l.value); b.lots++; if (l.date < b.oldest) b.oldest = l.date;
    m.set(k, b);
  }
  return [...m.values()];
}
