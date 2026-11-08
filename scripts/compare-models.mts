// Сліпе порівняння моделей на еталонних документах tests/fixtures: та сама інструкція й та сама схема,
// одне читання на модель, без друге-читання і звірок. Рахує точність полів, арифметику і ціну за документ.
//
// Запуск: ANTHROPIC_API_KEY=... GEMINI_API_KEY=... npx tsx scripts/compare-models.mts [звіт.md]
//   MODELS — через кому, формат провайдер:модель@effort, напр. "anthropic:claude-sonnet-5-5@medium,gemini:gemini-x-flash"
//   GEMINI_PRICES — ціни Gemini $ за млн токенів: {"gemini-x-flash":[вхід,вихід]} (вихід включає «думки»)
//   RUNS — скільки разів читати кожен документ (за замовчуванням 1)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { SYSTEM } from '../netlify/functions/recognize.mts';
import { RecognizedWire, fromWire } from '../src/recognize/schema';
import { callCost, USD_UAH } from '../src/recognize/cost';
import { rereadReasons } from '../src/recognize/escalate';
import { score } from './score.mts';

const DEFAULT = 'anthropic:claude-opus-5-5@high,anthropic:claude-opus-5-5@medium,anthropic:claude-sonnet-5-5@medium,anthropic:claude-haiku-5-5@medium';
const models = (process.env.MODELS || DEFAULT).split(',').map(s => s.trim()).filter(Boolean)
  .filter(m => !m.startsWith('anthropic:') || process.env.ANTHROPIC_API_KEY)
  .filter(m => !m.startsWith('gemini:') || process.env.GEMINI_API_KEY);
if (!models.length) { console.log('Немає ключів ANTHROPIC_API_KEY / GEMINI_API_KEY: порівняння пропущено'); process.exit(0); }
const gemPrices: Record<string, [number, number]> = JSON.parse(process.env.GEMINI_PRICES || '{}');
const RUNS = Number(process.env.RUNS || 1);

type Out = { result: any | null; usd: number | null; ms: number; error?: string };
const anthropic = new Anthropic({ timeout: 120_000, maxRetries: 2 });

async function readClaude(model: string, effort: string, mime: string, data: string, company: string): Promise<Out> {
  const t = Date.now();
  const file: Anthropic.Beta.BetaContentBlockParam = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data } };
  const m = await anthropic.beta.messages.parse({
    model, max_tokens: 16000,
    output_config: { effort: effort as 'medium', format: betaZodOutputFormat(RecognizedWire) },
    system: SYSTEM,
    messages: [{ role: 'user', content: [file, { type: 'text', text: `Наша компанія: ${company}. Розпізнай документ.` }] }]
  });
  const usd = callCost('read', m.model, effort, m.usage).usd;
  if (!m.parsed_output) return { result: null, usd, ms: Date.now() - t, error: m.stop_reason ?? 'немає відповіді' };
  return { result: fromWire(m.parsed_output), usd, ms: Date.now() - t };
}

const wireSchema = z.toJSONSchema(RecognizedWire, { target: 'draft-7' });
async function readGemini(model: string, mime: string, data: string, company: string): Promise<Out> {
  const t = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data } }, { text: `Наша компанія: ${company}. Розпізнай документ.` }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: wireSchema }
    })
  });
  const j: any = await res.json();
  if (!res.ok) return { result: null, usd: null, ms: Date.now() - t, error: `HTTP ${res.status}: ${j.error?.message ?? ''}`.slice(0, 200) };
  const u = j.usageMetadata || {};
  const p = gemPrices[model];
  const usd = p ? ((u.promptTokenCount ?? 0) * p[0] + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * p[1]) / 1e6 : null;
  const text = j.candidates?.[0]?.content?.parts?.map((x: any) => x.text || '').join('') || '';
  const parsed = RecognizedWire.safeParse((() => { try { return JSON.parse(text); } catch { return null; } })());
  if (!parsed.success) return { result: null, usd, ms: Date.now() - t, error: 'відповідь не за схемою' };
  return { result: fromWire(parsed.data), usd, ms: Date.now() - t };
}

const dir = 'tests/fixtures';
const fixtures = readdirSync(dir).filter(x => x.endsWith('.json')).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
type Row = { model: string; fields: number; ok: number; docsOk: number; docs: number; arith: number; usd: number; priced: boolean; ms: number; notes: string[] };
const rows: Row[] = [];

for (const spec of models) {
  const [prov, rest] = spec.split(':');
  const [model, effort = 'medium'] = rest.split('@');
  const row: Row = { model: spec.replace(/^\w+:/, ''), fields: 0, ok: 0, docsOk: 0, docs: 0, arith: 0, usd: 0, priced: true, ms: 0, notes: [] };
  for (const fx of fixtures) for (let run = 0; run < RUNS; run++) {
    const data = readFileSync(join(dir, fx.file)).toString('base64');
    const mime = fx.file.endsWith('.png') ? 'image/png' : fx.file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    let out: Out;
    try { out = prov === 'gemini' ? await readGemini(model, mime, data, fx.company || 'ТОВ «Хуст Ріка»') : await readClaude(model, effort, mime, data, fx.company || 'ТОВ «Хуст Ріка»'); }
    catch (e: any) { out = { result: null, usd: null, ms: 0, error: String(e?.message ?? e).slice(0, 200) }; }
    row.docs++; row.ms += out.ms;
    if (out.usd == null) row.priced = false; else row.usd += out.usd;
    const s = out.result ? score(fx.expect, out.result) : { checked: score(fx.expect, {}).checked, fails: ['помилка: ' + out.error] };
    row.fields += s.checked; row.ok += s.checked - (out.result ? s.fails.length : s.checked);
    if (out.result && !s.fails.length) row.docsOk++;
    if (out.result && !rereadReasons(out.result).some(x => /≠|немає суми/.test(x))) row.arith++;
    if (s.fails.length) row.notes.push(`${fx.file}: ${s.fails.join('; ')}`);
    console.log(`${s.fails.length ? '✗' : '✓'} ${row.model} ${fx.file} ${out.usd != null ? (out.usd * USD_UAH).toFixed(2) + ' грн' : ''} ${s.fails.join('; ')}`);
  }
  rows.push(row);
}

const pct = (a: number, b: number) => b ? Math.round(a / b * 100) + ' %' : '—';
const lines = [
  `# Порівняння моделей на ${fixtures.length} документах × ${RUNS}`, '',
  '| Модель | Поля вірно | Документи без жодної помилки | Арифметика сходиться | Грн за документ | Сек за документ |',
  '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.model} | ${pct(r.ok, r.fields)} (${r.ok}/${r.fields}) | ${r.docsOk}/${r.docs} | ${r.arith}/${r.docs} | ${r.priced ? (r.usd * USD_UAH / r.docs).toFixed(2) : 'ціна не задана'} | ${(r.ms / r.docs / 1000).toFixed(1)} |`),
  '', '## Помилки', '',
  ...rows.flatMap(r => r.notes.length ? [`**${r.model}**`, ...r.notes.map(n => `- ${n}`), ''] : [])
];
const report = lines.join('\n');
console.log('\n' + report);
if (process.argv[2]) writeFileSync(process.argv[2], report);
