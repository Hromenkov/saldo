import type { ReactNode } from 'react';
import { useApp } from '../store';
import { Ms } from '../lib';

/** Шапка бокової картки: «Назад» до попередньої картки (якщо відкрили з картки), заголовок, «Закрити» */
export function SheetHead({ title }: { title: ReactNode }) {
  const { s, back, closeSheet } = useApp();
  return (
    <div className="sheet-head">
      {s.sheetBack.length > 0 && <button className="icon-btn sl" aria-label="Назад до попередньої картки" title="Назад" onClick={back}><Ms>arrow_back</Ms></button>}
      <h2 className="title-l">{title}</h2>
      <button className="icon-btn sl" aria-label="Закрити" title="Закрити" onClick={closeSheet}><Ms>close</Ms></button>
    </div>
  );
}
