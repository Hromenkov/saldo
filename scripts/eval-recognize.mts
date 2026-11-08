// Прогін реальних документів через ту саму функцію розпізнавання, що працює на сайті.
// Потрібен ANTHROPIC_API_KEY. Запуск: ANTHROPIC_API_KEY=... npm run eval
// Еталони: tests/fixtures/*.json (поле file — зображення поруч у tests/fixtures).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import handler from '../netlify/functions/recognize.mts';
import { score } from './score.mts';

if (!process.env.ANTHROPIC_API_KEY) { console.log('Немає ANTHROPIC_API_KEY: еталонний прогін пропущено'); process.exit(0); }
const dir = 'tests/fixtures';
let pass = 0, total = 0, usd = 0;
for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
  const fx = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const data = readFileSync(join(dir, fx.file)).toString('base64');
  const mime = fx.file.endsWith('.png') ? 'image/png' : fx.file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
  const res = await handler(new Request('http://x/api/recognize', { method: 'POST', body: JSON.stringify({ name: fx.file, mime, data, company: fx.company || 'ТОВ «Хуст Ріка»' }) }));
  const out = await res.json();
  const fails: string[] = out.ok ? score(fx.expect, out.result).fails : ['помилка: ' + out.error];
  total++; if (!fails.length) pass++;
  usd += out.cost?.usd ?? 0;
  const how = out.ok ? ` [${out.route}, читань ${out.passes}, ${out.cost?.uah ?? '?'} грн${out.reread ? '; друге читання: ' + out.reread.join('; ') : ''}]` : '';
  console.log(`${fails.length ? '✗' : '✓'} ${fx.file}${how}${fails.length ? ': ' + fails.join('; ') : ''}${out.diff?.length ? ` (розбіжності читань: ${out.diff.join(', ')})` : ''}`);
}
console.log(`\n${pass} з ${total}; собівартість ${usd.toFixed(3)} $ (${(usd * 42 / Math.max(1, total)).toFixed(2)} грн за документ)`);
process.exit(pass === total ? 0 : 1);
