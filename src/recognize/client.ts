// Браузерна частина: підготувати файл, надіслати на /api/recognize, зібрати документ для списку.
import type { Doc } from '../data';
import { autoReady, postings, runChecks } from './checks';
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
  const rule = ruleFor(edrpou);
  const acc = rule && (ACCOUNTS as readonly string[]).includes(rule) ? rule : r.account;
  const checks = runChecks(r, existing, new Date(), company);
  if (body.side && body.side < 1200) checks.push({ ok: false, t: `Фото дрібне (${body.side} px): цифри можуть читатися з помилками, краще сфотографувати ближче` });
  if (r.handwritten) checks.push({ ok: false, t: 'Заповнено від руки: звірте цифри з оригіналом перед проведенням' });
  if (rule) checks.unshift({ ok: true, t: `Рахунок ${acc.split(' ')[0]} за вашим правилом для цього контрагента` });
  const conf = Math.max(0, Math.min(100, Math.round(r.confidence)));
  return {
    id, type: r.doc_type, no: r.number || '—', cp: r.counterparty.name || 'Контрагент не визначений',
    date: ddmm(r.date), y: r.date?.slice(0, 4), sum: r.total ?? 0, vat: r.vat ?? 0,
    st: autoReady(checks, conf) ? 'new' : 'check', src: body.mime === 'application/pdf' ? 'PDF' : 'Фото', conf,
    kind: r.kind === 'tax_invoice' ? 'pn' : r.kind, lines: postings(r, acc),
    acc, edrpou, checks, note: r.note || r.account_reason, items: r.items
  };
}
