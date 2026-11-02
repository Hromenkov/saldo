import { fmt } from './lib';

/* Помічник: власник пише як є, система веде облік */

export type ActKind = 'chip' | 'btn-text' | 'btn-tonal' | 'btn-filled';
export type Body =
  | { t: 'text'; text: string }
  | { t: 'greeting' }
  | { t: 'receiptPhoto' }
  | { t: 'invoice' }
  | { t: 'voice'; dur: string; text: string }
  | { t: 'upload'; url?: string; name: string }
  | { t: 'check' }
  | { t: 'typing' };
export type Msg = { id: number; who: 'sys' | 'me'; time: string; body: Body; acts?: [string, ActKind][]; done?: boolean };

let msgId = 0;
export const sys = (body: Body, time: string, acts?: Msg['acts']): Msg => ({ who: 'sys', id: ++msgId, body, time, acts });
export const me = (body: Body, time: string): Msg => ({ who: 'me', id: ++msgId, body, time });
export const text = (t: string): Body => ({ t: 'text', text: t });

export const INITIAL_CHAT = (): Msg[] => [
  sys({ t: 'greeting' }, '08:30'),
  me({ t: 'receiptPhoto' }, '09:12'),
  sys({ t: 'invoice' }, '09:12', [['Скасувати', 'btn-text']]),
  me({ t: 'voice', dur: '0:06', text: 'Купив стаканчики в Епіцентрі на тисячу двісті готівкою з каси на Подолі' }, '10:40'),
  sys(text('Записав витрату 1 200,00 ₴ з каси «Поділ», стаття «Упаковка». Чек є?'), '10:40', [['Надішлю фото', 'chip'], ['Без чека', 'chip']]),
  sys(text('Енергозбут виставив рахунок на 9 870,40 ₴. Це електроенергія для складу чи для офісу?'), '11:05', [['Склад', 'chip'], ['Офіс', 'chip']]),
  sys(text('Декларація з ПДВ за жовтень готова: до сплати 22 400 ₴. Подати треба до 20.11.'), '11:30', [['Підписати в Дії', 'btn-filled'], ['Подивитись', 'btn-text']])
];

export const REPLIES: Record<string, string> = {
  'Скасувати': 'Скасував. Накладну не проведено, фото залишилось в архіві.',
  'Надішлю фото': 'Чекаю. Просто сфотографуйте чек і надішліть сюди.',
  'Без чека': 'Добре. В управлінці витрату враховано. Для бухгалтерії без документа вона не піде у витрати, я позначив її окремо.',
  'Склад': 'Провів як витрати на збут (рах. 93). Наступні рахунки Енергозбуту проводитиму так само, питати більше не буду.',
  'Офіс': 'Провів як адміністративні витрати (рах. 92). Наступні рахунки Енергозбуту проводитиму так само, питати більше не буду.',
  'Підписати в Дії': 'Надіслав запит на підпис у Дію. Підтвердіть у застосунку, і я подам декларацію.'
};

export function understand(input: string): string {
  const n = (input.match(/\d[\d\s]*(?:[.,]\d+)?/) || [''])[0].replace(/\s/g, '');
  const sum = n ? Number(n.replace(',', '.')) * (/тисяч|тис\b|к\b/i.test(input) && Number(n) < 1000 ? 1000 : 1) : 0;
  const t = input.toLowerCase();
  if (/скільки|який|яка|покажи/.test(t)) return 'За листопад: виручка 612 400 ₴, операційний прибуток 84 300 ₴, маржа 13,8%. Найприбутковіша точка «Поділ».';
  if (/оренд/.test(t)) return `Знайшов у виписці ПриватБанку платіж ${sum ? fmt(sum) : '28 000,00'} ₴ орендодавцю. Провів як оренду точки «Поділ». Акт ще не надійшов, попрошу його через Вчасно.`;
  if (/зарплат|аванс/.test(t)) return `Записав виплату ${sum ? fmt(sum) + ' ₴ ' : ''}як аванс по зарплаті. ПДФО і військовий збір нарахую при остаточному розрахунку.`;
  if (sum) return `Записав витрату ${fmt(sum)} ₴. Стаття «Інші витрати». Якщо це щось конкретне, напишіть як є, і я виправлю.`;
  return 'Зрозумів, записав як нотатку до сьогоднішнього дня. Якщо це витрата чи надходження, напишіть суму.';
}

function ReceiptSvg() {
  return (
    <svg viewBox="0 0 180 220" aria-hidden="true">
      <rect width="180" height="220" fill="#F4F1EA" />
      <path d="M30 14h120v190l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6z" fill="#fff" stroke="#DDD" />
      <rect x="44" y="30" width="70" height="7" rx="3" fill="#333" /><rect x="44" y="46" width="92" height="4" rx="2" fill="#BBB" /><rect x="44" y="56" width="60" height="4" rx="2" fill="#BBB" />
      {[80, 96, 112, 128].map(y => <g key={y}><rect x="44" y={y} width="58" height="4" rx="2" fill="#999" /><rect x="116" y={y} width="20" height="4" rx="2" fill="#999" /></g>)}
      <rect x="44" y="152" width="92" height="1" fill="#999" /><rect x="44" y="162" width="40" height="7" rx="3" fill="#333" /><rect x="104" y="162" width="32" height="7" rx="3" fill="#333" />
    </svg>
  );
}

const Wave = ({ n }: { n: number }) => (
  <span className="wave">{Array.from({ length: n }, (_, i) => <i key={i} style={{ height: 6 + Math.round(Math.abs(Math.sin(i * 1.7) * 18)) }} />)}</span>
);

export function MsgBody({ body }: { body: Body }) {
  switch (body.t) {
    case 'text': return <>{body.text}</>;
    case 'typing': return <span className="typing"><i /><i /><i /></span>;
    case 'greeting': return <>Доброго ранку, Андрію. Учора, 17 листопада:
      <div className="stats3"><div><b>18 420 ₴</b><span>виручка</span></div><div><b>30,8%</b><span>food cost</span></div><div><b>477 270 ₴</b><span>усі гроші</span></div></div>
      <span>Решту я провів сам: 34 чеки з кас, 6 платежів з банку, 2 накладні з Вчасно.</span></>;
    case 'receiptPhoto': return <div className="photo"><ReceiptSvg /></div>;
    case 'invoice': return <>Розпізнав накладну:
      <div className="mini"><div className="row"><span>ТОВ «Молочар» · №5521</span><b>3 240,00 ₴</b></div><div className="row muted"><span>Молоко 3,2% — 40 л</span><span>2 560,00</span></div><div className="row muted"><span>Вершки 33% — 6 л</span><span>680,00</span></div></div>
      <span>Оприбуткував на склад точки «Поділ». Оплата через 7 днів, нагадаю.</span></>;
    case 'voice': return <><div className="voice"><span className="play"><span className="ms fill">play_arrow</span></span><Wave n={28} /><span className="body-s">{body.dur}</span></div><div className="transcript">«{body.text}»</div></>;
    case 'upload': return <div className="photo">{body.url
      ? <img src={body.url} alt="Фото документа" />
      : <div style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center' }}><span className="ms">picture_as_pdf</span>{body.name}</div>}</div>;
    case 'check': return <>Розпізнав чек:
      <div className="mini"><div className="row"><span>Епіцентр К · касовий чек</span><b>1 200,00 ₴</b></div><div className="row muted"><span>Стаканчики паперові 250 мл — 500 шт</span><span>1 200,00</span></div></div>
      <span>Прикріпив до витрати з каси «Поділ». Тепер вона піде і в бухгалтерію.</span></>;
  }
}
