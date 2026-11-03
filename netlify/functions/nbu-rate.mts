// GET /api/nbu-rate?cur=EUR&date=2026-11-02 — офіційний курс НБУ на дату.
// Проксі до bank.gov.ua, щоб браузер не залежав від CORS сайту НБУ.
import { nbuUrl, parseNbu } from '../../src/finance/nbu';

const json = (body: unknown, status = 200, cache = false) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...(cache ? { 'cache-control': 'public, max-age=86400' } : {}) } });

export default async (req: Request) => {
  const u = new URL(req.url);
  const cur = (u.searchParams.get('cur') ?? '').toUpperCase();
  const date = u.searchParams.get('date') ?? '';
  if (!/^[A-Z]{3}$/.test(cur) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'Потрібні cur=EUR і date=YYYY-MM-DD' }, 400);
  try {
    const r = await fetch(nbuUrl(cur, date), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return json({ ok: false, error: `НБУ відповів ${r.status}` }, 502);
    const rate = parseNbu(await r.json(), cur);
    if (!rate) return json({ ok: false, error: `НБУ не має курсу ${cur} на ${date}` }, 404);
    // курс на минулу дату не змінюється, його можна кешувати
    return json({ ok: true, cur, date, rate, source: 'НБУ' }, 200, date < new Date().toISOString().slice(0, 10));
  } catch {
    return json({ ok: false, error: 'Сайт НБУ недоступний, спробуйте пізніше' }, 504);
  }
};

export const config = { path: '/api/nbu-rate' };
