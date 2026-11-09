// Черга фото без зв’язку: на складі часто немає мережі. Фото лежить в IndexedDB телефона,
// доки не з’явиться зв’язок, і тоді йде на розпізнавання. Переживає закриття застосунку.
import { useSyncExternalStore } from 'react';

export type Queued = { id: number; name: string; type: string; blob: Blob; at: number };

const DB = 'saldo-mobile', STORE = 'photos';
let count = 0;
const subs = new Set<() => void>();
const emit = (n: number) => { count = n; subs.forEach(f => f()); };

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((res, rej) => {
      const t = db.transaction(STORE, mode); const r = f(t.objectStore(STORE));
      t.oncomplete = () => res(r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  } finally { db.close(); }
}

const has = () => typeof indexedDB !== 'undefined';

export async function refreshCount() {
  if (!has()) return 0;
  try { const n = await tx('readonly', s => s.count()); emit(n); return n; } catch { return 0; }
}

/** Покласти фото в чергу. Повертає false, якщо сховище недоступне (приватний режим) */
export async function enqueue(files: File[]): Promise<boolean> {
  if (!has()) return false;
  try {
    let id = Date.now();
    for (const f of files) await tx('readwrite', s => s.put({ id: id++, name: f.name, type: f.type, blob: f, at: Date.now() } satisfies Queued));
    await refreshCount();
    return true;
  } catch { return false; }
}

export async function listQueued(): Promise<Queued[]> {
  if (!has()) return [];
  try { return await tx('readonly', s => s.getAll() as IDBRequest<Queued[]>); } catch { return []; }
}

export async function dropQueued(ids: number[]) {
  for (const id of ids) await tx('readwrite', s => s.delete(id)).catch(() => undefined);
  await refreshCount();
}

export const toFile = (q: Queued) => new File([q.blob], q.name, { type: q.type || 'image/jpeg' });

/** Скільки фото чекає на зв’язок: для значка на кнопці камери */
export const useQueued = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => count, () => 0);
