// Наші компанії: документ, де покупець — будь-яка з них, наш. Нову компанію додають однією кнопкою з картки документа.
// Поки немає бекенду, список живе у браузері.
const KEY = 'saldo-companies';
export const DEFAULT_COMPANY = 'ТОВ «Приклад»';

export function ourCompanies(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return Array.isArray(v) && v.length ? v : [DEFAULT_COMPANY]; } catch { return [DEFAULT_COMPANY]; }
}
export function addCompany(name: string) {
  const list = ourCompanies();
  if (!list.includes(name)) list.push(name);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* приватний режим */ }
}
