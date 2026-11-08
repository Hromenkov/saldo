// POST /api/recognize — читає PDF або фото первинного документа через Claude і повертає поля за схемою.
// Ключ береться зі змінної середовища ANTHROPIC_API_KEY у налаштуваннях Netlify (не з коду).
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { RecognizedWire, fromWire, type RecognizeRequest, type RecognizeResponse } from '../../src/recognize/schema';
import { reconcile } from '../../src/recognize/reconcile';
// Схема витрат: дешева модель спершу сортує документ (друкований чи рукописний), друковані читає Sonnet,
// рукописні й погані фото — Opus, обидва на effort medium. Друге читання (Opus, effort high) лише тоді,
// коли перше не пройшло перевірок кодом: арифметика, сумнів у ключових полях, низька впевненість.
// Кожне розпізнавання пише в лог рядок recognize_cost з токенами й собівартістю.
import { z } from 'zod';
import { callCost, total, type Call } from '../../src/recognize/cost';
import { rereadReasons } from '../../src/recognize/escalate';

const OPUS = 'claude-opus-5-5';
const SONNET = 'claude-sonnet-5-5';
const HAIKU = 'claude-haiku-5-5';
/** Скільки часу є на все розпізнавання (ліміт функції Netlify — хвилина). */
const BUDGET_MS = 55_000;

const Triage = z.object({
  handwritten: z.boolean().describe('true, якщо номер, дата, кількості, ціни чи суми вписані від руки'),
  clear: z.boolean().describe('true, якщо текст і цифри чіткі: не розмито, не криво, не обрізано, без відблисків і печаток поверх цифр')
});
const TRIAGE_SYSTEM = 'Ти сортуєш фото і скани бухгалтерських документів перед розпізнаванням. Подивись на документ і дай лише дві ознаки за схемою. Якщо сумніваєшся, handwritten = true, clear = false.';

export const SYSTEM = `Ти досвідчений український бухгалтер. Тобі надсилають документ: накладну, акт, рахунок, заявку, податкову накладну, чек, ТТН, касовий ордер (ПКО, РКО) або платіжну інструкцію. Твоє завдання: точно витягти з нього дані за схемою.

Правила:
- Переписуй номери, коди і суми точно так, як надруковано. Не вигадуй і не обчислюй те, чого немає на документі: такі поля став null (числа) або порожній рядок "" (текст) і додай їх назви в uncertain.
- Якщо цифра читається неоднозначно (розмите фото, печатка поверх), все одно дай найкращий варіант, але додай поле в uncertain і знизь confidence.
- Суми подавай числами в гривнях з копійками (12345.67), дати у форматі YYYY-MM-DD.
- Контрагент це інша сторона документа, не наша компанія. Напрям визначай відносно нашої компанії. Якщо нашої компанії в документі немає, вважай нашою стороною покупця, запиши його в our_side, а direction = incoming.
- Первинних документів для проводок лише два: накладна (товари) і акт (роботи, послуги). Рахунок, рахунок-фактура, договір: kind = invoice. Не називай рахунок накладною.
- Заявка, замовлення: kind = order, проводок не створює.
- Грошові документи: ПКО — cash_in, РКО — cash_out, платіжна інструкція (доручення) — payment_in, якщо гроші надходять нашій компанії, і payment_out, якщо платимо ми. Для них account — кореспондуючий рахунок: 361 оплата від покупця за відвантажене, 681 аванс від покупця (оплата до відвантаження або «передоплата»), 631 оплата постачальнику, 371 аванс постачальнику, 372 видача під звіт або повернення підзвітних, 661 зарплата, 6411 ПДФО, 642 військовий збір, 651 ЄСВ, 6412 ПДВ, 6413 податок на прибуток, 333 інкасація, 311 здача готівки в банк. Призначення платежу перепиши дослівно в purpose. Податок визначай лише за призначенням платежу, а не за отримувачем: усі податки отримує ДПС. Якщо призначення неоднозначне, account_sure = false.
- Підстави заповнюй у refs з призначення платежу або з рядка «Підстава»: номер і дату договору, номер заявки, рахунку, накладної чи акта, період для податків і зарплати. Нічого не вигадуй: чого немає в тексті, те null.
- ПДВ сплачується з електронного рахунку ПДВ: платіжка з рахунку ПДВ на бюджет — account 6412; поповнення електронного рахунку ПДВ з поточного — account 315.
- Номенклатуру (усі рядки товарів і послуг) переписуй повністю в items, нічого не пропускай.
- Якщо суми без ПДВ немає на документі, але її можна обчислити (всього − ПДВ), обчисли і додай net в uncertain.
- Рахунок обліку обирай за змістом господарської операції відповідно до Інструкції 291 про застосування Плану рахунків. Не плутай рахунки витрат:
  23 — прямі виробничі витрати (сировина в техкарту, пряма зарплата виробничників);
  91 — загальновиробничі: утримання виробничих приміщень і обладнання (кухня, пральня, цех), їхня електроенергія, вода, ремонт, керівники виробництва;
  92 — адміністративні: управління підприємством у цілому (офіс, бухгалтерія, юристи, аудит, РКО банку, зв’язок офісу, канцтовари, облікові програми);
  93 — витрати на збут: реклама, маркетинг, комісії booking-сервісів і агентів, доставка покупцям, утримання залів і точок обслуговування клієнтів, пакування;
  949 — інші операційні: штрафи, пені, благодійність, нестачі, сумнівні борги.
  Запаси: 201 — сировина й матеріали, 281 — товари для перепродажу, 22 — МШП (інвентар, посуд, спецодяг строком до року), 152 — основні засоби.
  Якщо зі змісту документа не видно, для якого підрозділу витрата (кухня чи офіс, зал чи адміністрація), став account_sure = false і поясни сумнів в account_reason. Не вгадуй між 91, 92 і 93.
- Документ може бути заповнений від руки (товарна накладна, рахунок). Уважно читай рукописні цифри: розрізняй 1 і 7, 4 і 9, 3 і 8, 0 і 6, кому і крапку в сумах. Перевір себе: кількість × ціна має дорівнювати сумі рядка, а сума рядків загальній сумі. Якщо не сходиться, перечитай цифри ще раз; якщо все одно не сходиться, перепиши як є і додай поле в uncertain.
- Якщо в документі кілька ставок ПДВ (наприклад, 20% і 7% у податковій накладній), vat_rate = null, а net, vat і total бери з підсумків документа.
- ТТН, CMR, транспортна накладна без сум товару: kind = other. Якщо в ТТН є «Всього відпущено на суму», заповни суми.
- Рукописні бланки накладних: «Кому відпущено» — покупець (отримувач), «Від кого прийнято» — постачальник. Скорочення «ф/п», «п/п», «фоп», «ФОП» означають фізичну особу-підприємця: назву записуй як «ФОП Прізвище І.Б.». Дату з окремих полів («22» «08» 2026) збирай в одну.
- Номер телефону, дописки на полях, підписи й розшифровки не є номером документа, кодом чи сумою: у ці поля їх не бери. Номер документа — лише у полі «№» біля назви.
- Рукописні приписки на полях і поверх бланку (телефон, ім’я, «оплачено», «борг», «до п’ятниці» тощо) перепиши дослівно в margin_notes через «; », наприклад «063-173-37-42; XV; Лучаш?». Якщо слово чи цифра читаються неоднозначно, постав «?» одразу після них. Це лише коментар: на суми, контрагента й рахунок приписки не впливають. Підписи й розшифровки підписів у margin_notes не пиши.
- Код ЄДРПОУ або ІПН може бути лише на печатці. Бери його з печатки, тільки якщо всі цифри чітко читаються, інакше null. Ніколи не вигадуй код.
- Надрукований рядок «ПДВ 20%» з порожньою клітинкою означає, що ПДВ немає (постачальник не платник ПДВ): vat = 0, vat_rate = null. Не нараховуй 20% сам.
- Одиницю виміру читай уважно: «кг», «шт», «л», «уп». Дробова кількість (17,7) майже завжди означає вагу чи об’єм, а не штуки. Якщо написано «шт», а кількість дробова, все одно перепиши як написано і додай items[i].unit в uncertain.
- Назву товару переписуй так, як написано, без скорочень від себе; нерозбірливе закінчення слова доповнюй лише тоді, коли воно однозначне (Карпат… → Карпатський), і тоді додай items[i].name в uncertain.
- Порожній бланк без заповнених даних: kind = other, confidence 0, у note напиши «Порожній бланк». Нічого не вигадуй.
- Якщо на зображенні немає бухгалтерського документа, постав kind = other, confidence 0 і поясни в note.`;

const json = (body: RecognizeResponse, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default async (req: Request) => {
  // GET — перевірка з браузера: чи підключений ключ (сам ключ не показується)
  if (req.method === 'GET') return new Response(JSON.stringify({ service: 'recognize', model: OPUS, key: process.env.ANTHROPIC_API_KEY ? 'підключено' : 'не задано' }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
  if (req.method !== 'POST') return json({ ok: false, error: 'Потрібен POST' }, 405);
  if (!process.env.ANTHROPIC_API_KEY) return json({ ok: false, error: 'Розпізнавання ще не підключене: на сервері не задано ключ ANTHROPIC_API_KEY' }, 503);

  let body: RecognizeRequest;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Некоректний запит' }, 400); }
  const isPdf = body.mime === 'application/pdf';
  if (!body.data || !(isPdf || /^image\/(jpeg|png|webp|gif)$/.test(body.mime))) return json({ ok: false, error: 'Підтримуються PDF і фото' }, 400);

  const file: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.data } }
    : { type: 'image', source: { type: 'base64', media_type: body.mime as 'image/jpeg', data: body.data } };

  const client = new Anthropic({ timeout: BUDGET_MS, maxRetries: 1 });
  try {
    const out = await recognize(client, body, file);
    console.log(JSON.stringify({ event: 'recognize_cost', file: body.name, mime: body.mime, ...out.log }));
    return json(out.res, out.status);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ ok: false, error: 'Ключ ANTHROPIC_API_KEY недійсний' }, 503);
    if (e instanceof Anthropic.RateLimitError) return json({ ok: false, error: 'Забагато запитів, спробуйте за хвилину' }, 429);
    if (e instanceof Anthropic.BadRequestError) return json({ ok: false, error: 'Файл не прийнято: ' + e.message }, 400);
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json({ ok: false, error: 'Розпізнавання триває задовго, спробуйте ще раз' }, 504);
    if (e instanceof Anthropic.APIError) return json({ ok: false, error: `Помилка сервісу розпізнавання (${e.status ?? 'мережа'})` }, 502);
    console.error(e);
    return json({ ok: false, error: 'Внутрішня помилка розпізнавання' }, 500);
  }
};

type File = Anthropic.Beta.BetaContentBlockParam;
type Client = Pick<Anthropic, 'beta'>;

/** Ядро розпізнавання; клієнт передається ззовні, щоб маршрут можна було перевірити без мережі. */
export async function recognize(client: Client, body: RecognizeRequest, file: File, now = Date.now): Promise<{ status: number; log: Record<string, unknown>; res: RecognizeResponse }> {
  const t0 = now();
  const left = () => BUDGET_MS - (now() - t0);
  const calls: Call[] = [];
  const prompt = `Наша компанія: ${body.company || 'ТОВ «Приклад»'}. Файл: ${body.name}. Розпізнай документ.`;

  // 1. Сортування: копійки (Haiku), але вирішує, чи можна читати дешевшою моделлю. Будь-яка помилка — читаємо як рукопис.
  let printed = false;
  try {
    const t = now();
    const m = await client.beta.messages.parse({
      model: HAIKU, max_tokens: 1500,
      output_config: { effort: 'low', format: betaZodOutputFormat(Triage) },
      system: TRIAGE_SYSTEM,
      messages: [{ role: 'user', content: [file, { type: 'text', text: 'Друкований чи рукописний, чіткий чи ні?' }] }]
    }, { timeout: 10_000, maxRetries: 0 });
    calls.push(callCost('triage', m.model, 'low', m.usage, now() - t));
    printed = !!m.parsed_output && !m.parsed_output.handwritten && m.parsed_output.clear;
  } catch { /* сортування не обов’язкове */ }

  const read = async (step: Call['step'], model: string, effort: 'medium' | 'high') => {
    const t = now();
    const m = await client.beta.messages.parse({
      model, max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: betaZodOutputFormat(RecognizedWire) },
      // системний промпт однаковий для всіх документів: кешується, друге читання і пакет документів платять за нього в 20 разів менше
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [file, { type: 'text', text: prompt }] }]
    }, { timeout: Math.max(5_000, left()), maxRetries: step === 'read' ? 1 : 0 });
    calls.push(callCost(step, m.model, effort, m.usage, now() - t));
    return m;
  };
  const usable = (m: Awaited<ReturnType<typeof read>> | null) => !!m && m.stop_reason !== 'refusal' && m.stop_reason !== 'max_tokens' && !!m.parsed_output;

  // 2. Перше читання: друковане — Sonnet, рукопис і погане фото — Opus; обидва medium.
  const route: 'printed' | 'handwritten' = printed ? 'printed' : 'handwritten';
  let first: Awaited<ReturnType<typeof read>> | null = null, firstErr: unknown;
  try { first = await read('read', printed ? SONNET : OPUS, 'medium'); } catch (e) { firstErr = e; }
  const a = usable(first) ? fromWire(first!.parsed_output!) : null;
  const reasons = a ? rereadReasons(a) : [first ? `перше читання: ${first.stop_reason}` : 'перше читання не вдалося'];

  // 3. Друге читання лише за потреби: Opus на effort high, і звірка з першим.
  let second: Awaited<ReturnType<typeof read>> | null = null;
  let skipped = '';
  if (reasons.length) {
    if (left() < 15_000 && a) skipped = 'не вистачило часу';
    else { try { second = await read('reread', OPUS, 'high'); } catch (e) { if (!a) throw e; skipped = 'помилка другого читання'; } }
  }
  const b = usable(second) ? fromWire(second!.parsed_output!) : null;
  const cost = total(calls);
  const log = { route, passes: calls.filter(c => c.step !== 'triage').length, reasons, skipped: skipped || undefined, ...cost, ms: now() - t0, calls };
  const meta = { route, cost, reread: reasons.length ? reasons : undefined };

  if (!a && !b) {
    if (!first && !second && firstErr) throw firstErr;
    const refused = [first, second].some(m => m?.stop_reason === 'refusal');
    return { status: 422, log, res: { ok: false as const, error: refused ? 'Модель відмовилася обробляти цей файл' : 'Документ задовгий або нечитабельний: спробуйте окремі сторінки' } };
  }
  if (a && b) {
    const { result, diff } = reconcile(a, b);
    return { status: 200, log, res: { ok: true as const, result, model: second!.model, passes: 2, diff, ...meta } };
  }
  const only = (a ?? b)!, m = (a ? first : second)!;
  return { status: 200, log, res: { ok: true as const, result: only, model: m.model, passes: 1, ...meta } };
}

export const config = { path: '/api/recognize' };
