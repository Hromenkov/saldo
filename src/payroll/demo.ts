// Демо-дані зарплати готельного комплексу за жовтень 2026. Коли з'явиться бекенд, їх замінить API і табель.
import { prevMonths, workdays, type Employee, type MonthInput } from './engine';

export const PAY_MONTH = '2026-10';
export const PAY_COMPANY = { name: 'ТОВ «Приклад»', edrpou: '12345678' };

const flat = (rate: number) => prevMonths(PAY_MONTH, 12).map(month => ({ month, earnings: rate }));

export const EMPLOYEES: Employee[] = [
  { id: 'e1', name: 'Бондар Олена Василівна', ipn: '3012345671', position: 'Головний бухгалтер', dept: 'Адміністрація', hired: '2019-03-01',
    pay: { type: 'monthly', rate: 28000 }, costAccount: '92', insuranceYears: 14, history: flat(28000) },
  { id: 'e2', name: 'Савчук Ігор Петрович', ipn: '3123456782', position: 'Адміністратор рецепції', dept: 'Номерний фонд', hired: '2022-05-16',
    pay: { type: 'monthly', rate: 18000 }, costAccount: '23', insuranceYears: 4, history: flat(18000) },
  { id: 'e3', name: 'Ткачук Марія Іванівна', ipn: '3234567893', position: 'Покоївка', dept: 'Номерний фонд', hired: '2024-02-01',
    pay: { type: 'monthly', rate: 12000 }, costAccount: '23', insuranceYears: 2, history: flat(12000) },
  { id: 'e4', name: 'Мельник Віктор Олегович', ipn: '3345678904', position: 'Інженер з експлуатації', dept: 'Технічна служба', hired: '2021-09-01',
    pay: { type: 'monthly', rate: 20000 }, costAccount: '91', insuranceYears: 9, history: flat(20000) },
  { id: 'e5', name: 'Кравець Наталія Сергіївна', ipn: '3456789015', position: 'Менеджер з продажу', dept: 'Відділ продажу', hired: '2023-04-03',
    pay: { type: 'monthly', rate: 16000 }, costAccount: '93', insuranceYears: 6, history: flat(16000) },
  { id: 'e6', name: 'Лисенко Дмитро Андрійович', ipn: '3567890126', position: 'Кухар ресторану', dept: 'Ресторан', hired: '2025-06-02',
    pay: { type: 'hourly', rate: 110 }, costAccount: null, insuranceYears: 7, history: flat(17600) },
  { id: 'e7', name: 'Шевчук Оксана Миколаївна', ipn: '3678901237', position: 'Прибиральниця (0,5 ставки)', dept: 'Номерний фонд', hired: '2025-01-13',
    pay: { type: 'monthly', rate: 4500 }, costAccount: '23', insuranceYears: 20, psp: true, history: flat(4500) }
];

const N = workdays(PAY_MONTH);
export const INPUTS: MonthInput[] = [
  { employeeId: 'e1', normDays: N },
  { employeeId: 'e2', normDays: N, workedDays: N - 5, vacation: { days: 7 } },
  { employeeId: 'e3', normDays: N, workedDays: N - 4, sick: { days: 6 } },
  { employeeId: 'e4', normDays: N },
  { employeeId: 'e5', normDays: N, bonus: 4000 },
  { employeeId: 'e6', normDays: N, hours: 160 },
  { employeeId: 'e7', normDays: N }
];
