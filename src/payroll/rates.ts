// Ставки й показники для зарплати. Без залежностей: файл потрапляє в браузер і в скрипт перевірки.
// Значення на 2025–2026 роки за Законом про Державний бюджет; облікова політика або зміна закону оновлює лише цю таблицю.

export type Rates = {
  year: number;
  /** мінімальна заробітна плата (місячна) */
  minWage: number;
  /** прожитковий мінімум для працездатних на 1 січня */
  subsistence: number;
  pdfo: number; vz: number; esv: number;
  /** максимальна база ЄСВ у мінімальних зарплатах */
  esvMaxMult: number;
};

export const RATES: Record<number, Rates> = {
  2025: { year: 2025, minWage: 8000, subsistence: 3028, pdfo: 0.18, vz: 0.05, esv: 0.22, esvMaxMult: 15 },
  2026: { year: 2026, minWage: 8647, subsistence: 3328, pdfo: 0.18, vz: 0.05, esv: 0.22, esvMaxMult: 15 }
};

export const ratesFor = (ym: string): Rates => {
  const y = +ym.slice(0, 4);
  const r = RATES[y];
  if (!r) throw new Error(`Немає ставок зарплати на ${y} рік: додайте їх у src/payroll/rates.ts`);
  return r;
};

export const esvMax = (r: Rates) => r.minWage * r.esvMaxMult;
/** податкова соціальна пільга: 50% прожиткового мінімуму */
export const pspAmount = (r: Rates) => r.subsistence * 0.5;
/** граничний дохід для ПСП: 1,4 прожиткового мінімуму, округлений до 10 грн */
export const pspLimit = (r: Rates) => Math.round(r.subsistence * 1.4 / 10) * 10;

/** Бюджетні коди і стаття руху коштів для кожного платежу. */
export const TAX_INFO = {
  pdfo: { name: 'ПДФО', budget: '11010100', acc: '6411', article: 'Податки: ПДФО' },
  vz: { name: 'Військовий збір', budget: '11011000', acc: '642', article: 'Податки: військовий збір' },
  esv: { name: 'ЄСВ', budget: '71010000', acc: '651', article: 'Податки: ЄСВ' }
} as const;
export type TaxKind = keyof typeof TAX_INFO;
