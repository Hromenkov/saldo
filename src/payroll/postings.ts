// Проводки нарахування і платіжки, прив'язані до нарахування.
// Кожна податкова платіжка несе номер нарахування і розбивку по працівниках: так бухгалтер бачить,
// за яке саме нарахування сплачено податок, а звіт 4ДФ знає, скільки перераховано по кожній людині.
import { ACCRUAL_NAMES, dateLong, forMonth, r2, type PayrollRun } from './engine';
import { TAX_INFO, type TaxKind } from './rates';

export type Line = [string, string, number, string];

/** Проводки по нарахуванню. Працівник без затвердженого рахунку витрат проводок не має. */
export function payrollPostings(run: PayrollRun): Line[] {
  const out: Line[] = [];
  for (const r of run.results) {
    if (r.accruals.some(a => !a.account)) continue;
    for (const a of r.accruals) out.push([a.account!, '661', a.amount, `${ACCRUAL_NAMES[a.kind]} · ${r.emp.name}`]);
    if (r.pdfo) out.push(['661', '6411', r.pdfo, `ПДФО 18% · ${r.emp.name}`]);
    if (r.vz) out.push(['661', '642', r.vz, `Військовий збір 5% · ${r.emp.name}`]);
    // ЄСВ розносимо на ті самі рахунки витрат, що й нарахування, пропорційно сумам
    if (r.esv) {
      const by = new Map<string, number>();
      for (const a of r.accruals) by.set(a.account!, (by.get(a.account!) ?? 0) + a.amount);
      const accs = [...by.keys()];
      let left = r.esv;
      accs.forEach((acc, i) => {
        const part = i === accs.length - 1 ? r2(left) : r2(r.esv * by.get(acc)! / r.gross);
        left = r2(left - part);
        out.push([acc, '651', part, `ЄСВ 22%${r.esvTopUp ? ' (з доплатою до мінімального)' : ''} · ${r.emp.name}`]);
      });
    }
  }
  return out;
}

/** Зведення проводок за парою рахунків — як у журналі-ордері. */
export function summarize(lines: Line[]): Line[] {
  const m = new Map<string, Line>();
  for (const [d, k, s] of lines) {
    const key = d + '/' + k, prev = m.get(key);
    if (prev) prev[2] = r2(prev[2] + s); else m.set(key, [d, k, s, '']);
  }
  return [...m.values()];
}

export type Company = { name: string; edrpou: string };

export type PaymentOrder = {
  id: string;
  kind: 'net' | TaxKind;
  /** номер нарахування, яке оплачує платіжка */
  accrualId: string;
  date: string; amount: number;
  recipient: string;
  purpose: string;
  /** стаття руху коштів */
  article: string;
  dt: string; kt: '311';
  /** сума по кожному працівнику: для 4ДФ і для контролю переплати */
  perEmployee: { id: string; amount: number }[];
};

const TAX_KEY: Record<TaxKind, 'pdfo' | 'vz' | 'esv'> = { pdfo: 'pdfo', vz: 'vz', esv: 'esv' };

/** Скільки ще не сплачено по нарахуванню, з урахуванням уже сформованих платіжок. */
export function outstanding(run: PayrollRun, kind: PaymentOrder['kind'], orders: PaymentOrder[]) {
  const paid = new Map<string, number>();
  for (const o of orders) if (o.accrualId === run.id && o.kind === kind) for (const p of o.perEmployee) paid.set(p.id, r2((paid.get(p.id) ?? 0) + p.amount));
  return run.results.map(r => ({ id: r.emp.id, amount: r2((kind === 'net' ? r.net : r[TAX_KEY[kind]]) - (paid.get(r.emp.id) ?? 0)) })).filter(x => x.amount > 0);
}

/**
 * Платіжки на виплату зарплати і податки з неї. Кожна посилається на нарахування.
 * Повторний виклик формує лише те, що ще не оплачено, тож переплати за те саме нарахування не буде.
 * ПДФО і ВЗ сплачуються в день виплати зарплати, ЄСВ — не пізніше 20 числа наступного місяця.
 */
export function paymentOrders(run: PayrollRun, co: Company, date: string, existing: PaymentOrder[] = []): PaymentOrder[] {
  if (!run.canPost) throw new Error(`Нарахування ${run.id} ще не можна провести: ${run.issues[0]}`);
  const out: PaymentOrder[] = [];
  const basis = `нарахування № ${run.id} від ${dateLong(run.date)}`;
  const net = outstanding(run, 'net', existing);
  if (net.length) out.push({
    id: `${run.id}/net/${existing.length + out.length + 1}`, kind: 'net', accrualId: run.id, date, amount: r2(net.reduce((s, x) => s + x.amount, 0)),
    recipient: 'Працівники за зарплатною відомістю (реєстр у банк)',
    purpose: `Заробітна плата ${forMonth(run.month)} згідно з відомістю до ${basis}, ${net.length} осіб. Без ПДВ`,
    article: 'Виплата заробітної плати', dt: '661', kt: '311', perEmployee: net
  });
  for (const kind of ['pdfo', 'vz', 'esv'] as TaxKind[]) {
    const t = TAX_INFO[kind], rest = outstanding(run, kind, existing);
    if (!rest.length) continue;
    const amount = r2(rest.reduce((s, x) => s + x.amount, 0));
    out.push({
      id: `${run.id}/${kind}/${existing.length + out.length + 1}`, kind, accrualId: run.id, date, amount,
      recipient: `ГУ ДПС, бюджетний код ${t.budget}`,
      // формат призначення платежу до бюджету: *;код виду сплати;код платника;призначення;
      purpose: `*;101;${co.edrpou};${t.name} із заробітної плати ${forMonth(run.month)}, ${basis};`,
      article: t.article, dt: t.acc, kt: '311', perEmployee: rest
    });
  }
  return out;
}
