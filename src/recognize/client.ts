// Браузерна частина: підготувати файл, надіслати на /api/recognize, зібрати документ для списку.
import type { Doc } from '../data';
import { autoReady, fieldLabel, postings, runChecks } from './checks';
import { matchItem } from './nomenclature';
import { checkLines, fitsKind, isCostAccount, purposeAccount, TAX_PURPOSE } from './chart';
import { isMoneyKind } from './accounts';
import { basisChain, cashFlowArticle } from './basis';
import { ruleFor } from './rules';
import { ACCOUNTS } from './accounts';
import type { RecognizeRequest, RecognizeResponse } from './schema';

const MAX_BYTES = 4.5 * 1024 * 1024; // запас до ліміту тіла запиту Netlify (6 МБ після base64)
const IMG_SIDE = 2400; // рукописні цифри потребують більшої роздільності

const toB64 = (buf: ArrayBuffer) => {
  let s = ''; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Фото з телефона важать 5–10 МБ: зменшуємо до 2400 px, цього вистачає для читання цифр. */
async function shrinkImage(file: File): Promise<{ blob: Blob; side: number }> {
  const bmp = await createImageBitmap(file);
  const side = Math.max(bmp.width, bmp.height);
  const k = Math.min(1, IMG_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res({ blob: b, side }) : rej(new Error('Не вдалося обробити фото'))), 'image/jpeg', 0.88));
}

export class RecognizeError extends Error {}

async function payload(file: File, company: string): Promise<RecognizeRequest & { side?: number }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf && !file.type.startsWith('image/')) throw new RecognizeError(`${file.name}: підтримуються PDF і фото`);
  const img = isPdf ? null : await shrinkImage(file);
  const blob = img ? img.blob : file;
  if (blob.size > MAX_BYTES) throw new RecognizeError(`${file.name}: файл завеликий (до 4,5 МБ)`);
  return { name: file.name, mime: isPdf ? 'application/pdf' : 'image/jpeg', data: toB64(await blob.arrayBuffer()), company, side: img?.side };
}

const ddmm = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '—');

export async function recognizeFile(file: File, company: string, existing: Doc[], id: number): Promise<Doc> {
  const body = await payload(file, company);
  let res: Response;
  try {
    res = await fetch('/api/recognize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, side: undefined }) });
  } catch { throw new RecognizeError('Немає з’єднання з сервером розпізнавання'); }
  let data: RecognizeResponse;
  try { data = await res.json(); } catch { throw new RecognizeError(res.status === 404 ? 'Розпізнавання доступне лише на сайті, не в локальному режимі' : `Сервер відповів з помилкою ${res.status}`); }
  if (!data.ok) throw new RecognizeError(data.error);

  const r = data.result;
  const edrpou = (r.counterparty.edrpou || '').replace(/\D/g, '') || undefined;
  const rule = ruleFor(edrpou, r.kind);
  const acc = rule && (ACCOUNTS as readonly string[]).includes(rule) ? rule : r.account;
  const checks = runChecks(r, existing, new Date(), company);
  if (body.side && body.side < 1200) checks.push({ ok: false, t: `Фото дрібне (${body.side} px): цифри можуть читатися з помилками, краще сфотографувати ближче` });
  if (data.passes === 2) checks.push(data.diff?.length
    ? { ok: false, t: `Два незалежні читання розійшлися: ${[...new Set(data.diff.map(fieldLabel))].join(', ')}. Звірте з оригіналом` }
    : { ok: true, t: 'Два незалежні читання збіглися в усіх цифрах' });
  r.items.forEach((it, i) => {
    if (it.qty != null && !Number.isInteger(it.qty) && /^шт/i.test(it.unit || '')) checks.push({ ok: false, t: `Рядок ${i + 1}: дробова кількість ${it.qty} в штуках. Можливо, це кг` });
  });
  if (r.handwritten) checks.push({ ok: false, t: 'Заповнено від руки: звірте цифри з оригіналом перед проведенням' });
  if (r.kind === 'purchase_goods' && r.items.length) {
    const m = r.items.map(it => matchItem(edrpou, it.name));
    const none = m.filter(x => !x).length, guess = m.filter(x => x && x.how !== 'map').length;
    if (none) checks.push({ ok: false, t: `Номенклатура: ${none} з ${m.length} позицій немає в довіднику, прив’яжіть або додайте нові` });
    else if (guess) checks.push({ ok: false, t: `Номенклатура: ${guess} з ${m.length} позицій зіставлено за схожою назвою, підтвердіть` });
    else checks.push({ ok: true, t: 'Номенклатура: усі позиції за збереженими прив’язками' });
  }
  // план рахунків: рахунок має відповідати виду документа, витрати 23/91/92/93/949 затверджує бухгалтер
  const accN = acc.split(' ')[0];
  if (isMoneyKind(r.kind)) {
    const tax = TAX_PURPOSE[accN];
    if (!fitsKind(r.kind, acc)) checks.push({ ok: false, t: `Рахунок ${accN} не підходить для ${r.kind.startsWith('cash') ? 'касового ордера' : 'платіжки'}: оберіть кореспондуючий рахунок` });
    else if (tax) {
      // податки й зарплата: рахунок має збігатися з призначенням платежу, і бухгалтер підтверджує завжди.
      // Податок важливіший за слово «зарплата»: «ПДФО із зарплати» — це 6411, а не 661.
      const p = r.purpose || '';
      const byPurpose = purposeAccount(p);
      if (byPurpose === accN) checks.push({ ok: false, t: `Рахунок ${accN} відповідає призначенню платежу. Податкові й зарплатні платежі підтверджує бухгалтер` });
      else checks.push({ ok: false, t: `Рахунок ${accN} не збігається з призначенням «${p || 'не знайдено'}»` + (byPurpose ? `: за призначенням це рахунок ${byPurpose}` : ': перевірте, який це платіж') });
    } else if (!rule && !r.account_sure) checks.push({ ok: false, t: `Рахунок ${accN} визначено з сумнівом: підтвердіть` });
    else if (!rule) checks.push({ ok: false, t: `Кореспондуючий рахунок ${accN} запропоновано системою: підтвердіть, далі для цього контрагента діятиме правило` });
  } else if (['purchase_goods', 'purchase_service', 'sale'].includes(r.kind)) {
    if (!fitsKind(r.kind, acc)) checks.push({ ok: false, t: `Рахунок ${accN} не відповідає виду документа: ${r.kind === 'purchase_goods' ? 'для товарів 201, 281, 22 або 152' : r.kind === 'sale' ? 'для продажу 701, 702 або 703' : 'для послуг 23, 91, 92, 93 або 949'}` });
    else if (!rule && isCostAccount(acc)) checks.push({ ok: false, t: `Рахунок витрат ${accN} запропоновано системою${r.account_sure ? '' : ' з сумнівом'}: розподіл між 23, 91, 92, 93 і 949 підтверджує бухгалтер` });
    else if (!rule && !r.account_sure) checks.push({ ok: false, t: `Рахунок ${accN} визначено з сумнівом: підтвердіть` });
  }
  // підстава платежу: договір → заявка/рахунок → накладна/акт/реалізація або нарахування для податків
  const refs = r.refs;
  if (isMoneyKind(r.kind)) {
    const chain = basisChain({ id, kind: r.kind, acc, edrpou, cp: r.counterparty.name || '', sum: r.total ?? 0, refs }, existing);
    for (const st of chain) {
      if (!st.ok) checks.push({ ok: false, t: `Підстава: ${st.label.toLowerCase()} ${st.text}` });
      if (st.note) checks.push({ ok: false, t: st.note });
    }
    if (chain.length && chain.every(st => st.ok && !st.note)) checks.push({ ok: true, t: 'Підставу платежу знайдено: ' + chain.map(st => st.label.toLowerCase()).join(' → ') });
  }
  const lines = postings(r, acc);
  const bad = checkLines(lines);
  checks.push(bad.length ? { ok: false, t: 'План рахунків: ' + bad.map(b => b.t).join('; ') } : lines.length ? { ok: true, t: 'Проводки: рахунки з плану рахунків, кореспонденція допустима' } : { ok: true, t: 'Проводок немає' });
  if (rule) checks.unshift({ ok: true, t: `Рахунок ${acc.split(' ')[0]} за вашим правилом для цього контрагента` });
  const conf = Math.max(0, Math.min(100, Math.round(r.confidence)));
  return {
    id, type: r.doc_type, no: r.number || '—', cp: r.counterparty.name || 'Контрагент не визначений',
    date: ddmm(r.date), y: r.date?.slice(0, 4), sum: r.total ?? 0, vat: r.vat ?? 0,
    st: autoReady(checks, conf) ? 'new' : 'check', src: body.mime === 'application/pdf' ? 'PDF' : 'Фото', conf,
    kind: r.kind === 'tax_invoice' ? 'pn' : r.kind, lines,
    acc, edrpou, checks, note: [r.purpose && `Призначення: ${r.purpose}`, r.note || r.account_reason].filter(Boolean).join('. '), items: r.items,
    comment: r.margin_notes?.trim() || undefined,
    refs, cf: cashFlowArticle(r.kind, acc)
  };
}
