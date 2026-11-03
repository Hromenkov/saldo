// Основні засоби: картка об'єкта, методи амортизації за П(С)БО 7, мінімальні строки за п. 138.3.3 ПКУ,
// проводки введення в експлуатацію, щомісячної амортизації і вибуття.
// Без залежностей: файл потрапляє в браузер і в скрипт перевірки (npm test).

export type Method = 'straight' | 'reducing' | 'accelerated' | 'cumulative' | 'production';

/** Методи амортизації, п. 26 П(С)БО 7 */
export const METHODS: Record<Method, string> = {
  straight: 'Прямолінійний',
  reducing: 'Зменшення залишкової вартості',
  accelerated: 'Прискореного зменшення залишкової вартості',
  cumulative: 'Кумулятивний',
  production: 'Виробничий'
};

/** Групи ОЗ за п. 138.3.3 ПКУ і рахунок обліку. years — мінімальний строк корисного використання в податковому обліку. */
export type TaxGroup = { id: string; group: number; t: string; acc: string; years: number };
export const TAX_GROUPS: TaxGroup[] = [
  { id: '3b', group: 3, t: 'Будівлі', acc: '103', years: 20 },
  { id: '3s', group: 3, t: 'Споруди', acc: '103', years: 15 },
  { id: '3p', group: 3, t: 'Передавальні пристрої', acc: '103', years: 10 },
  { id: '4', group: 4, t: 'Машини та обладнання', acc: '104', years: 5 },
  { id: '4e', group: 4, t: 'ЕОМ, комп’ютери, телефони, рації (понад 20 000 ₴)', acc: '104', years: 2 },
  { id: '5', group: 5, t: 'Транспортні засоби', acc: '105', years: 5 },
  { id: '6', group: 6, t: 'Інструменти, прилади, інвентар, меблі', acc: '106', years: 4 },
  { id: '7', group: 7, t: 'Тварини', acc: '107', years: 6 },
  { id: '8', group: 8, t: 'Багаторічні насадження', acc: '108', years: 10 },
  { id: '9', group: 9, t: 'Інші основні засоби', acc: '109', years: 12 }
];
export const taxGroup = (id: string) => TAX_GROUPS.find(g => g.id === id);

/** Рахунки, на які можна віднести амортизацію. Система ніколи не обирає сама. */
export const DEPR_EXPENSE: [string, string][] = [
  ['23', 'Виробництво'], ['91', 'Загальновиробничі витрати'], ['92', 'Адміністративні витрати'], ['93', 'Витрати на збут'], ['949', 'Інші витрати операційної діяльності']
];

/** Вартісна межа ОЗ для податкового обліку, пп. 14.1.138 ПКУ */
export const TAX_THRESHOLD = 20000;

export type Disposal = { ym: string; how: 'liquidation' | 'sale'; price?: number; vat?: number };
export type Line = [string, string, number, string];
export type LogEntry = { ym: string; t: string; lines: Line[] };

export type Asset = {
  id: string;
  /** інвентарний номер */
  inv: string;
  name: string;
  /** група за п. 138.3.3 ПКУ (визначає рахунок 10x) */
  tg: string;
  /** первісна вартість */
  cost: number;
  /** ліквідаційна вартість */
  liq: number;
  /** строк корисного використання, місяців */
  months: number;
  method: Method;
  /** виробничий метод: загальний очікуваний обсяг продукції (робіт) за весь строк */
  units?: number;
  unitName?: string;
  /** рахунок витрат для амортизації; null — не обрано, нараховувати не можна */
  expense: string | null;
  /** управлінська аналітика: точка, підрозділ */
  place?: string;
  /** місяць введення в експлуатацію, 'YYYY-MM'; немає — об'єкт ще на 152 */
  commissioned?: string;
  /** знос, накопичений до початку обліку в Сальдо (перенесення з 1С) */
  wearStart?: number;
  /** нарахована амортизація за місяцями */
  accrued: Record<string, number>;
  disposed?: Disposal;
  log: LogEntry[];
};

export type Issue = { level: 'error' | 'warn'; t: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const f2 = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 'YYYY-MM' → номер місяця від початку ери, щоб рахувати різницю */
const mi = (ym: string) => { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); };
export const ymAdd = (ym: string, k: number) => { const n = mi(ym) + k; return `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`; };
const MONTHS_UA = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
export const ymLabel = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_UA[m - 1]} ${y}`; };
/** «Листопад 2026» → '2026-11' */
export const ymFromLabel = (label: string) => {
  const [mn, y] = label.trim().split(/\s+/);
  const m = MONTHS_UA.findIndex(x => x.toLowerCase() === mn?.toLowerCase());
  return m < 0 || !y ? null : `${y}-${String(m + 1).padStart(2, '0')}`;
};

export const accountOf = (a: Pick<Asset, 'tg'>) => taxGroup(a.tg)?.acc ?? '109';
export const wear = (a: Asset) => r2((a.wearStart || 0) + Object.values(a.accrued).reduce((x, y) => x + y, 0));
export const residual = (a: Asset) => r2(a.cost - wear(a));
export const status = (a: Asset): 'draft' | 'service' | 'disposed' => a.disposed ? 'disposed' : a.commissioned ? 'service' : 'draft';

/** Методи, що рахують річну суму: строк має бути кратним 12 місяцям */
const YEARLY: Method[] = ['reducing', 'accelerated', 'cumulative'];

/** Перевірка картки. Помилки не дають ввести об'єкт в експлуатацію, попередження лише показуються. */
export function validate(a: Asset): Issue[] {
  const out: Issue[] = [];
  const err = (t: string) => out.push({ level: 'error', t });
  const warn = (t: string) => out.push({ level: 'warn', t });
  const g = taxGroup(a.tg);
  if (!a.name.trim()) err('Вкажіть назву об’єкта');
  if (!a.inv.trim()) err('Вкажіть інвентарний номер');
  if (!g) err('Оберіть групу основних засобів');
  if (!(a.cost > 0)) err('Первісна вартість має бути більшою за нуль');
  if (a.liq < 0) err('Ліквідаційна вартість не може бути від’ємною');
  if (a.cost > 0 && a.liq >= a.cost) err('Ліквідаційна вартість має бути меншою за первісну');
  if (!Number.isInteger(a.months) || a.months <= 0) err('Строк корисного використання — ціле число місяців, більше нуля');
  else if (YEARLY.includes(a.method) && a.months % 12) err(`Для методу «${METHODS[a.method]}» строк задається в повних роках (кратний 12 місяцям)`);
  if (a.method === 'reducing' && !(a.liq > 0)) err('Метод зменшення залишкової вартості потребує ліквідаційної вартості більшої за нуль: інакше вся сума спишеться за перший рік');
  if (a.method === 'production' && !(a.units && a.units > 0)) err('Для виробничого методу вкажіть загальний очікуваний обсяг продукції за строк');
  if (a.wearStart && (a.wearStart < 0 || a.wearStart > a.cost - a.liq)) err('Початковий знос не може перевищувати вартість, що амортизується');
  if (g && a.months > 0 && a.months < g.years * 12)
    warn(`Податковий облік: для групи ${g.group} «${g.t}» мінімальний строк ${g.years} ${g.years < 5 ? 'роки' : 'років'} (п. 138.3.3 ПКУ). Платнику податку на прибуток з доходом понад 40 млн ₴ виникне податкова різниця`);
  if (a.cost > 0 && a.cost <= TAX_THRESHOLD)
    warn(`Вартість до ${f2(TAX_THRESHOLD)} ₴: у податковому обліку це не основний засіб, а малоцінний необоротний актив (рах. 112, пп. 14.1.138 ПКУ)`);
  if (!a.expense) warn('Рахунок витрат для амортизації не обрано. Без нього амортизацію не буде нараховано');
  return out;
}
export const canCommission = (a: Asset) => !validate(a).some(i => i.level === 'error');

/**
 * Плановий графік за весь строк (для методів, що не залежать від обсягу продукції).
 * Річна сума ділиться на 12, копійки округлення переходять в останній місяць, тож сума графіка дорівнює вартості, що амортизується.
 */
export function schedule(a: Asset): number[] {
  const base = r2(a.cost - a.liq), n = a.months;
  if (a.method === 'production' || !(base > 0) || !(n > 0)) return [];
  const out: number[] = [];
  if (a.method === 'straight') {
    const m = r2(base / n);
    for (let k = 0; k < n; k++) out.push(m);
  } else {
    const years = n / 12;
    let acc = 0;
    for (let y = 0; y < years; y++) {
      const left = a.cost - acc; // залишкова вартість на початок року
      let annual: number;
      if (a.method === 'reducing') annual = left * (1 - Math.pow(a.liq / a.cost, 1 / years));
      else if (a.method === 'accelerated') annual = y === years - 1 ? left - a.liq : Math.min(left * 2 / years, left - a.liq);
      else annual = base * (years - y) / (years * (years + 1) / 2); // кумулятивний: (n − y) / сума чисел років
      const m = r2(annual / 12);
      for (let k = 0; k < 12; k++) out.push(m);
      acc += m * 12;
    }
  }
  // точне закриття: остання сума графіка добирає копійки
  const sum = out.slice(0, -1).reduce((x, y) => x + y, 0);
  out[out.length - 1] = r2(base - sum);
  return out;
}

/**
 * Амортизація за місяць ym. Нараховується з місяця, наступного за введенням в експлуатацію,
 * і припиняється з місяця, наступного за вибуттям (п. 29 П(С)БО 7). Не перевищує залишку вартості, що амортизується.
 * Для виробничого методу потрібен обсяг продукції за місяць.
 */
export function monthAmount(a: Asset, ym: string, unitsThisMonth?: number): number {
  if (!a.commissioned) return 0;
  const k = mi(ym) - mi(a.commissioned) - 1;
  if (k < 0) return 0;
  if (a.disposed && mi(ym) > mi(a.disposed.ym)) return 0;
  const base = r2(a.cost - a.liq);
  const already = r2((a.wearStart || 0) + Object.entries(a.accrued).filter(([m]) => m !== ym).reduce((x, [, v]) => x + v, 0));
  const left = r2(base - already);
  if (left <= 0) return 0;
  let m: number;
  if (a.method === 'production') m = r2((unitsThisMonth || 0) * base / (a.units || Infinity));
  else {
    const sch = schedule(a);
    if (k >= sch.length) return left; // строк вийшов, а залишок лишився (напр. після перенесення з 1С)
    m = k === sch.length - 1 ? left : sch[k];
  }
  return r2(Math.min(m, left));
}

const label = (a: Asset) => `${a.name}, інв. № ${a.inv}`;

/** Введення в експлуатацію: Дт 10x Кт 152 на первісну вартість */
export function commissionLines(a: Asset): Line[] {
  return [[accountOf(a), '152', r2(a.cost), `Введення в експлуатацію: ${label(a)}`]];
}

export type AccrualResult = { lines: Line[]; amounts: Record<string, number>; byId: Record<string, Line>; issues: { id: string; t: string }[] };

/**
 * Нарахування амортизації за місяць по всіх об'єктах. Об'єкт без обраного рахунку витрат не нараховується
 * і повертається в issues: система не підставляє рахунок сама.
 */
export function accrue(assets: Asset[], ym: string, units: Record<string, number> = {}): AccrualResult {
  const res: AccrualResult = { lines: [], amounts: {}, byId: {}, issues: [] };
  for (const a of assets) {
    if (status(a) === 'draft' || a.accrued[ym] !== undefined) continue;
    if (a.method === 'production' && units[a.id] === undefined) { if (monthAmount(a, ym, 1) > 0) res.issues.push({ id: a.id, t: `${label(a)}: вкажіть обсяг продукції за місяць (виробничий метод)` }); continue; }
    const m = monthAmount(a, ym, units[a.id]);
    if (!(m > 0)) continue;
    if (!a.expense) { res.issues.push({ id: a.id, t: `${label(a)}: не обрано рахунок витрат (23, 91, 92, 93 або 949)` }); continue; }
    res.amounts[a.id] = m;
    res.byId[a.id] = [a.expense, '131', m, `Амортизація за ${ymLabel(ym).toLowerCase()}: ${label(a)}`];
    res.lines.push(res.byId[a.id]);
  }
  return res;
}

/**
 * Вибуття. Знос береться з урахуванням амортизації місяця вибуття (її треба нарахувати до вибуття).
 * Ліквідація: Дт 131 Кт 10x знос, Дт 976 Кт 10x залишкова вартість.
 * Продаж: Дт 131 Кт 10x, Дт 286 Кт 10x, Дт 377 Кт 712 ціна з ПДВ, Дт 712 Кт 6412 ПДВ, Дт 943 Кт 286 залишкова вартість.
 */
export function disposalLines(a: Asset, d: Disposal): Line[] {
  const acc = accountOf(a), w = wear(a), rest = r2(a.cost - w), L = label(a);
  const out: Line[] = [];
  if (w > 0) out.push(['131', acc, w, `Списано знос: ${L}`]);
  if (d.how === 'liquidation') {
    if (rest > 0) out.push(['976', acc, rest, `Залишкова вартість при ліквідації: ${L}`]);
  } else {
    if (rest > 0) out.push(['286', acc, rest, `Переведено до утримуваних для продажу: ${L}`]);
    const price = r2(d.price || 0), vat = r2(d.vat || 0);
    if (price > 0) out.push(['377', '712', price, `Продаж: ${L}`]);
    if (vat > 0) out.push(['712', '6412', vat, 'ПДВ зобов’язання з продажу ОЗ']);
    if (rest > 0) out.push(['943', '286', rest, `Собівартість проданого ОЗ: ${L}`]);
  }
  return out;
}

/** Перевірка перед вибуттям */
export function disposalIssues(a: Asset, d: Disposal): string[] {
  const out: string[] = [];
  if (status(a) !== 'service') out.push('Вибути може лише об’єкт в експлуатації');
  if (a.commissioned && mi(d.ym) < mi(a.commissioned)) out.push('Місяць вибуття раніший за введення в експлуатацію');
  if (monthAmount(a, d.ym) > 0 && a.accrued[d.ym] === undefined) out.push(`Спершу нарахуйте амортизацію за ${ymLabel(d.ym).toLowerCase()}: у місяці вибуття вона ще нараховується`);
  if (d.how === 'sale' && !(d.price && d.price > 0)) out.push('Вкажіть ціну продажу');
  if (d.how === 'sale' && d.vat && d.price && d.vat >= d.price) out.push('ПДВ має бути меншим за ціну з ПДВ');
  return out;
}

export const newAsset = (id: string): Asset => ({ id, inv: '', name: '', tg: '4', cost: 0, liq: 0, months: 60, method: 'straight', expense: null, accrued: {}, log: [] });
