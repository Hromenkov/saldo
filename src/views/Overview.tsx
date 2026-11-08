import { Alert, Button, Card, Dropdown, Label, Tabs } from '@heroui/react';
import { ACCOUNTS } from '../data';
import { useApp } from '../store';
import { fmt, fmt0, Ms } from '../lib';
import { BankTable, Chart } from '../components/Tables';
import { StatValue } from '../MainView';
import { asOf, audit, money } from '../audit';
import { Pulse } from './Pulse';

const PERIODS = ['Листопад 2026', 'Жовтень 2026', 'IV квартал 2026', '2026 рік'];

function PeriodMenu() {
  const { s, upd } = useApp();
  return (
    <Dropdown>
      <Button variant="secondary" aria-label="Період"><Ms>calendar_month</Ms>{s.period}<Ms>arrow_drop_down</Ms></Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu aria-label="Період" selectionMode="single" selectedKeys={[s.period]}
          onSelectionChange={k => { const x = [...(k === 'all' ? [] : k)][0]; if (x) upd(d => { d.period = String(x); }); }}>
          {PERIODS.map(x => (
            <Dropdown.Item key={x} id={x} textValue={x}><Dropdown.ItemIndicator /><Label>{x}</Label></Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function StatCard({ ic, t, v, d, outlined }: { ic: string; t: string; v: string; d: React.ReactNode; outlined?: boolean }) {
  return (
    <Card className={'h-card stat' + (outlined ? ' h-card-outlined' : '')}>
      <div className="top"><Ms>{ic}</Ms><span className="title-s">{t}</span></div>
      <StatValue v={v} />
      <div className="d body-s">{d}</div>
    </Card>
  );
}

export function Overview() {
  const { s, upd, go, snack, openDialog } = useApp();
  const due = s.reports.filter(r => r.st === 'ready');
  const m = s.mode === 'mgmt';
  const accts = ACCOUNTS.filter(a => m || a.acc);
  const total = accts.reduce((sum, a) => sum + a.sum, 0);
  const cards: [string, string, string, React.ReactNode][] = m ? [
    ['account_balance_wallet', 'Усі гроші', fmt0(total) + ' ₴', `${accts.length} рахунків і кас · ТОВ і ФОП`],
    ['trending_up', 'Виручка, листопад', '612 400 ₴', <><span className="up">+8%</span> до жовтня</>],
    ['savings', 'Операційний прибуток', '84 300 ₴', 'маржа 13,8%'],
    ['local_cafe', 'Food cost', '31,2%', 'ціль 30% · найвищий на точці «Оболонь»']
  ] : [
    ['account_balance_wallet', 'Грошові кошти', fmt0(total) + ' ₴', 'рахунки 301, 311 · ТОВ «Приклад»'],
    ['call_received', 'Дебіторська заборгованість', '96 500 ₴', 'рахунок 361 · з них 38 200 ₴ понад 30 днів'],
    ['call_made', 'Кредиторська заборгованість', '54 210 ₴', 'рахунок 631 · найближча оплата 21.11'],
    ['receipt_long', 'Розрахунки з бюджетом', '31 840 ₴', 'рахунки 641, 651 · ПДВ, ЄСВ, ПДФО']
  ];
  const setMode = (mode: 'mgmt' | 'acc') => upd(d => { d.mode = mode; });
  const au = audit(s.docs, s.bank, { today: asOf() });

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="headline-s">Добрий день, Андрію</h1>
        <span className="spacer" />
        <PeriodMenu />
      </div>
      <Tabs className="mode-tabs" variant="secondary" selectedKey={s.mode} onSelectionChange={k => setMode(k as 'mgmt' | 'acc')}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Вид обліку">
            <Tabs.Tab id="mgmt"><Ms className="sm">insights</Ms>Управлінський облік<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="acc"><Ms className="sm">account_tree</Ms>Бухгалтерський облік<Tabs.Indicator /></Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      {s.questions.length > 0 && (
        <Alert className="h-banner" status="accent">
          <Alert.Indicator><Ms className="fill">contact_support</Ms></Alert.Indicator>
          <Alert.Content><Alert.Title>{s.questions.length} питання чекають на вашу відповідь</Alert.Title><Alert.Description>Без них система не може провести частину документів.</Alert.Description></Alert.Content>
          <Button onPress={() => go('questions')}>Відповісти</Button>
        </Alert>
      )}
      {s.role === 'owner' && <Pulse />}
      {au.errors > 0 && s.role !== 'owner' && (
        <Alert className="h-banner" status="danger">
          <Alert.Indicator><Ms className="fill">fact_check</Ms></Alert.Indicator>
          <Alert.Content><Alert.Title>Аудит знайшов {au.errors} {au.errors === 1 ? 'помилку' : au.errors < 5 ? 'помилки' : 'помилок'} на {money(au.atStake)} ₴</Alert.Title><Alert.Description>Перевірено {au.checked} документів до копійки: суми, ПДВ, проводки, дублікати, оплати.</Alert.Description></Alert.Content>
          <Button variant="danger" onPress={() => go('audit')}>Подивитися</Button>
        </Alert>
      )}
      {/* у власника замість демо-показників — «Пульс», порахований з документів і банку */}
      {s.role !== 'owner' && <div className="grid g4">{cards.map(([ic, t, v, d]) => <StatCard key={t} ic={ic} t={t} v={v} d={d} />)}</div>}
      <div className="grid g2" style={{ marginTop: 12 }}>
        <Card className="h-card">
          <Card.Header className="h-card-head"><Card.Title className="title-m">{m ? 'Усі гроші, листопад' : 'Грошові кошти (301, 311), листопад'}</Card.Title><Button isIconOnly variant="ghost" size="sm" aria-label="Більше"><Ms>more_vert</Ms></Button></Card.Header>
          <Chart key={s.mode} add={m ? 54 : 0} />
        </Card>
        <Card className="h-card h-card-list">
          <Card.Header className="h-card-head"><Card.Title className="title-m">Що треба зробити</Card.Title></Card.Header>
          <ul className="list">
            {due.map(r => (
              <li className="li" key={r.name + r.per}><span className="lead blue"><Ms>draw</Ms></span>
                <span className="txt"><div className="title-s">{r.name}</div><div className="s body-s">{r.per} · до {r.due}</div></span>
                <span className="trail"><Button size="sm" variant="tertiary" onPress={() => openDialog({ kind: 'sign', name: r.name, per: r.per })}>Підписати</Button></span></li>
            ))}
            <li className="li"><span className="lead yellow"><Ms>payments</Ms></span><span className="txt"><div className="title-s">Сплатити ЄСВ і ПДФО</div><div className="s body-s">9 440,00 ₴ · платіжки готові</div></span><span className="trail"><Button size="sm" variant="tertiary" onPress={() => snack('Платіжки надіслано в ПриватБанк на підпис')}>Оплатити</Button></span></li>
            <li className="li"><span className="lead"><Ms>handshake</Ms></span><span className="txt"><div className="title-s">3 акти звірки без підпису</div><div className="s body-s">Агроресурс, Логістик-Захід, Енергозбут</div></span><span className="trail"><Button size="sm" variant="tertiary" onPress={() => snack('Нагадування надіслано контрагентам')}>Нагадати</Button></span></li>
          </ul>
        </Card>
      </div>
      <div className="grid g2eq" style={{ marginTop: 28 }}>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}><span className="title-m">Рахунки і каси</span><span className="body-s muted">{m ? 'Усі гроші групи' : 'Лише в обліку ТОВ'}</span></div>
          <div className="table-wrap"><table className="dt compact">
            <thead><tr><th>Рахунок або каса</th><th>Бухоблік</th><th>Управлінка</th><th className="r">Залишок, ₴</th></tr></thead>
            <tbody>{accts.map(a => (
              <tr key={a.name}><td><div className="doc"><Ms>{a.ic}</Ms><div><div className="title-s">{a.name}</div><div className="body-s muted">{a.co} · {a.sub}</div></div></div></td>
                <td>{a.acc ? <span className="status st-ok">рах. {a.acc}</span> : <span className="status st-mute">не входить</span>}</td>
                <td><span className="status st-new">{a.mg}</span></td><td className="r">{fmt(a.sum)}</td></tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={3}>Разом</td><td className="r">{fmt(total)}</td></tr></tfoot>
          </table></div>
        </div>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}><span className="title-m">Останні операції</span><Button size="sm" variant="ghost" onPress={() => go('bank')}>Усі операції</Button></div>
          <BankTable rows={s.bank.slice(-5).reverse()} compact />
        </div>
      </div>
    </div>
  );
}

