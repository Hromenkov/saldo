import { useEffect, useRef, useState, type ReactNode } from 'react';
import { produce } from 'immer';
import {
  ADD_DEFAULT, ALIAS, BIZ, CHANNELS, CONN, FORMS, OB_DEFAULT, ONB_STEPS, OPTS,
  type CountKey, type FieldKey, type ListKey, type MultiKey, type Onboarding as Ob, type SingleKey, type ToggleKey
} from '../data';
import { useApp } from '../store';
import { Ms, plural } from '../lib';

const LAST = ONB_STEPS.length - 1;

const Sec = ({ t, s, children }: { t: string; s: string; children: ReactNode }) =>
  <section className="conn-group"><div className="conn-head"><span className="title-m">{t}</span><span className="body-s muted">{s}</span></div>{children}</section>;

const Lead = ({ ic }: { ic: string }) => <span className="lead"><Ms>{ic}</Ms></span>;
const Txt = ({ t, s, children }: { t: string; s?: string; children?: ReactNode }) =>
  <span className="txt"><div className="title-m">{t}</div>{s && <div className="body-s muted">{s}</div>}{children}</span>;

export function Onboarding() {
  const { s, upd, go, snack } = useApp();
  const [ob, setOb] = useState<Ob>(() => structuredClone(OB_DEFAULT));
  const [step, setStep] = useState(0);
  const [q, setQ] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const set = (f: (d: Ob) => void) => setOb(p => produce(p, f));

  useEffect(() => { if (s.onbOpen) { setStep(0); setQ(''); } }, [s.onbOpen]);
  useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [step]);

  const b = BIZ.find(x => x.k === ob.type)!, f = FORMS.find(x => x.k === ob.form)!;
  const close = () => upd(d => { d.onbOpen = false; });
  const finish = () => {
    upd(d => { d.biz = { b, f }; d.onbOpen = false; });
    try { sessionStorage.setItem('saldo-onb', '1'); } catch { /* приватний режим */ }
    go(s.role === 'owner' ? 'overview' : 'ops');
    snack(`Облік налаштовано: ${b.t.toLowerCase()}, ${b.ops} типових операцій`);
  };
  const next = () => step === LAST ? finish() : setStep(step + 1);

  /* будівельні блоки кроків */
  const listEd = (key: ListKey, ic: string, add: string) => (
    <div className="set-list">
      {ob[key].map((x, i) => (
        <div className="set-row" key={i}><Lead ic={ic} /><Txt t={x.n} s={x.m} />
          {x.main ? <span className="status st-new">Основна</span>
            : <button className="icon-btn sl" aria-label="Видалити" onClick={() => set(d => { d[key].splice(i, 1); })}><Ms>delete</Ms></button>}
        </div>
      ))}
      <div className="set-row opt-row" style={{ minHeight: 56, alignItems: 'center' }}>
        <button className="btn btn-text sl" onClick={() => set(d => { const [n, m] = ADD_DEFAULT[key]; const k = d[key].length + 1; d[key].push({ n: n + (k > 1 ? ' ' + k : ''), m }); })}><Ms>add</Ms>{add}</button>
      </div>
    </div>
  );
  const multi = (key: MultiKey, opts: string[]) => (
    <div className="chips">{opts.map(o => { const on = ob[key].includes(o); return (
      <button key={o} className="chip sl" aria-pressed={on} onClick={() => set(d => { d[key] = on ? d[key].filter(x => x !== o) : [...d[key], o]; })}>{on && <Ms>check</Ms>}{o}</button>
    ); })}</div>
  );
  const single = (key: SingleKey, opts: string[]) => (
    <div className="chips" role="radiogroup">{opts.map(o => { const on = ob[key] === o; return (
      <button key={o} className="chip sl" role="radio" aria-checked={on} aria-pressed={on} onClick={() => set(d => { d[key] = o; })}>{on && <Ms>check</Ms>}{o}</button>
    ); })}</div>
  );
  const cnt = (key: CountKey, ic: string, t: string, sub: string) => (
    <div className="set-row"><Lead ic={ic} /><Txt t={t} s={sub} />
      <span className="stepper">
        <button aria-label="Менше" onClick={() => set(d => { d[key] = Math.max(0, d[key] - 1); })}><Ms>remove</Ms></button>
        <span>{ob[key]}</span>
        <button aria-label="Більше" onClick={() => set(d => { d[key] = Math.min(999, d[key] + 1); })}><Ms>add</Ms></button>
      </span></div>
  );
  const tog = (key: ToggleKey, ic: string, t: string, sub: string) => (
    <div className="set-row"><Lead ic={ic} /><Txt t={t} s={sub} />
      <label className="switch"><input type="checkbox" checked={ob[key]} aria-label={t} onChange={e => { const v = e.target.checked; set(d => { d[key] = v; }); }} /><span className="track" /><span className="thumb" /></label></div>
  );
  const optRow = (ic: string, t: string, sub: string, inner: ReactNode) => (
    <div className="set-row opt-row"><Lead ic={ic} /><Txt t={t} s={sub}><div style={{ marginTop: 10 }}>{inner}</div></Txt></div>
  );
  const field = (key: FieldKey, label: string, ic?: string) => (
    <div className="tf" style={{ '--tf-bg': 'var(--md-surface-container-lowest)' } as React.CSSProperties}>
      <input id={'fld-' + key} placeholder=" " value={ob[key]} onChange={e => { const v = e.target.value; set(d => { d[key] = v; }); }} />
      <label htmlFor={'fld-' + key}>{label}</label>{ic && <Ms className="trail-ic">{ic}</Ms>}
    </div>
  );
  const head = (h: string, p: string) => (
    <div><div className="label-m onb-step">{ONB_STEPS[step].toUpperCase()}</div><h1 className="headline-m" style={{ margin: '8px 0 6px' }}>{h}</h1><p className="body-m muted" style={{ margin: 0, maxWidth: 640 }}>{p}</p></div>
  );

  let html: ReactNode = null;
  if (step === 0) {
    html = <>{head('Чим займається ваш бізнес?', 'Від цього залежать документи, типові операції, склад і управлінські звіти. Усе буде налаштовано заздалегідь.')}
      <div className="pick-grid" role="radiogroup">{BIZ.map(x => (
        <button key={x.k} className="pick sl" role="radio" aria-checked={ob.type === x.k} data-biz={x.k} onClick={() => set(d => { d.type = x.k; })}>
          <Ms className="p-ck">check_circle</Ms><span className="p-ic"><Ms>{x.ic}</Ms></span><span className="title-m">{x.t}</span><span className="body-s muted">{x.s}</span>
          <span className="p-meta"><span className="status st-mute">{x.ops} операцій</span></span>
        </button>
      ))}</div></>;
  } else if (step === 1) {
    html = <>{head('Форма бізнесу й оподаткування', 'Визначає, чи потрібна подвійна запис, план рахунків, ПДВ і які звіти подавати.')}
      <div className="pick-grid" role="radiogroup">{FORMS.map(x => (
        <button key={x.k} className="pick sl" role="radio" aria-checked={ob.form === x.k} onClick={() => set(d => { d.form = x.k; })}>
          <Ms className="p-ck">check_circle</Ms><span className="title-m">{x.t}</span><span className="body-s muted">{x.s}</span>
          <span className="p-meta">{x.vat && <span className="status st-new">ПДВ</span>}{x.fop ? <span className="status st-mute">Книга обліку доходів</span> : <span className="status st-mute">Подвійний запис</span>}</span>
        </button>
      ))}</div></>;
  } else if (step === 2) {
    const showStores = !['services', 'it'].includes(b.k), showProd = ['cafe', 'production', 'construction', 'hotel', 'food'].includes(b.k);
    html = <>{head('Компанії, точки й склади', 'Це основа аналітики: кожна компанія веде свій облік, кожна точка й склад мають власні залишки, виручку й витрати.')}
      <div className="conn-groups">
        <Sec t="Компанії групи" s="Окремі платники податків, які ви хочете бачити разом">{listEd('entities', 'domain', 'Додати компанію')}</Sec>
        <Sec t="Точки продажу" s="Кав’ярні, магазини, кіоски. До кожної прив’язується каса ПРРО">{listEd('points', 'storefront', 'Додати точку')}</Sec>
        <Sec t="Підрозділи" s="Цехи, кухні, офіс: місця виникнення витрат">{listEd('depts', 'account_tree', 'Додати підрозділ')}</Sec>
        {showStores && <Sec t="Склади й місця зберігання" s="Між ними товар рухається документами переміщення">{listEd('stores', 'warehouse', 'Додати склад')}</Sec>}
        {showProd && <Sec t="Виробництво" s="Як утворюється собівартість"><div className="set-list">
          {tog('prodOwn', 'soup_kitchen', 'Власне виробництво', 'Кухня або цех готує продукцію з сировини')}
          {tog('prodTech', 'receipt_long', 'Техкарти', 'Списання інгредієнтів за рецептурою при кожному продажі')}
          {tog('prodSemi', 'blender', 'Напівфабрикати', 'Заготовки, які передаються з цеху на точки')}
        </div></Sec>}
      </div></>;
  } else if (step === 3) {
    html = <>{head('Продажі й закупівлі', 'Від цього залежать документи реалізації, розрахунки з контрагентами й валютні операції.')}
      <div className="conn-groups">
        <Sec t="Канали продажу" s="Кожен канал отримає свою виручку й маржу"><div className="set-list"><div className="set-row">{multi('channels', CHANNELS[b.k] || CHANNELS.cafe)}</div></div></Sec>
        <Sec t="Як ви закуповуєте" s="Постачальники, умови оплати й валюта"><div className="set-list"><div className="set-row">{multi('purchase', OPTS.purchase)}</div></div></Sec>
      </div></>;
  } else if (step === 4) {
    html = <>{head('Люди й майно', 'Зарплата, ЄСВ і ПДФО рахуються за вашою системою оплати. Майно визначає амортизацію й оренду.')}
      <div className="conn-groups">
        <Sec t="Персонал" s="Штатні працівники і ФОП-підрядники обліковуються по-різному"><div className="set-list">
          {cnt('staff', 'badge', 'Працівники в штаті', 'Трудові договори: зарплата, ЄСВ 22%, ПДФО, військовий збір')}
          {cnt('contractors', 'work', 'ФОП-підрядники', 'Акти й оплата послуг без нарахувань на зарплату')}
          {optRow('payments', 'Система оплати', 'Можна обрати кілька', multi('pay', OPTS.pay))}
          {tog('timesheet', 'calendar_view_week', 'Табель змін', 'Години по кожному працівнику й точці')}
        </div></Sec>
        <Sec t="Майно" s="Приміщення, обладнання й основні засоби"><div className="set-list">
          {optRow('home_work', 'Приміщення', 'Оренда обліковується щомісяця по точках', single('premises', OPTS.premises))}
          {cnt('assets', 'coffee_maker', 'Одиниць обладнання', 'Кавомашини, кавомолки, холодильники, меблі')}
          <div className="set-row"><Lead ic="price_check" /><Txt t="Поріг основних засобів" s="Дешевше за поріг списується одразу, дорожче амортизується" /><div style={{ width: 180 }}>{field('osLimit', 'Сума, ₴')}</div></div>
        </div></Sec>
      </div></>;
  } else if (step === 5) {
    html = <>{head('Облік і відповідальні', 'Яку аналітику бачить власник, хто підписує й погоджує, з якої дати Сальдо веде облік.')}
      <div className="conn-groups">
        <Sec t="Управлінська аналітика" s="Розрізи, у яких ви бачите прибуток"><div className="set-list"><div className="set-row">{multi('analytics', OPTS.analytics)}</div></div></Sec>
        <Sec t="Відповідальні" s="Підпис КЕП, бухгалтерія й погодження оплат"><div className="set-list">
          <div className="set-row"><Lead ic="draw" /><Txt t="Директор, підписант КЕП"><div style={{ marginTop: 12, maxWidth: 420 }}>{field('director', 'ПІБ директора')}</div></Txt></div>
          {optRow('calculate', 'Хто веде бухгалтерію', 'Від цього залежить, кому система ставить питання', single('chief', OPTS.chief))}
          {optRow('verified_user', 'Хто погоджує оплати', 'Платіжки йдуть на підпис цій людині', single('approver', OPTS.approver))}
        </div></Sec>
        <Sec t="Початок обліку" s="Дата, з якої Сальдо веде облік, і звідки беруться залишки"><div className="set-list">
          <div className="set-row"><Lead ic="event" /><Txt t="Вести облік з" s="Зазвичай перше число поточного місяця" /><div style={{ width: 180 }}>{field('start', 'Дата', 'calendar_today')}</div></div>
          {optRow('input', 'Залишки на початок', 'Гроші, товари, борги й основні засоби', single('balances', OPTS.balances))}
        </div></Sec>
      </div></>;
  } else if (step === 6) {
    const groups = CONN.map(g => ({ ...g, items: g.items.filter(i => !i[4] || i[4].includes(b.k)) })).filter(g => g.items.length);
    const on = Object.values(ob.conns).filter(Boolean).length;
    const ql = q.trim().toLowerCase();
    const shown = groups.map(g => ({ ...g, items: g.items.filter(([k, , t, sub]) => !ql || (t + ' ' + sub + ' ' + g.g + ' ' + (ALIAS[k] || '')).toLowerCase().includes(ql)) }));
    const any = shown.some(g => g.items.length);
    html = <>{head('Підключіть сервіси', 'Звідси система братиме дані й сама створюватиме документи. Ми показали те, що зазвичай потрібно для типу «' + b.t + '». Решту можна знайти пошуком або підключити пізніше.')}
      <div className="tf" style={{ '--tf-bg': 'var(--md-surface)' } as React.CSSProperties}>
        <input id="connQ" placeholder=" " autoComplete="off" value={q} onChange={e => setQ(e.target.value)} /><label htmlFor="connQ">Пошук сервісу</label><Ms className="trail-ic">search</Ms>
        <div className="support" id="connOn">Обрано: {on}</div>
      </div>
      <div className="conn-groups">{shown.map(g => (
        <section className="conn-group" key={g.g} hidden={!g.items.length}><div className="conn-head"><span className="title-m">{g.g}</span><span className="body-s muted">{g.s}</span></div>
          <div className="set-list">{g.items.map(([k, ab, t, sub]) => (
            <div className="set-row" key={k}><span className="lead">{ab}</span><Txt t={t} s={sub} />
              <label className="switch"><input type="checkbox" checked={!!ob.conns[k]} aria-label={t} onChange={e => { const v = e.target.checked; set(d => { d.conns[k] = v; }); }} /><span className="track" /><span className="thumb" /></label></div>
          ))}</div></section>
      ))}</div>
      <div className="empty" id="connEmpty" hidden={any}><Ms>search_off</Ms><div className="body-m" style={{ marginTop: 8 }}>Такого сервісу ще немає. Напишіть нам, і ми додамо його в чергу підключень.</div></div></>;
  } else {
    const conns = Object.values(ob.conns).filter(Boolean).length;
    const n = (k: number, a: string, b2: string, c: string) => plural(k, a, b2, c);
    const items: [string, string, string][] = [
      f.fop ? ['menu_book', 'Книга обліку доходів', 'Подвійний запис для ФОП не потрібен'] : ['account_tree', 'План рахунків за Інструкцією 291', 'Робочі рахунки й субрахунки під ваш бізнес'],
      ['domain', `${ob.entities.length} ${n(ob.entities.length, 'компанія', 'компанії', 'компаній')} групи`, ob.entities.map(e => e.n).join(', ')],
      ['library_books', `${b.ops} типових операцій`, `Каталог «${b.t}»: від закупівлі до закриття місяця`],
      ['storefront', `${ob.points.length} точк${n(ob.points.length, 'а', 'и', 'ок')} і ${ob.depts.length} підрозділ${ob.depts.length === 1 ? '' : 'и'}`, 'Окремі виручка, витрати й прибуток'],
      ['warehouse', `${ob.stores.length} місц${ob.stores.length === 1 ? 'е' : 'я'} зберігання`, `ФІФО${ob.prodTech ? ', списання за техкартами' : ''}${ob.prodSemi ? ', напівфабрикати' : ''}`],
      ['sell', 'Канали продажу', ob.channels.join(', ') || 'Не обрано'],
      ['groups', `Зарплата: ${ob.staff} у штаті, ${ob.contractors} ФОП`, ob.pay.join(', ') + (ob.timesheet ? ', табель змін' : '')],
      ['coffee_maker', `${ob.assets} основних засобів`, `Поріг ${ob.osLimit} ₴ · приміщення: ${ob.premises.toLowerCase()}`],
      ['insights', 'Управлінська аналітика', ob.analytics.join(', ').toLowerCase() || 'Не обрано'],
      ['verified_user', 'Відповідальні', `Підписує ${ob.director} · бухгалтерія: ${ob.chief.toLowerCase()} · оплати погоджує ${ob.approver.toLowerCase()}`],
      ['event', `Облік з ${ob.start}`, `Залишки: ${ob.balances.toLowerCase()}`],
      ['link', `${conns} підключень`, 'Дані почнуть надходити протягом години']
    ];
    html = <>
      <div className="hero-ok"><span className="big"><Ms style={{ fontSize: 32 }}>check</Ms></span><div><h1 className="headline-m" style={{ margin: 0 }}>Облік налаштовано</h1><p className="body-m muted" style={{ margin: '4px 0 0' }}>{b.t} · {f.t}</p></div></div>
      <div className="summary">{items.map(([ic, t, sub]) => <div className="sum-item" key={ic}><Ms>{ic}</Ms><div><div className="title-s">{t}</div><div className="body-s muted" style={{ marginTop: 2 }}>{sub}</div></div></div>)}</div>
      <p className="body-s muted" style={{ margin: 0 }}>Це стартовий стан. Далі будь-яка зміна (новий працівник, нова точка, продаж обладнання, зміна системи оподаткування) вноситься з датою в розділі «Структура і зміни», і звіти за минулі періоди не ламаються.</p>
    </>;
  }

  return (
    <div className="onb" id="onb" role="dialog" aria-modal="true" aria-label="Налаштування обліку" hidden={!s.onbOpen}>
      <div className="onb-top">
        <button className="icon-btn sl" id="onbClose" aria-label="Закрити" onClick={close}><Ms>close</Ms></button>
        <span className="title-l">Налаштування обліку</span>
        <span className="body-m muted" id="onbCount">{step < LAST ? `Крок ${step + 1} з ${LAST}` : ''}</span>
      </div>
      <div className="onb-progress"><span id="onbBar" style={{ width: ((step + 1) / ONB_STEPS.length * 100) + '%' }} /></div>
      <div className="onb-body" ref={body}><div className="onb-inner" id="onbInner">{html}</div></div>
      <div className="onb-foot">
        <button className="btn btn-text sl" id="onbBack" style={{ visibility: step && step < LAST ? 'visible' : 'hidden' }} onClick={() => step && setStep(step - 1)}>Назад</button>
        <span className="spacer" />
        <button className="btn btn-filled sl" id="onbNext" onClick={next}>
          {step === LAST - 1 ? 'Налаштувати облік' : step === LAST ? <>Перейти до Сальдо<Ms style={{ margin: '0 -8px 0 0' }}>arrow_forward</Ms></> : 'Далі'}
        </button>
      </div>
    </div>
  );
}
