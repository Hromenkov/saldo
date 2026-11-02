// «Навчання без навчання»: підтверджений рахунок для контрагента запам'ятовується як правило.
// Поки немає бекенду, правила живуть у браузері.
const KEY = 'saldo-rules';

type Rules = Record<string, string>;

function load(): Rules {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Rules; } catch { return {}; }
}

export const ruleFor = (edrpou?: string) => (edrpou ? load()[edrpou] : undefined);

export function saveRule(edrpou: string, acc: string) {
  try { const r = load(); r[edrpou] = acc; localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* приватний режим */ }
}
