// ПДВ: податкові накладні (ПН) і розрахунки коригування (РК) за правилом першої події,
// строки й статуси реєстрації в ЄРПН, штрафи, ліміт реєстрації в СЕА ПДВ і чернетка декларації.
// Чисті функції без залежностей: файл потрапляє в браузер і в скрипт перевірки (npm test).
// Посилання на статті ПКУ наведено біля кожного правила. Ставки штрафів і рядки декларації
// бухгалтер звіряє з актуальною редакцією перед поданням.

export type Rate = 20 | 7 | 14 | 0;
export const RATES: Rate[] = [20, 7, 14, 0];

/** Копійки: усі суми округлюються до 0,01 */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** ПДВ, що міститься в сумі з ПДВ */
/** Сума для тексту: 12 045,07 */
export const money = (n: number) => r2(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const vatIn = (gross: number, rate: Rate) => rate ? r2(gross * rate / (100 + rate)) : 0;

// ───────────────────────── Перша подія (п. 187.1 ПКУ) ─────────────────────────

/**
 * Подія за договором (або замовленням) з покупцем. Суми з ПДВ.
 * shipment — відвантаження/акт; payment — оплата (аванс або розрахунок за відвантажене);
 * return — повернення товару; refund — повернення коштів покупцю;
 * adjust — зміна ціни вже відвантаженого (+ збільшення, − зменшення).
 */
export type SaleEvent = { date: string; type: 'shipment' | 'payment' | 'return' | 'refund' | 'adjust'; amount: number; doc: string };

/** Договір з покупцем. Ставка одна на договір; buyerIpn = null означає неплатника ПДВ. */
export type SaleContract = {
  id: string; buyer: string; buyerIpn: string | null; contract: string;
  rate: Rate; revenue: '701' | '702' | '703'; events: SaleEvent[];
};

export type TaxDocKind = 'pn' | 'rk';
export type TaxDoc = {
  kind: TaxDocKind;
  /** номер присвоює нумерація підприємства; РК має номер за ПН, до якої складено */
  no: string; date: string; contractId: string; buyer: string; buyerIpn: string | null;
  rate: Rate; base: number; vat: number;
  /** що спричинило: передоплата чи відвантаження (для ПН), повернення/зміна ціни (для РК) */
  cause: SaleEvent['type']; eventDoc: string;
  /** для РК: номер ПН, до якої складено */
  toPn?: string;
  /** тип причини 02 — ПН, складена на неплатника ПДВ (видається з позначкою «Не підлягає наданню отримувачу») */
  reasonCode?: '02';
  /** хто реєструє в ЄРПН: РК на зменшення платнику реєструє покупець (п. 192.1 ПКУ) */
  registrant: 'seller' | 'buyer';
};

/** Проводка: Дт, Кт, сума (від’ємна — сторно), коментар */
export type Line = [string, string, number, string];

export type FirstEventResult = { docs: TaxDoc[]; lines: Line[]; byEvent: { event: SaleEvent; docs: TaxDoc[]; lines: Line[] }[] };

/**
 * Податкове зобов’язання виникає на дату першої події: оплати або відвантаження (п. 187.1).
 * Ведемо накопичено по договору: S — відвантажено, P — оплачено. База ПН = max(S, P).
 * Зростання бази дає ПН (або РК на збільшення, якщо це зміна ціни), зменшення — РК на зменшення.
 * Проводки тримають тотожність: Кт 6412 = Дт 70x (ПДВ відвантаженого) + Дт 643 (ПДВ з авансу, ще не відвантаженого).
 */
export function firstEvent(c: SaleContract, numbering: () => string): FirstEventResult {
  const events = [...c.events].sort((a, b) => a.date.localeCompare(b.date));
  let S = 0, P = 0;
  let vatShipped = 0;      // накопичено Дт 70x Кт 6412/643
  const pns: TaxDoc[] = [];           // для прив’язки РК
  const remaining = new Map<string, number>(); // залишок бази ПН, до якої ще можна скласти РК на зменшення
  const out: FirstEventResult = { docs: [], lines: [], byEvent: [] };

  for (const e of events) {
    const prevBase = Math.max(S, P);
    if (e.type === 'shipment' || e.type === 'return' || e.type === 'adjust') S = r2(S + (e.type === 'return' ? -Math.abs(e.amount) : e.type === 'shipment' ? Math.abs(e.amount) : e.amount));
    else P = r2(P + (e.type === 'refund' ? -Math.abs(e.amount) : Math.abs(e.amount)));
    const delta = r2(Math.max(S, P) - prevBase);
    const docs: TaxDoc[] = [];
    const head = { contractId: c.id, buyer: c.buyer, buyerIpn: c.buyerIpn, rate: c.rate, cause: e.type, eventDoc: e.doc, date: e.date, ...(c.buyerIpn ? {} : { reasonCode: '02' as const }) };

    if (delta > 0 && e.type !== 'adjust') {
      const pn: TaxDoc = { ...head, kind: 'pn', no: numbering(), base: r2(delta - vatIn(delta, c.rate)), vat: vatIn(delta, c.rate), registrant: 'seller' };
      docs.push(pn); pns.push(pn); remaining.set(pn.no, delta);
    } else if (delta > 0) {
      // зміна ціни в бік збільшення: РК на збільшення до останньої ПН за договором
      const to = pns[pns.length - 1];
      docs.push({ ...head, kind: 'rk', no: to ? to.no : numbering(), toPn: to?.no, base: r2(delta - vatIn(delta, c.rate)), vat: vatIn(delta, c.rate), registrant: 'seller' });
      if (to) remaining.set(to.no, r2((remaining.get(to.no) || 0) + delta));
    } else if (delta < 0) {
      // РК на зменшення розподіляємо з останньої ПН назад (LIFO), доки не покриємо зменшення
      let left = -delta;
      for (let i = pns.length - 1; i >= 0 && left > 0.001; i--) {
        const rem = remaining.get(pns[i].no) || 0; if (rem <= 0) continue;
        const part = r2(Math.min(rem, left)); left = r2(left - part); remaining.set(pns[i].no, r2(rem - part));
        docs.push({ ...head, kind: 'rk', no: pns[i].no, toPn: pns[i].no, base: -r2(part - vatIn(part, c.rate)), vat: -vatIn(part, c.rate), registrant: c.buyerIpn ? 'buyer' : 'seller' });
      }
    }

    // проводки ПДВ за подією
    const d6412 = r2(docs.reduce((s, d) => s + d.vat, 0));
    const newShipped = vatIn(S, c.rate);
    const d702 = r2(newShipped - vatShipped);
    const d643 = r2(d6412 - d702);
    // z — частина ПДВ відвантаження, покрита авансом (Дт 70x Кт 643)
    let z = 0;
    if (d702 > 0 && d643 < 0) z = Math.min(d702, -d643);
    else if (d702 < 0 && d643 > 0) z = -Math.min(-d702, d643);
    const x = r2(d702 - z), y = r2(d643 + z);
    const L: Line[] = [];
    const acc = c.revenue;
    if (x) L.push([acc, '6412', x, x > 0 ? 'ПДВ зобов’язання: перша подія — відвантаження' : 'Сторно ПДВ зобов’язання (РК)']);
    if (y) L.push(['643', '6412', y, y > 0 ? 'ПДВ зобов’язання: перша подія — передоплата' : 'Сторно ПДВ з авансу (РК)']);
    if (z) L.push([acc, '643', r2(z), z > 0 ? 'Відвантаження в рахунок авансу: ПДВ з авансу закрито' : 'Повернення товару: ПДВ знову як з авансу']);
    vatShipped = newShipped;
    out.docs.push(...docs); out.lines.push(...L); out.byEvent.push({ event: e, docs, lines: L });
  }
  return out;
}

// ───────────────────────── ЄРПН: статуси і строки ─────────────────────────

/**
 * draft — складено; sent — надіслано, чекаємо квитанцію; registered — зареєстровано;
 * blocked — реєстрацію зупинено (СМКОР); explained — подано пояснення і копії документів;
 * rejected — відмовлено в реєстрації (можна оскаржити); cancelled — скасовано до реєстрації.
 */
export type ErpnStatus = 'draft' | 'sent' | 'registered' | 'blocked' | 'explained' | 'rejected' | 'cancelled';
export const ERPN_LABEL: Record<ErpnStatus, string> = {
  draft: 'Складено', sent: 'Надіслано в ЄРПН', registered: 'Зареєстровано', blocked: 'Реєстрацію зупинено',
  explained: 'Пояснення подано', rejected: 'Відмовлено в реєстрації', cancelled: 'Скасовано'
};
/** Допустимі переходи статусу (відповідь ДПС або дія бухгалтера) */
export const ERPN_NEXT: Record<ErpnStatus, ErpnStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['registered', 'blocked'],
  blocked: ['explained'],
  explained: ['registered', 'rejected'],
  rejected: ['registered'],      // після рішення комісії ДПС або суду
  registered: [], cancelled: []
};
export const canMove = (from: ErpnStatus, to: ErpnStatus) => ERPN_NEXT[from].includes(to);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => new Date(s + 'T00:00:00Z');
export const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

/**
 * Граничний строк реєстрації (п. 201.10 ПКУ): ПН/РК, складені з 1 по 15 число, — до останнього дня
 * цього місяця; з 16 по останній — до 15 числа наступного. РК на зменшення, яку реєструє покупець
 * (п. 192.1), — 15 календарних днів від дати складання (обережна оцінка: беремо ранішу дату).
 */
export function registrationDeadline(doc: Pick<TaxDoc, 'date' | 'kind' | 'registrant'>): string {
  const d = parse(doc.date);
  if (doc.kind === 'rk' && doc.registrant === 'buyer') return addDays(doc.date, 15);
  if (d.getUTCDate() <= 15) return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15)));
}
/** Після 1095 днів від дати складання зареєструвати вже не можна (п. 201.10) */
export const lastPossibleDate = (date: string) => addDays(date, 1095);

/**
 * Штраф за несвоєчасну реєстрацію (п. 120-1.1 ПКУ), % від суми ПДВ у документі.
 * Під час воєнного стану діють знижені ставки (п. 90 підрозд. 2 розд. XX ПКУ).
 * Не застосовується до ПН з нульовою ставкою і звільнених операцій.
 */
export const PENALTY: { upTo: number; normal: number; wartime: number }[] = [
  { upTo: 15, normal: 10, wartime: 2 },
  { upTo: 30, normal: 20, wartime: 5 },
  { upTo: 60, normal: 30, wartime: 10 },
  { upTo: 365, normal: 40, wartime: 15 },
  { upTo: Infinity, normal: 50, wartime: 25 }
];
export function penalty(doc: Pick<TaxDoc, 'date' | 'kind' | 'registrant' | 'vat' | 'rate'>, registeredOn: string, wartime = true) {
  const late = daysBetween(registrationDeadline(doc), registeredOn);
  if (late <= 0 || !doc.rate) return { late: Math.max(0, late), pct: 0, sum: 0 };
  const row = PENALTY.find(p => late <= p.upTo)!;
  const pct = wartime ? row.wartime : row.normal;
  return { late, pct, sum: r2(Math.abs(doc.vat) * pct / 100) };
}

/** Стан реєстрації для списку: скільки днів лишилось або прострочено на дату today */
export function deadlineState(doc: TaxDoc & { status: ErpnStatus }, today: string) {
  const due = registrationDeadline(doc);
  const left = daysBetween(today, due);
  const done = doc.status === 'registered' || doc.status === 'cancelled';
  return { due, left, overdue: !done && left < 0, soon: !done && left >= 0 && left <= 3 };
}

// ───────────────────────── Вхідні ПН і проводки ─────────────────────────

export type InboundPn = { no: string; date: string; seller: string; sellerIpn: string; rate: Rate; base: number; vat: number; status: ErpnStatus; kind?: TaxDocKind; doc?: string };

/** ПК підтверджується лише зареєстрованою ПН: Дт 6442 Кт 6441. Зупинена ПН лишається на 6441. */
export function inboundLines(pn: InboundPn): Line[] {
  if (pn.status !== 'registered' || !pn.vat) return [];
  return pn.vat > 0 ? [['6442', '6441', pn.vat, `Податковий кредит підтверджено ПН № ${pn.no}`]] : [['6442', '6441', pn.vat, `Сторно ПК за РК до ПН № ${pn.no}`]];
}
/** У декларації: Дт 6412 Кт 6442 на суму підтвердженого ПК */
export const declarationLines = (credit: number): Line[] => credit ? [['6412', '6442', r2(credit), 'Податковий кредит включено до декларації']] : [];

// ───────────────────────── СЕА ПДВ (ст. 200-1 ПКУ) ─────────────────────────

/**
 * Ліміт реєстрації (п. 200-1.3): ΣНакл = ΣНаклОтр + ΣМитн + ΣПопРах + ΣОвердрафт − ΣНаклВид − ΣВідшкод − ΣПеревищ.
 * received — ПДВ за отриманими зареєстрованими ПН/РК; customs — ПДВ, сплачений на митниці;
 * topUps — поповнення електронного рахунку (311 → 315); overdraft — середньомісячний задекларований і сплачений ПДВ за 12 міс.;
 * issued — ПДВ за виданими зареєстрованими ПН/РК; refundClaimed — заявлене бюджетне відшкодування;
 * excess — перевищення зобов’язань у декларації над ПДВ у виданих ПН.
 */
export type SeaInput = { received: number; customs: number; topUps: number; overdraft: number; issued: number; refundClaimed: number; excess: number };
export const seaLimit = (x: SeaInput) => r2(x.received + x.customs + x.topUps + x.overdraft - x.issued - x.refundClaimed - x.excess);
/** Скільки треба поповнити електронний рахунок, щоб зареєструвати ці ПН (лише ПН на збільшення зобов’язань) */
export const topUpNeeded = (limit: number, pendingVat: number) => r2(Math.max(0, pendingVat - limit));

/**
 * Електронний рахунок ПДВ ведемо на субрахунку 315:
 * поповнення Дт 315 Кт 311, списання до бюджету Дт 6412 Кт 315, повернення надлишку Дт 311 Кт 315.
 * Напряму з поточного рахунку ПДВ не сплачується (п. 200-1.3, 200-1.9).
 */
export const seaLines = (topUp: number, toBudget: number, back = 0): Line[] => [
  ...(topUp ? [['315', '311', r2(topUp), 'Поповнення електронного рахунку ПДВ']] as Line[] : []),
  ...(toBudget ? [['6412', '315', r2(toBudget), 'Списання ПДВ з електронного рахунку до бюджету']] as Line[] : []),
  ...(back ? [['311', '315', r2(back), 'Повернення надлишку з електронного рахунку ПДВ']] as Line[] : [])
];

// ───────────────────────── Чернетка декларації з ПДВ ─────────────────────────

export type DeclRow = { row: string; t: string; base?: number; vat: number };
/**
 * Основні рядки декларації з ПДВ (наказ МФУ № 21, рядки 1–21). Зобов’язання — за датою першої події незалежно від реєстрації;
 * ПК — лише за зареєстрованими вхідними ПН (п. 198.6); РК на зменшення зобов’язань — у ряд. 7 лише зареєстровані.
 */
export function declarationDraft(p: { issued: (TaxDoc & { status: ErpnStatus })[]; received: InboundPn[]; carry: number; period: string }): { rows: DeclRow[]; toPay: number; negative: number; notes: string[] } {
  const inPer = (d: string) => d.startsWith(p.period);
  const iss = p.issued.filter(d => inPer(d.date) && d.status !== 'cancelled');
  const sum = (a: { base?: number; vat: number }[], k: 'base' | 'vat') => r2(a.reduce((s, x) => s + (x[k] || 0), 0));
  const pnAt = (r: Rate) => iss.filter(d => d.kind === 'pn' && d.rate === r);
  const rk = iss.filter(d => d.kind === 'rk' && (d.vat > 0 || d.status === 'registered'));
  const rec = p.received.filter(d => inPer(d.date) && d.status === 'registered');
  const recAt = (r: Rate) => rec.filter(d => d.kind !== 'rk' && d.rate === r);
  const recRk = rec.filter(d => d.kind === 'rk');
  const rows: DeclRow[] = [
    { row: '1.1', t: 'Операції за основною ставкою 20%', base: sum(pnAt(20), 'base'), vat: sum(pnAt(20), 'vat') },
    { row: '1.2', t: 'Операції за ставкою 7%', base: sum(pnAt(7), 'base'), vat: sum(pnAt(7), 'vat') },
    { row: '1.3', t: 'Операції за ставкою 14%', base: sum(pnAt(14), 'base'), vat: sum(pnAt(14), 'vat') },
    { row: '3', t: 'Операції за нульовою ставкою', base: sum(pnAt(0), 'base'), vat: 0 },
    { row: '7', t: 'Коригування податкових зобов’язань (РК, ст. 192)', base: sum(rk, 'base'), vat: sum(rk, 'vat') }
  ];
  const r9 = r2(rows.reduce((s, r) => s + r.vat, 0));
  rows.push({ row: '9', t: 'Усього податкових зобов’язань', vat: r9 });
  const credit = [
    { row: '10.1', t: 'Придбання з ПДВ за ставкою 20%', base: sum(recAt(20), 'base'), vat: sum(recAt(20), 'vat') },
    { row: '10.2', t: 'Придбання з ПДВ за ставкою 7%', base: sum(recAt(7), 'base'), vat: sum(recAt(7), 'vat') },
    { row: '10.3', t: 'Придбання з ПДВ за ставкою 14%', base: sum(recAt(14), 'base'), vat: sum(recAt(14), 'vat') },
    { row: '14', t: 'Коригування податкового кредиту (РК, ст. 192)', base: sum(recRk, 'base'), vat: sum(recRk, 'vat') },
    { row: '16.1', t: 'Від’ємне значення попереднього періоду', vat: r2(p.carry) }
  ];
  rows.push(...credit);
  const r17 = r2(credit.reduce((s, r) => s + r.vat, 0));
  rows.push({ row: '17', t: 'Усього податковий кредит', vat: r17 });
  const toPay = r2(Math.max(0, r9 - r17)), negative = r2(Math.max(0, r17 - r9));
  rows.push({ row: '18', t: 'Сума ПДВ до сплати', vat: toPay });
  rows.push({ row: '19', t: 'Від’ємне значення', vat: negative });
  rows.push({ row: '21', t: 'Від’ємне значення до ряд. 16.1 наступного періоду', vat: negative });
  const notes: string[] = [];
  const pendIn = p.received.filter(d => inPer(d.date) && d.status !== 'registered' && d.status !== 'cancelled');
  if (pendIn.length) notes.push(`Вхідні ПН без реєстрації (${pendIn.length}) не враховано, ПДВ ${money(sum(pendIn, 'vat'))} ₴: кредит з’явиться після їх реєстрації (п. 198.6)`);
  const pendRk = iss.filter(d => d.kind === 'rk' && d.vat < 0 && d.status !== 'registered');
  if (pendRk.length) notes.push(`РК на зменшення ще не зареєстровані покупцем: ${pendRk.map(d => '№ ' + d.no).join(', ')}. До ряд. 7 потраплять після реєстрації`);
  const unreg = iss.filter(d => d.kind === 'pn' && d.status !== 'registered');
  if (unreg.length) notes.push(`Видані ПН без реєстрації (${unreg.length}) враховано в зобов’язаннях за датою першої події: зареєструйте до строку`);
  return { rows, toPay, negative, notes };
}

// ───────────────────────── Дані для XML (M.E.Doc / Електронний кабінет) ─────────────────────────

/**
 * Поля ПН і РК так, як їх вимагає форма (наказ МФУ № 1307). Коди форм: ПН — J12010xx, РК (додаток 2) — J12012xx;
 * версію (xx) і назви тегів беремо з чинної XSD ДПС на момент експорту, тут — лише дані.
 */
export type TaxDocRow = { name: string; uktzed?: string; dkpp?: string; unit: string; unitCode: string; qty: number; price: number; rateCode: '20' | '7' | '14' | '901' | '902' | '903'; base: number; vat: number };
export type TaxDocXml = {
  form: 'J12010' | 'J12012';
  no: string; date: string; reasonCode?: string;
  seller: { name: string; ipn: string; edrpou?: string };
  buyer: { name: string; ipn: string };
  contract?: string;
  rows: TaxDocRow[];
  totals: { base: number; vat20: number; vat7: number; vat14: number; total: number };
  /** для РК */
  pnNo?: string; pnDate?: string;
};
/** Неплатнику в ПН ставиться умовний ІПН 100000000000 (п. 16 Порядку заповнення ПН) */
export const NON_PAYER_IPN = '100000000000';
export function toXmlData(doc: TaxDoc, seller: TaxDocXml['seller'], rows: TaxDocRow[], pn?: TaxDoc): TaxDocXml {
  const v = (r: Rate) => doc.rate === r ? doc.vat : 0;
  return {
    form: doc.kind === 'pn' ? 'J12010' : 'J12012', no: doc.no, date: doc.date, reasonCode: doc.reasonCode,
    seller, buyer: { name: doc.buyerIpn ? doc.buyer : 'Неплатник', ipn: doc.buyerIpn || NON_PAYER_IPN }, contract: doc.contractId, rows,
    totals: { base: doc.base, vat20: v(20), vat7: v(7), vat14: v(14), total: r2(doc.base + doc.vat) },
    ...(doc.kind === 'rk' && pn ? { pnNo: pn.no, pnDate: pn.date } : {})
  };
}
