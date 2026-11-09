// Спільний шлях «файли → розпізнавання → документи в списку»: діалог завантаження, камера телефона, черга без зв’язку.
import { useCallback, useRef } from 'react';
import { useApp } from '../store';
import { plural } from '../lib';
import { OfflineError, recognizeFile } from '../recognize/client';
import { ourCompanies } from '../recognize/companies';
import { withPosted } from '../recognize/registry';
import { enqueue } from '../mobile/queue';

export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Невідома помилка');

type Opts = {
  /** без зв’язку покласти фото в чергу телефона, а не показувати помилку */
  queueOffline?: boolean;
  /** відкрити картку, якщо розпізнано рівно один документ */
  openOne?: boolean;
};

/** Повертає функцію, яка розпізнає файли й додає документи; результат — рядки для снекбара */
export function useRecognize() {
  const { s, upd, go, snack, openSheet } = useApp();
  const docs = useRef(s.docs); docs.current = s.docs;

  return useCallback(async (rec: File[], { queueOffline = false, openOne = true }: Opts = {}): Promise<string[]> => {
    const msgs: string[] = [];
    if (!rec.length) return msgs;
    if (queueOffline && navigator.onLine === false && await enqueue(rec))
      return [`Немає зв’язку: ${rec.length} фото збережено на телефоні й надішлеться, щойно з’явиться мережа`];

    snack(`Розпізнаю ${rec.length} ${plural(rec.length, 'файл', 'файли', 'файлів')}. Це займе до хвилини`);
    const base = Date.now() + 1000;
    const res = await Promise.allSettled(rec.map((f, i) => recognizeFile(f, ourCompanies(), withPosted(docs.current), base + i)));
    const done = res.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []));
    if (done.length) { upd(x => { x.docs.unshift(...done); }); go('docs'); }

    const offline = queueOffline ? rec.filter((_, i) => { const r = res[i]; return r.status === 'rejected' && r.reason instanceof OfflineError; }) : [];
    const queued = offline.length > 0 && await enqueue(offline);
    res.forEach(r => { if (r.status === 'rejected' && !(queued && r.reason instanceof OfflineError)) msgs.push(errText(r.reason)); });
    if (queued) msgs.push(`${offline.length} фото поки не надіслано (немає зв’язку або сервер недоступний): вони в черзі на телефоні й підуть автоматично`);

    if (done.length) {
      const check = done.filter(d => d.st === 'check').length;
      msgs.unshift(`Розпізнано ${done.length} ${plural(done.length, 'документ', 'документи', 'документів')}` + (check ? `, ${check} ${plural(check, 'потребує', 'потребують', 'потребують')} перевірки` : ', усі перевірки пройдено'));
    }
    if (openOne && done.length === 1) openSheet({ kind: 'doc', id: done[0].id });
    return [...new Set(msgs)];
  }, [upd, go, snack, openSheet]);
}
