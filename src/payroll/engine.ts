// Розрахунок зарплати по працівниках: оклад або погодинна оплата, премія, відпускні (Порядок № 100),
// лікарняні за перші 5 днів за рахунок роботодавця (Порядок № 1266), ПДФО, військовий збір, ЄСВ.
// Рахунок витрат (23/91/92/93/949) система ніколи не обирає сама: його затверджує бухгалтер для кожного працівника.
import { COST_ACCOUNTS } from '../recognize/chart';
import { esvMax, pspAmount, pspLimit, ratesFor, type Rates } from './rates';

export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Заробіток за місяць для розрахунку середньої: сума, на яку нараховано ЄСВ, і дні, що виключаються (лікарняні, без збереження). */
export type MonthEarnings = { month: string; earnings: number; excludedDays?: number };

export type Employee = {
  id: string; name: string;
  /** РНОКПП */
  ipn: string;
  position: string; dept: string;
  hired: string; fired?: string;
  pay: { type: 'monthly' | 'hourly'; rate: number };
  /** рахунок витрат, затверджений бухгалтером; null — ще не затверджено, провести не можна */
  costAccount: string | null;
  /** окремий рахунок для лікарняних, якщо облікова політика відносить їх інакше (наприклад, 949) */
  sickCostAccount?: string | null;
  /** страховий стаж, повних років: від нього залежить відсоток лікарняних */
  insuranceYears: number;
  /** 100% лікарняних незалежно від стажу (пільгові категорії) */
  sick100?: boolean;
  /** заява на податкову соціальну пільгу */
  psp?: boolean;
  /** ЄСВ не менше мінімального внеску (основне місце роботи) */
  minBase?: boolean;
  history: MonthEarnings[];
};

export type MonthInput = {
  employeeId: string;
  /** робочих днів за графіком */
  normDays: number;
  /** відпрацьовано днів за табелем; обов’язково, якщо є відпустка чи лікарняний */
  workedDays?: number;
  /** годин за табелем (погодинна оплата) */
  hours?: number;
  bonus?: number;
  vacation?: { days: number };
  sick?: { days: number; employerDays?: number };
};

export type AccrualKind = 'salary' | 'bonus' | 'vacation' | 'sick';
export const ACCRUAL_NAMES: Record<AccrualKind, string> = { salary: 'Оплата за відпрацьований час', bonus: 'Премія', vacation: 'Відпускні', sick: 'Лікарняні (перші 5 днів, роботодавець)' };
export type Accrual = { kind: AccrualKind; amount: number; note: string; account: string | null;
  /** з чого порахована середня: заробіток, дні, місяці */
  basis?: string };

export type EmployeeResult = {
  emp: Employee;
  accruals: Accrual[];
  gross: number;
  psp: number;
  pdfo: number; vz: number; net: number;
  /** база ЄСВ у межах максимуму, доплата до мінімальної, сам внесок */
  esvBase: number; esvTopUp: number; esv: number;
  /** лікарняні, які ПФУ виплачує напряму: лише для інформації, у наших проводках і 4ДФ їх немає */
  fundSick: number; sickDays: number;
  /** днів у трудових відносинах у місяці */
  employedDays: number;
  issues: string[];
};

const days = (ym: string) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
/** робочі дні пн–пт (під час воєнного стану святкові дні не переносяться) */
export const workdays = (ym: string) => {
  let n = 0;
  for (let d = 1; d <= days(ym); d++) { const w = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, d).getDay(); if (w && w < 6) n++; }
  return n;
};
export const prevMonths = (ym: string, n: number) => {
  const out: string[] = []; let y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  for (let i = 0; i < n; i++) { m--; if (!m) { m = 12; y--; } out.push(`${y}-${String(m).padStart(2, '0')}`); }
  return out.reverse();
};
export const calDays = days;

export type Average = { daily: number; earnings: number; days: number; months: string[] };

/**
 * Середньоденна за 12 місяців перед місяцем події.
 * vacation: Порядок № 100 — весь заробіток, календарні дні мінус виключені (та святкові, якщо вони є).
 * sick: Порядок № 1266 — заробіток у межах максимальної бази ЄСВ кожного місяця.
 * Якщо працівник працював менше, береться фактичний період з дня прийняття.
 */
export function average(emp: Employee, ym: string, purpose: 'vacation' | 'sick', holidays = 0): Average {
  const months = prevMonths(ym, 12).filter(m => m >= emp.hired.slice(0, 7));
  let earn = 0, dd = 0;
  for (const m of months) {
    const h = emp.history.find(x => x.month === m);
    const cap = purpose === 'sick' ? esvMax(ratesFor(m)) : Infinity;
    earn += Math.min(h?.earnings ?? 0, cap);
    const first = m === emp.hired.slice(0, 7) ? +emp.hired.slice(8, 10) : 1;
    dd += days(m) - first + 1 - (h?.excludedDays ?? 0);
  }
  dd -= holidays;
  return { daily: dd > 0 ? r2(earn / dd) : 0, earnings: r2(earn), days: dd, months };
}

export const sickPercent = (e: Employee) => e.sick100 ? 1 : e.insuranceYears < 3 ? 0.5 : e.insuranceYears < 5 ? 0.6 : e.insuranceYears < 8 ? 0.7 : 1;

export function calcEmployee(emp: Employee, inp: MonthInput, ym: string, rates: Rates = ratesFor(ym)): EmployeeResult {
  const issues: string[] = [];
  const acc = emp.costAccount;
  if (!acc) issues.push(`${emp.name}: не затверджено рахунок витрат (23, 91, 92, 93 або 949)`);
  else if (!COST_ACCOUNTS.includes(acc)) issues.push(`${emp.name}: рахунок ${acc} не є рахунком витрат`);
  const sickAcc = emp.sickCostAccount ?? acc;
  if (sickAcc && !COST_ACCOUNTS.includes(sickAcc)) issues.push(`${emp.name}: рахунок лікарняних ${sickAcc} не є рахунком витрат`);

  const absent = !!(inp.vacation?.days || inp.sick?.days);
  if (absent && inp.workedDays == null && emp.pay.type === 'monthly') issues.push(`${emp.name}: є відпустка чи лікарняний — вкажіть відпрацьовані дні за табелем`);
  const worked = inp.workedDays ?? inp.normDays;
  if (worked > inp.normDays) issues.push(`${emp.name}: відпрацьовано ${worked} дн. при нормі ${inp.normDays}`);

  const accruals: Accrual[] = [];
  const salary = emp.pay.type === 'monthly'
    ? r2(emp.pay.rate * worked / inp.normDays)
    : r2(emp.pay.rate * (inp.hours ?? 0));
  if (emp.pay.type === 'hourly' && inp.hours == null) issues.push(`${emp.name}: погодинна оплата — вкажіть години за табелем`);
  if (salary) accruals.push({ kind: 'salary', amount: salary, account: acc,
    note: emp.pay.type === 'monthly' ? `${emp.pay.rate} × ${worked}/${inp.normDays} дн.` : `${emp.pay.rate} × ${inp.hours} год.` });
  if (inp.bonus) accruals.push({ kind: 'bonus', amount: r2(inp.bonus), account: acc, note: 'за наказом' });

  if (inp.vacation?.days) {
    const a = average(emp, ym, 'vacation');
    accruals.push({ kind: 'vacation', amount: r2(a.daily * inp.vacation.days), account: acc,
      note: `${a.daily} × ${inp.vacation.days} к. дн.`, basis: `${a.earnings} / ${a.days} дн. за ${a.months.length} міс.` });
  }

  let fundSick = 0;
  const sickDays = inp.sick?.days ?? 0;
  if (sickDays) {
    const a = average(emp, ym, 'sick');
    const p = sickPercent(emp);
    const ed = Math.min(inp.sick!.employerDays ?? 5, sickDays, 5);
    const daily = r2(a.daily * p);
    if (ed) accruals.push({ kind: 'sick', amount: r2(daily * ed), account: sickAcc,
      note: `${a.daily} × ${p * 100}% × ${ed} дн.`, basis: `${a.earnings} / ${a.days} дн. за ${a.months.length} міс., стаж ${emp.insuranceYears} р.` });
    fundSick = r2(daily * (sickDays - ed));
  }

  const gross = r2(accruals.reduce((s, x) => s + x.amount, 0));
  const psp = emp.psp && gross <= pspLimit(rates) ? pspAmount(rates) : 0;
  if (emp.psp && !psp) issues.push(`${emp.name}: дохід ${gross} перевищує ліміт ПСП ${pspLimit(rates)}, пільга не застосована`);
  const pdfo = r2(Math.max(0, gross - psp) * rates.pdfo);
  const vz = r2(gross * rates.vz);

  const first = emp.hired.slice(0, 7) === ym ? +emp.hired.slice(8, 10) : 1;
  const last = emp.fired?.slice(0, 7) === ym ? +emp.fired.slice(8, 10) : days(ym);
  const employedDays = last - first + 1;
  const esvBase = r2(Math.min(gross, esvMax(rates)));
  let esvTopUp = 0;
  if ((emp.minBase ?? true) && esvBase < rates.minWage && gross > 0) {
    if (fundSick) issues.push(`${emp.name}: у місяці лікарняний від ПФУ — перевірте мінімальний внесок ЄСВ вручну`);
    else if (employedDays < days(ym)) issues.push(`${emp.name}: неповний місяць у трудових відносинах — мінімальний внесок ЄСВ не донараховано, перевірте`);
    else esvTopUp = r2(rates.minWage - esvBase);
  }
  const esv = r2((esvBase + esvTopUp) * rates.esv);

  return { emp, accruals, gross, psp, pdfo, vz, net: r2(gross - pdfo - vz), esvBase, esvTopUp, esv, fundSick, sickDays, employedDays, issues };
}

export type PayrollRun = {
  /** номер нарахування: на нього посилаються проводки, платіжки і звіт */
  id: string; month: string; date: string;
  results: EmployeeResult[];
  totals: { gross: number; pdfo: number; vz: number; net: number; esv: number };
  issues: string[];
  /** проводити можна лише без питань */
  canPost: boolean;
};

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
export const monthName = (ym: string) => MONTHS[+ym.slice(5, 7) - 1];
/** «за жовтень 2026 р.» */
export const forMonth = (ym: string) => `за ${monthName(ym)} ${ym.slice(0, 4)} р.`;
export const dateUa = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
export const dateLong = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS_GEN[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

export function runPayroll(ym: string, employees: Employee[], inputs: MonthInput[]): PayrollRun {
  const rates = ratesFor(ym);
  const results = employees.filter(e => e.hired.slice(0, 7) <= ym && (!e.fired || e.fired.slice(0, 7) >= ym)).map(e => {
    const inp = inputs.find(i => i.employeeId === e.id);
    if (!inp) return { ...calcEmployee(e, { employeeId: e.id, normDays: workdays(ym), workedDays: 0 }, ym, rates), issues: [`${e.name}: немає табеля за місяць`] };
    return calcEmployee(e, inp, ym, rates);
  });
  const sum = (k: 'gross' | 'pdfo' | 'vz' | 'net' | 'esv') => r2(results.reduce((s, x) => s + x[k], 0));
  const issues = results.flatMap(x => x.issues);
  // помилки, що блокують проведення; попередження «перевірте» лише показуються
  const blocking = issues.filter(t => !/перевірте|не застосована/.test(t));
  return {
    id: `ЗП-${ym}`, month: ym, date: `${ym}-${String(days(ym)).padStart(2, '0')}`, results,
    totals: { gross: sum('gross'), pdfo: sum('pdfo'), vz: sum('vz'), net: sum('net'), esv: sum('esv') },
    issues, canPost: !blocking.length
  };
}
