// Демо-дані ПДВ за листопад 2026. Коли з’явиться бекенд, їх замінять договори, виписки й квитанції ЄРПН.
import { firstEvent, type ErpnStatus, type InboundPn, type SaleContract, type SeaInput, type TaxDoc } from './rules';

export const VAT_TODAY = '2026-11-17';
export const VAT_PERIOD = '2026-11';

export const CONTRACTS: SaleContract[] = [
  { id: 'Договір поставки № 14/26', buyer: 'ТОВ «Агроресурс»', buyerIpn: '412345678901', contract: '14/26', rate: 20, revenue: '702',
    events: [{ date: '2026-11-03', type: 'shipment', amount: 48600, doc: 'Видаткова накладна № 418' }, { date: '2026-11-03', type: 'payment', amount: 48600, doc: 'Виписка ПриватБанк' }] },
  { id: 'Договір № 7-К, замовлення 112', buyer: 'ТОВ «Смак Поділля»', buyerIpn: '398765432109', contract: '7-К', rate: 20, revenue: '702',
    events: [
      { date: '2026-11-05', type: 'payment', amount: 36000, doc: 'Передоплата за рахунком № 112' },
      { date: '2026-11-12', type: 'shipment', amount: 24000, doc: 'Видаткова накладна № 425' },
      { date: '2026-11-16', type: 'refund', amount: 6000, doc: 'Повернення частини авансу' }
    ] },
  { id: 'Договір № 3/26 на обслуговування', buyer: 'ФОП Мельник С. В.', buyerIpn: null, contract: '3/26', rate: 20, revenue: '703',
    events: [{ date: '2026-11-14', type: 'shipment', amount: 7200, doc: 'Акт наданих послуг № 31' }] }
];

/** Статуси реєстрації за номером ПН (у демо приходять з квитанцій ЄРПН) */
const STATUS: Record<string, ErpnStatus> = { '152': 'registered', '153': 'registered', '154': 'sent' };

let seq = 151;
export type IssuedDoc = TaxDoc & { status: ErpnStatus };
export const ISSUED: IssuedDoc[] = CONTRACTS.flatMap(c => firstEvent(c, () => String(++seq)).docs)
  .map(d => ({ ...d, status: d.kind === 'rk' ? 'draft' : STATUS[d.no] || 'draft' }));

export const RECEIVED: InboundPn[] = [
  { no: '96', date: '2026-11-14', seller: 'ТОВ «Логістик-Захід»', sellerIpn: '387654321098', rate: 20, base: 26041.67, vat: 5208.33, status: 'registered', doc: 'Акт наданих послуг № 1532' },
  { no: '2291', date: '2026-11-10', seller: 'ПрАТ «Енергозбут»', sellerIpn: '300123456789', rate: 20, base: 8225.33, vat: 1645.07, status: 'sent', doc: 'Акт № 2291' },
  { no: '508', date: '2026-11-06', seller: 'ТОВ «Зерно Трейд»', sellerIpn: '401112223334', rate: 20, base: 52000, vat: 10400, status: 'blocked', doc: 'Видаткова накладна № 508' },
  { no: '77', date: '2026-11-02', seller: 'ТОВ «Пакпром»', sellerIpn: '405556667778', rate: 20, base: 9000, vat: 1800, status: 'registered', doc: 'Видаткова накладна № 77' }
];

export const SEA: SeaInput & { balance: number } = {
  received: 41250, customs: 0, topUps: 12000, overdraft: 6800, issued: 38900, refundClaimed: 0, excess: 0,
  /** залишок коштів на електронному рахунку (субрахунок 315) */
  balance: 3400
};
