// Звірка результату розпізнавання з еталоном tests/fixtures/*.json. Спільна для npm run eval і порівняння моделей.
const near = (a: any, b: number) => typeof a === 'number' && Math.abs(a - b) < 0.01;
const dig = (s: any) => String(s ?? '').replace(/\D/g, '');

/** Повертає список перевірених полів і ті, що не збіглися (з прочитаним значенням). */
export function score(e: any, r: any): { checked: number; fails: string[] } {
  const fails: string[] = [];
  let checked = 0;
  const t = (ok: boolean, msg: string) => { checked++; if (!ok) fails.push(msg); };
  if (e.kind) t(r.kind === e.kind, `kind ${r.kind}`);
  if (e.number) t(dig(r.number) === e.number, `номер ${r.number}`);
  if (e.date) t(r.date === e.date, `дата ${r.date}`);
  if (e.counterparty_name_has) t((r.counterparty?.name || '').includes(e.counterparty_name_has), `контрагент ${r.counterparty?.name}`);
  if (e.edrpou) t(dig(r.counterparty?.edrpou) === e.edrpou, `код ${r.counterparty?.edrpou}`);
  for (const k of ['net', 'vat', 'total'] as const) if (e[k] != null) t(near(r[k], e[k]), `${k} ${r[k]}`);
  if (e.margin_notes_has) t(dig(r.margin_notes).includes(e.margin_notes_has), `приписка ${r.margin_notes}`);
  for (const w of e.margin_notes_words || []) t((r.margin_notes || '').toLowerCase().includes(w.toLowerCase()), `приписка без «${w}»`);
  if (e.items) t((r.items || []).length === e.items.length, `рядків ${(r.items || []).length}`);
  (e.items || []).forEach((it: any, i: number) => {
    const g = r.items?.[i] || {};
    if (it.name_has) t((g.name || '').toLowerCase().includes(it.name_has.toLowerCase()), `рядок ${i + 1} назва ${g.name}`);
    for (const k of ['qty', 'price', 'amount']) if (it[k] != null) t(near(g[k], it[k]), `рядок ${i + 1} ${k} ${g[k]}`);
  });
  // пастка з помилкою на самому документі: модель має позначити суму сумнівною
  if (e.flag_any) t((r.uncertain || []).some((u: string) => e.flag_any.includes(u)), `не позначено розбіжність сум (uncertain: ${(r.uncertain || []).join(', ') || 'порожньо'})`);
  return { checked, fails };
}
