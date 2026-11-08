// Маршрут розпізнавання без мережі: підставний клієнт замість API. Перевіряє, яка модель читає документ,
// коли робиться друге читання і як рахується собівартість.
import { recognize } from '../netlify/functions/recognize.mts';
import { rereadReasons } from '../src/recognize/escalate';
import { callCost, total } from '../src/recognize/cost';
import { fromWire, type RecognizedWire } from '../src/recognize/schema';

let fails = 0;
const ok = (c: boolean, t: string) => { console.log(`${c ? '✓' : '✗'} ${t}`); if (!c) fails++; };

const doc = (over: Partial<RecognizedWire> = {}): RecognizedWire => ({
  doc_type: 'Видаткова накладна', kind: 'purchase_goods', direction: 'incoming', number: '14', date: '2026-08-22',
  counterparty: { name: 'ФОП Бригар', edrpou: '', vat_ipn: '' }, our_side: { name: '', code: '' },
  items: [{ name: 'Сир', qty: 2, unit: 'кг', price: 150, amount: 300 }, { name: 'Масло', qty: 1.5, unit: 'кг', price: 200, amount: 300 }],
  net: 600, vat: 0, total: 600, vat_rate: null, currency: 'UAH', account: '201 Сировина й матеріали',
  refs: { contract_no: '', contract_date: '', order_no: '', invoice_no: '', primary_no: '', period: '' }, purpose: '', account_sure: true,
  account_reason: '', handwritten: false, confidence: 95, uncertain: [], margin_notes: '', note: '', ...over
});
const usage = (i: number, o: number, cr = 0) => ({ input_tokens: i, output_tokens: o, cache_creation_input_tokens: 0, cache_read_input_tokens: cr });

type Reply = { triage?: { handwritten: boolean; clear: boolean } | Error; reads: (RecognizedWire | 'refusal' | Error)[] };
function fake(reply: Reply) {
  const seen: any[] = [];
  let n = 0;
  const parse = async (p: any) => {
    seen.push(p);
    if (p.model === 'claude-haiku-5-5') {
      if (reply.triage instanceof Error) throw reply.triage;
      return { model: p.model, stop_reason: 'end_turn', usage: usage(3000, 200), parsed_output: reply.triage ?? { handwritten: true, clear: false } };
    }
    const r = reply.reads[n++];
    if (r instanceof Error) throw r;
    if (r === 'refusal') return { model: p.model, stop_reason: 'refusal', usage: usage(8000, 10), parsed_output: null };
    return { model: p.model, stop_reason: 'end_turn', usage: usage(5000, 3000, 4000), parsed_output: r };
  };
  return { client: { beta: { messages: { parse } } } as any, seen };
}
const body = { name: 'x.jpg', mime: 'image/jpeg', data: 'AA', company: 'ТОВ «Хуст Ріка»' };
const file = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AA' } } as any;
const run = async (reply: Reply) => { const f = fake(reply); const out = await recognize(f.client, body, file); return { ...out, seen: f.seen, models: f.seen.map(p => `${p.model}/${p.output_config.effort}`) }; };

// правила другого читання
ok(rereadReasons(fromWire(doc())).length === 0, 'Узгоджене читання з високою впевненістю приймається з першого разу');
ok(rereadReasons(fromWire(doc({ confidence: 70 }))).some(x => x.includes('впевненість')), 'Низька впевненість — друге читання');
ok(rereadReasons(fromWire(doc({ items: [{ name: 'Сир', qty: 2, unit: 'кг', price: 150, amount: 390 }], net: 390, total: 390 }))).some(x => x.includes('кількість × ціна')), 'Кількість × ціна ≠ сума — друге читання');
ok(rereadReasons(fromWire(doc({ net: 700, total: 700 }))).some(x => x.includes('сума рядків')), 'Сума рядків ≠ підсумку — друге читання');
ok(rereadReasons(fromWire(doc({ net: 500, vat: 100, total: 650, items: [] }))).some(x => x.includes('ПДВ')), 'Без ПДВ + ПДВ ≠ всього — друге читання');
ok(rereadReasons(fromWire(doc({ uncertain: ['items[0].amount'] }))).length === 1, 'Сумнів моделі в сумі рядка — друге читання');
ok(rereadReasons(fromWire(doc({ uncertain: ['items[0].name', 'items[1].unit', 'margin_notes'] }))).length === 0, 'Сумнів лише в назві, одиниці чи приписці — без другого читання');
ok(rereadReasons(fromWire(doc({ kind: 'other', confidence: 0, items: [], net: null, vat: null, total: null }))).length === 0, 'Порожній бланк не перечитується');
ok(rereadReasons(fromWire(doc({ net: 499.99, total: 599.99, items: [{ name: 'Сир', qty: 3, unit: 'кг', price: 33.333, amount: 99.99 }, { name: 'М', qty: 1, unit: 'шт', price: 500, amount: 500 }], vat: 100 }))).length === 0, 'Копійчане округлення ціни не вважається розбіжністю');

// собівартість
const c = callCost('read', 'claude-opus-5-5', 'medium', usage(1_000_000, 0));
ok(c.usd === 4, 'Opus 5.5: мільйон вхідних токенів = 4 $');
ok(callCost('read', 'claude-sonnet-5-5', 'medium', usage(0, 1_000_000, 1_000_000)).usd === 10.2, 'Sonnet 5.5: вихід 10 $ і читання кешу 0,2 $ за мільйон');
ok(total([c, c]).uah === 336, 'Сума в гривнях за курсом 42');

// маршрут
{
  const r = await run({ triage: { handwritten: false, clear: true }, reads: [doc()] });
  ok(r.models.join(' ') === 'claude-haiku-5-5/low claude-sonnet-5-5/medium', `Друкований чіткий документ: Haiku сортує, Sonnet читає один раз (${r.models.join(', ')})`);
  ok(r.res.ok && r.res.passes === 1 && r.res.route === 'printed' && (r.res.cost?.usd ?? 0) > 0, 'Відповідь містить маршрут, одне читання і собівартість');
  ok(!('fallbacks' in r.seen[0]) && r.seen[1].fallbacks === 'default', 'Fallbacks лише на читаннях, не на сортуванні');
  ok(r.seen[1].system[0].cache_control?.type === 'ephemeral', 'Системний промпт читання кешується');
  ok(Array.isArray(r.log.calls) && (r.log.calls as any[]).length === 2, 'Лог містить кожен виклик з токенами');
}
{
  const bad = doc({ handwritten: true, items: [{ name: 'Сир', qty: 2, unit: 'кг', price: 150, amount: 390 }], net: 390, total: 390 });
  const good = doc({ handwritten: true, items: [{ name: 'Сир', qty: 2.6, unit: 'кг', price: 150, amount: 390 }], net: 390, total: 390 });
  const r = await run({ triage: { handwritten: true, clear: true }, reads: [bad, good] });
  ok(r.models.join(' ') === 'claude-haiku-5-5/low claude-opus-5-5/medium claude-opus-5-5/high', `Рукопис з розбіжністю: Opus medium, потім Opus high (${r.models.join(', ')})`);
  ok(r.res.ok && r.res.passes === 2 && r.res.result.items[0].qty === 2.6 && !!r.res.diff?.includes('items[0].qty'), 'Береться узгоджене читання, розбіжність позначена');
  ok(r.res.ok && !!r.res.reread?.length, 'Причина другого читання в відповіді');
}
{
  const r = await run({ triage: { handwritten: true, clear: true }, reads: [doc({ handwritten: true })] });
  ok(r.models.length === 2 && r.res.ok && r.res.passes === 1, 'Рукопис, де все сходиться: одне читання Opus');
}
{
  const r = await run({ triage: new Error('timeout'), reads: [doc()] });
  ok(r.models[1] === 'claude-opus-5-5/medium', 'Сортування впало: читаємо як рукопис (Opus)');
}
{
  const r = await run({ triage: { handwritten: false, clear: false }, reads: [doc()] });
  ok(r.models[1] === 'claude-opus-5-5/medium', 'Друковане, але нечітке фото — Opus');
}
{
  const r = await run({ triage: { handwritten: false, clear: true }, reads: ['refusal', doc()] });
  ok(r.res.ok && r.res.passes === 1 && r.models[2] === 'claude-opus-5-5/high', 'Відмова на першому читанні: друге читання Opus high');
}
{
  const r = await run({ triage: { handwritten: false, clear: true }, reads: ['refusal', 'refusal'] });
  ok(!r.res.ok && r.status === 422, 'Обидва читання відмовили — 422');
}
{
  const r = await run({ triage: { handwritten: true, clear: true }, reads: [doc({ confidence: 60 }), new Error('500')] });
  ok(r.res.ok && r.res.passes === 1 && r.log.skipped === 'помилка другого читання', 'Друге читання впало: лишається перше, з позначкою в лозі');
}

console.log(fails ? `\nПомилок: ${fails}` : '\nМаршрут розпізнавання працює');
process.exit(fails ? 1 : 0);
