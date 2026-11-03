// Довідник нашої номенклатури і прив'язка рядків постачальника до неї.
// Кожен постачальник пише ту саму позицію по-своєму («Ковб. Моск. в/к ТМ Глобино», «Колбаса Московская 1с»),
// а на складі вона має бути однією позицією. Прив'язка запам'ятовується для пари «код постачальника + його назва».
// Поки немає бекенду, довідник живе у браузері.
const CAT = 'saldo-nom';
const MAP = 'saldo-nom-map';

export type NomItem = { id: string; name: string; unit: string };

const SEED: NomItem[] = [
  { id: 'n1', name: 'Ковбаса Московська в/к', unit: 'кг' },
  { id: 'n2', name: 'Сир твердий', unit: 'кг' },
  { id: 'n3', name: 'Масло вершкове 82%', unit: 'кг' },
  { id: 'n4', name: 'Молоко 2,5%', unit: 'л' },
  { id: 'n5', name: 'Борошно пшеничне в/г', unit: 'кг' },
  { id: 'n6', name: 'Цукор', unit: 'кг' },
  { id: 'n7', name: 'Яйця курячі', unit: 'шт' },
  { id: 'n8', name: 'Кава в зернах', unit: 'кг' }
];

function read<T>(key: string, def: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : def; } catch { return def; }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* приватний режим */ }
}

export const catalog = (): NomItem[] => read(CAT, SEED);

/** Нормалізована назва постачальника: регістр, лапки, пробіли, рос./укр. літери. */
export const normName = (s: string) => s.toLowerCase().replace(/[ёэы]/g, c => ({ 'ё': 'е', 'э': 'е', 'ы': 'и' } as Record<string, string>)[c])
  .replace(/["'«»„“”`’]/g, '').replace(/\s+/g, ' ').trim();

const mapKey = (edrpou: string | undefined, name: string) => `${edrpou || '?'}|${normName(name)}`;

// Слова, що не несуть сенсу для порівняння: ТМ, ґатунок, тара тощо.
const NOISE = new Set(['тм', 'тов', 'пп', 'фоп', 'гат', 'сорт', 'вищ', 'вищий', 'уп', 'упак', 'пак', 'кг', 'гр', 'шт', 'л']);
// Рос. → укр. корені, які найчастіше трапляються у накладних
const RU: [RegExp, string][] = [[/колбас/g, 'ковбас'], [/московск/g, 'московськ'], [/сыр|сир/g, 'сир'], [/масл/g, 'масл'], [/молок/g, 'молок'], [/мук/g, 'борошн'], [/сахар/g, 'цукор'], [/яйц/g, 'яйц'], [/кофе/g, 'кав']];

function stems(s: string): string[] {
  let t = normName(s).replace(/в\/к/g, ' вк ').replace(/[^a-zа-яіїєґ0-9%,]+/g, ' ');
  for (const [re, to] of RU) t = t.replace(re, to);
  return t.split(' ').filter(w => w.length >= 2 && !NOISE.has(w)).map(w => /^\d/.test(w) ? w : w.slice(0, 5));
}

function similarity(a: string, b: string): number {
  const A = stems(a), B = stems(b);
  if (!A.length || !B.length) return 0;
  // збіг за початком слова: «моск» ~ «московськ»
  const hit = (x: string, ys: string[]) => ys.some(y => x.startsWith(y.slice(0, 4)) || y.startsWith(x.slice(0, 4)));
  const shared = A.filter(x => hit(x, B)).length;
  return shared / Math.max(B.length, 1);
}

export type Match = { id: string; how: 'map' | 'other' | 'guess' } | undefined;

/**
 * Наша позиція для рядка постачальника:
 * 1) збережена прив'язка цього постачальника;
 * 2) така сама назва вже прив'язана в іншого постачальника (новий постачальник — не нова робота);
 * 3) найсхожіша назва серед позицій довідника і всіх раніше прив'язаних назв постачальників.
 */
export function matchItem(edrpou: string | undefined, name: string, cat = catalog()): Match {
  const map = read<Record<string, string>>(MAP, {});
  const alive = (id?: string) => !!id && cat.some(c => c.id === id);
  const own = map[mapKey(edrpou, name)];
  if (alive(own)) return { id: own, how: 'map' };
  const n = normName(name);
  const known = Object.entries(map).find(([k, id]) => k.slice(k.indexOf('|') + 1) === n && alive(id));
  if (known) return { id: known[1], how: 'other' };
  let best: string | undefined, score = 0;
  const cands: [string, string][] = [...cat.map(c => [c.name, c.id] as [string, string]),
    ...Object.entries(map).filter(([, id]) => alive(id)).map(([k, id]) => [k.slice(k.indexOf('|') + 1), id] as [string, string])];
  for (const [cn, id] of cands) { const sc = similarity(name, cn); if (sc > score) { score = sc; best = id; } }
  return best && score >= 0.6 ? { id: best, how: 'guess' } : undefined;
}

/** Зберегти прив'язку. id 'new' — створити нову позицію довідника з назвою постачальника. */
export function bindItem(edrpou: string | undefined, name: string, id: string, unit: string | null, newName?: string): string {
  let itemId = id;
  if (id === 'new') {
    const cat = catalog();
    itemId = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    cat.push({ id: itemId, name: (newName || name).trim(), unit: unit || 'шт' });
    write(CAT, cat);
  }
  const m = read<Record<string, string>>(MAP, {});
  m[mapKey(edrpou, name)] = itemId;
  write(MAP, m);
  return itemId;
}
