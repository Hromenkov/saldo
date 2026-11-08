// Прогін реальних документів через ту саму функцію розпізнавання, що працює на сайті.
// Потрібен ANTHROPIC_API_KEY. Запуск: ANTHROPIC_API_KEY=... npm run eval
// Еталони: tests/fixtures/*.json (поле file — зображення поруч у tests/fixtures).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import handler from '../netlify/functions/recognize.mts';

if (!process.env.ANTHROPIC_API_KEY) { console.log('Немає ANTHROPIC_API_KEY: еталонний прогін пропущено'); process.exit(0); }
const dir = 'tests/fixtures';
let pass = 0, total = 0, usd = 0;
for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
  const fx = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const data = readFileSync(join(dir, fx.file)).toString('base64');
  const mime = fx.file.endsWith('.png') ? 'image/png' : fx.file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
  const res = await handler(new Request('http://x/api/recognize', { method: 'POST', body: JSON.stringify({ name: fx.file, mime, data, company: fx.company || 'ТОВ «Хуст Ріка»' }) }));
  const out = await res.json();
  const e = fx.expect, r = out.result || {};
  const fails: string[] = [];
  const near = (a: number, b: number) => a != null && Math.abs(a - b) < 0.01;
  if (!out.ok) fails.push('помилка: ' + out.error);
  else {
    if (e.kind && r.kind !== e.kind) fails.push(`kind ${r.kind}`);
    if (e.number && (r.number || '').replace(/\D/g, '') !== e.number) fails.push(`номер ${r.number}`);
    if (e.date && r.date !== e.date) fails.push(`дата ${r.date}`);
    for (const k of ['net', 'vat', 'total'] as const) if (e[k] != null && !near(r[k], e[k])) fails.push(`${k} ${r[k]}`);
    if (e.counterparty_name_has && !(r.counterparty?.name || '').includes(e.counterparty_name_has)) fails.push(`контрагент ${r.counterparty?.name}`);
    if (e.margin_notes_has && !(r.margin_notes || '').replace(/\D/g, '').includes(e.margin_notes_has)) fails.push(`приписка ${r.margin_notes}`);
    for (const w of e.margin_notes_words || []) if (!(r.margin_notes || '').toLowerCase().includes(w.toLowerCase())) fails.push(`приписка без «${w}»: ${r.margin_notes}`);
    (e.items || []).forEach((it: any, i: number) => {
      const g = r.items?.[i] || {};
      if (it.name_has && !(g.name || '').includes(it.name_has)) fails.push(`рядок ${i + 1} назва ${g.name}`);
      for (const k of ['qty', 'price', 'amount']) if (it[k] != null && !near(g[k], it[k])) fails.push(`рядок ${i + 1} ${k} ${g[k]}`);
    });
  }
  total++; if (!fails.length) pass++;
  usd += out.cost?.usd ?? 0;
  const how = out.ok ? ` [${out.route}, читань ${out.passes}, ${out.cost?.uah ?? '?'} грн${out.reread ? '; друге читання: ' + out.reread.join('; ') : ''}]` : '';
  console.log(`${fails.length ? '✗' : '✓'} ${fx.file}${how}${fails.length ? ': ' + fails.join('; ') : ''}${out.diff?.length ? ` (розбіжності читань: ${out.diff.join(', ')})` : ''}`);
}
console.log(`\n${pass} з ${total}; собівартість ${usd.toFixed(3)} $ (${(usd * 42 / Math.max(1, total)).toFixed(2)} грн за документ)`);
process.exit(pass === total ? 0 : 1);
