// POST /api/recognize — читає PDF або фото первинного документа через Claude і повертає поля за схемою.
// Ключ береться зі змінної середовища ANTHROPIC_API_KEY у налаштуваннях Netlify (не з коду).
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Recognized, type RecognizeRequest, type RecognizeResponse } from '../../src/recognize/schema';

const MODEL = 'claude-opus-5-5';

const SYSTEM = `Ти досвідчений український бухгалтер. Тобі надсилають документ: накладну, акт, рахунок, заявку, податкову накладну, чек, ТТН, касовий ордер (ПКО, РКО) або платіжну інструкцію. Твоє завдання: точно витягти з нього дані за схемою.

Правила:
- Переписуй номери, коди і суми точно так, як надруковано. Не вигадуй і не обчислюй те, чого немає на документі: такі поля став null і додай їх назви в uncertain.
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
- Порожній бланк без заповнених даних: kind = other, confidence 0, у note напиши «Порожній бланк». Нічого не вигадуй.
- Якщо на зображенні немає бухгалтерського документа, постав kind = other, confidence 0 і поясни в note.`;

const json = (body: RecognizeResponse, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default async (req: Request) => {
  // GET — перевірка з браузера: чи підключений ключ (сам ключ не показується)
  if (req.method === 'GET') return new Response(JSON.stringify({ service: 'recognize', model: MODEL, key: process.env.ANTHROPIC_API_KEY ? 'підключено' : 'не задано' }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
  if (req.method !== 'POST') return json({ ok: false, error: 'Потрібен POST' }, 405);
  if (!process.env.ANTHROPIC_API_KEY) return json({ ok: false, error: 'Розпізнавання ще не підключене: на сервері не задано ключ ANTHROPIC_API_KEY' }, 503);

  let body: RecognizeRequest;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Некоректний запит' }, 400); }
  const isPdf = body.mime === 'application/pdf';
  if (!body.data || !(isPdf || /^image\/(jpeg|png|webp|gif)$/.test(body.mime))) return json({ ok: false, error: 'Підтримуються PDF і фото' }, 400);

  const file: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.data } }
    : { type: 'image', source: { type: 'base64', media_type: body.mime as 'image/jpeg', data: body.data } };

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  try {
    const msg = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: betaZodOutputFormat(Recognized) },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [file, { type: 'text', text: `Наша компанія: ${body.company || 'ТОВ «Приклад»'}. Файл: ${body.name}. Розпізнай документ.` }]
      }]
    });
    if (msg.stop_reason === 'refusal') return json({ ok: false, error: 'Модель відмовилася обробляти цей файл' }, 422);
    if (msg.stop_reason === 'max_tokens' || !msg.parsed_output) return json({ ok: false, error: 'Документ задовгий або нечитабельний: спробуйте окремі сторінки' }, 422);
    return json({ ok: true, result: msg.parsed_output, model: msg.model });
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

export const config = { path: '/api/recognize' };
