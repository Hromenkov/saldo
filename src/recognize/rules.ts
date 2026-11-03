// «Навчання без навчання»: підтверджений рахунок для контрагента запам'ятовується як правило.
// Поки немає бекенду, правила живуть у браузері.
const KEY = 'saldo-rules';

type Rules = Record<string, string>;

function load(): Rules {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Rules; } catch { return {}; }
}

/** Ключ правила: для грошових документів окремо за видом, щоб правило «201» для постачальника не потрапило в платіжку. */
export const ruleKey = (edrpou: string, kind: string) => /^(cash|payment)_/.test(kind) ? `${edrpou}|${kind}` : edrpou;

export const ruleFor = (edrpou?: string, kind = '') => (edrpou ? load()[ruleKey(edrpou, kind)] : undefined);

export function saveRule(edrpou: string, acc: string, kind = '') {
  // податкові й зарплатні рахунки не запам'ятовуємо: кожен такий платіж звіряє бухгалтер
  if (/^(64|65|66)/.test(acc)) return;
  try { const r = load(); r[ruleKey(edrpou, kind)] = acc; localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* приватний режим */ }
}
