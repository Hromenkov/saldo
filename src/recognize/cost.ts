// Собівартість розпізнавання: ціни моделей і підрахунок за usage з відповіді API.
// Ціни — $ за мільйон токенів (прайс Anthropic, листопад 2026). Запис у кеш дорожчий за вхід у 1,25 раза, читання з кешу — дешеве.

type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };
const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  // моделі, на які API може перекинути запит після відмови (fallbacks)
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }
};

/** Курс для оцінки в гривнях. Точність тут не потрібна: це порядок собівартості, а не бухгалтерія. */
export const USD_UAH = 42;

export type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
/** Один виклик моделі: що робив, якою моделлю, скільки токенів і грошей. */
export type Call = { step: 'triage' | 'read' | 'reread'; model: string; effort: string; input: number; output: number; cache_write: number; cache_read: number; usd: number; ms: number };

const priceOf = (model: string): Price => PRICES[model] ?? PRICES[Object.keys(PRICES).find(k => model.startsWith(k)) ?? ''] ?? PRICES['claude-opus-5-5'];
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function callCost(step: Call['step'], model: string, effort: string, u: Usage, ms = 0): Call {
  const p = priceOf(model);
  const cw = u.cache_creation_input_tokens ?? 0, cr = u.cache_read_input_tokens ?? 0;
  const usd = (u.input_tokens * p.input + u.output_tokens * p.output + cw * p.cacheWrite + cr * p.cacheRead) / 1e6;
  return { step, model, effort, input: u.input_tokens, output: u.output_tokens, cache_write: cw, cache_read: cr, usd: r6(usd), ms };
}

export function total(calls: Call[]) {
  const usd = r6(calls.reduce((s, c) => s + c.usd, 0));
  return { usd, uah: Math.round(usd * USD_UAH * 100) / 100 };
}
