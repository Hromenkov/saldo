// «Пульс» для власника: стан бізнесу на сьогодні, порахований з тих самих документів і банку, що й облік.
// Головне питання власника — наскільки свіжі цифри: облік відстає на дні, а не на місяці.
import type { BankRow, Doc } from '../data';
import { balances, movements } from '../recognize/settlements';
import { audit, kop, type AuditOpts } from './index';

export type Pulse = {
  /** грошовий потік за місяць по банку: надходження, оплати, різниця */
  cashIn: number; cashOut: number;
  /** доходи і витрати з початку місяця за первинними документами, без ПДВ */
  revenue: number; costs: number;
  /** нам винні покупці і ми винні постачальникам */
  theyOwe: number; weOwe: number;
  /** документів за місяць: усього, проведено, чекають */
  docs: number; posted: number; waiting: number;
  /** скільки днів лежить найстаріший непроведений документ (0 — усе проведено) */
  lagDays: number;
  /** проведено, але ще не вивантажено в BAS */
  notInBas: number;
  errors: number; atStake: number;
};

const r2 = (n: number) => kop(n) / 100;
const toDate = (dm: string, y: number) => { const [d, m] = dm.split('.').map(Number); return new Date(y, m - 1, d); };
const COSTS = ['purchase_goods', 'purchase_service', 'payroll'];

/** month — номер місяця 1–12, year — рік. Документи з іншого року (поле y) не враховуються. */
export function pulse(docs: Doc[], bank: BankRow[], month: number, year: number, opts: AuditOpts = {}): Pulse {
  const today = opts.today ?? new Date();
  const inMonth = (dm: string, y?: string) => Number(dm.split('.')[1]) === month && (y ? Number(y) === year : true);
  const mDocs = docs.filter(d => inMonth(d.date, d.y));
  const mBank = bank.filter(b => inMonth(b.d));
  const net = (d: Doc) => d.sum - d.vat;
  const posted = mDocs.filter(d => d.st === 'ok');

  const parties = [...new Map(docs.filter(d => d.kind === 'sale' || d.kind.startsWith('purchase_')).map(d => [d.edrpou || d.cp, { cp: d.cp, edrpou: d.edrpou }])).values()];
  let theyOwe = 0, weOwe = 0;
  for (const p of parties) { const b = balances(movements(p, docs, bank)); theyOwe += b.theyOwe; weOwe += b.weOwe; }

  const waiting = docs.filter(d => d.st !== 'ok');
  const oldest = waiting.reduce<Date | null>((a, d) => { const t = toDate(d.date, Number(d.y) || year); return !a || t < a ? t : a; }, null);
  const a = audit(docs, bank, opts);
  return {
    cashIn: r2(mBank.filter(b => b.s > 0).reduce((s, b) => s + b.s, 0)),
    cashOut: r2(-mBank.filter(b => b.s < 0).reduce((s, b) => s + b.s, 0)),
    revenue: r2(posted.filter(d => d.kind === 'sale').reduce((s, d) => s + net(d), 0)),
    costs: r2(posted.filter(d => COSTS.includes(d.kind)).reduce((s, d) => s + net(d), 0)),
    theyOwe: r2(theyOwe), weOwe: r2(weOwe),
    docs: mDocs.length, posted: posted.length, waiting: mDocs.length - posted.length,
    lagDays: oldest ? Math.max(0, Math.floor((today.getTime() - oldest.getTime()) / 864e5)) : 0,
    notInBas: docs.filter(d => d.st === 'ok' && d.src !== '1С' && (d.kind === 'sale' || d.kind.startsWith('purchase_')) && !d.basAt).length,
    errors: a.errors, atStake: a.atStake
  };
}
