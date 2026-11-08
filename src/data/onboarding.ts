// Демо-дані онбордингу.
/* Онбординг: тип бізнесу → готовий контур обліку */
export type Biz = { k: string; ic: string; t: string; s: string; ops: number; docs: number; pos?: boolean; ecom?: boolean };
export const BIZ: Biz[] = [
  { k: 'cafe', ic: 'local_cafe', t: 'Кав’ярня, ресторан', s: 'Техкарти, ПРРО, склад продуктів', ops: 112, docs: 18, pos: true },
  { k: 'retail', ic: 'storefront', t: 'Роздрібна торгівля', s: 'Магазин, ПРРО, склад товарів', ops: 96, docs: 16, pos: true },
  { k: 'wholesale', ic: 'local_shipping', t: 'Оптова торгівля', s: 'Постачальники, покупці, ПДВ', ops: 104, docs: 17 },
  { k: 'ecom', ic: 'shopping_cart', t: 'Інтернет-магазин', s: 'Маркетплейси, накладений платіж', ops: 88, docs: 15, ecom: true },
  { k: 'services', ic: 'handshake', t: 'Послуги', s: 'Акти, договори, абонементи', ops: 54, docs: 11 },
  { k: 'it', ic: 'code', t: 'IT і фриланс', s: 'Валютні надходження, експорт послуг', ops: 32, docs: 8 },
  { k: 'production', ic: 'precision_manufacturing', t: 'Виробництво', s: 'Сировина, калькуляція, готова продукція', ops: 138, docs: 22 },
  { k: 'construction', ic: 'construction', t: 'Будівництво', s: 'Об’єкти, підрядники, акти КБ-2в', ops: 121, docs: 20 },
  { k: 'hotel', ic: 'hotel', t: 'Готельний комплекс', s: 'Проживання, ресторан, туристичний збір', ops: 146, docs: 24, pos: true },
  { k: 'food', ic: 'factory', t: 'Харчове виробництво', s: 'Сировина від фермерів, партії, мережі', ops: 152, docs: 26 }
];
export type Form = { k: string; t: string; s: string; vat: boolean; fop: boolean };
export const FORMS: Form[] = [
  { k: 'fop2', t: 'ФОП 2 група', s: 'Єдиний податок, без ПДВ', vat: false, fop: true },
  { k: 'fop3', t: 'ФОП 3 група', s: 'Єдиний податок 5%, без ПДВ', vat: false, fop: true },
  { k: 'fop3v', t: 'ФОП 3 група з ПДВ', s: 'Єдиний податок 3% і ПДВ', vat: true, fop: true },
  { k: 'tov3', t: 'ТОВ, 3 група', s: 'Єдиний податок, з ПДВ або без', vat: true, fop: false },
  { k: 'tov', t: 'ТОВ, загальна система', s: 'Податок на прибуток і ПДВ', vat: true, fop: false }
];
export type Item = { n: string; m: string; main?: boolean; form?: string };
export type ListKey = 'entities' | 'points' | 'depts' | 'stores';
export type MultiKey = 'channels' | 'purchase' | 'pay' | 'analytics';
export type SingleKey = 'premises' | 'chief' | 'approver' | 'balances';
export type CountKey = 'staff' | 'contractors' | 'assets';
export type ToggleKey = 'prodOwn' | 'prodTech' | 'prodSemi' | 'timesheet';
export type FieldKey = 'osLimit' | 'director' | 'start';
export type Onboarding = {
  type: string;
  conns: Record<string, boolean>;
} & Record<ListKey, Item[]> & Record<MultiKey, string[]> & Record<SingleKey, string>
  & Record<CountKey, number> & Record<ToggleKey, boolean> & Record<FieldKey, string>;

export const OB_DEFAULT: Onboarding = {
  type: 'cafe',
  entities: [{ n: 'ТОВ «Приклад»', m: 'Основна компанія', main: true, form: 'tov' }, { n: 'ФОП Петренко А.', m: 'Кейтеринг', form: 'fop3' }],
  points: [{ n: 'Точка «Поділ»', m: 'Кав’ярня · вул. Сагайдачного, 12 · ПРРО Checkbox' }, { n: 'Точка «Оболонь»', m: 'Кав’ярня · Оболонська набережна, 7 · ПРРО Checkbox' }],
  depts: [{ n: 'Кухня-заготівельний цех', m: 'Випічка й напівфабрикати для точок' }, { n: 'Офіс', m: 'Адміністрація і закупівлі' }],
  stores: [{ n: 'Центральний склад', m: 'Приймає товар від постачальників' }, { n: 'Склад точки «Поділ»', m: 'Бар і вітрина' }, { n: 'Склад точки «Оболонь»', m: 'Бар і вітрина' }],
  prodOwn: true, prodTech: true, prodSemi: true,
  channels: ['Зал', 'З собою', 'Доставка (Glovo, Bolt Food)'],
  purchase: ['Постачальники з ПДВ', 'ФОП-постачальники', 'Відстрочка оплати'],
  staff: 9, contractors: 2, pay: ['Погодинна', '% від виручки'], timesheet: true,
  premises: 'Оренда', assets: 14, osLimit: '20 000',
  analytics: ['По точках', 'По каналах продажу', 'По напрямках', 'По змінах'],
  director: 'Андрій Петренко', chief: 'Аутсорс', approver: 'Директор',
  start: '01.11.2026', balances: 'Перенести з BAS або 1С',
  conns: { privat: true, cabinet: true, medoc: true, diia: true, checkbox: true, poster: true, vchasno: true, bas: true, edr: true }
};
export const CHANNELS: Record<string, string[]> = {
  cafe: ['Зал', 'З собою', 'Доставка (Glovo, Bolt Food)', 'Кейтеринг', 'Опт кави B2B', 'Онлайн-магазин'],
  retail: ['Магазин', 'Онлайн-замовлення', 'Маркетплейси', 'Опт'],
  wholesale: ['Прямі продажі', 'Торгові мережі', 'Дистрибутори', 'Експорт'],
  ecom: ['Власний сайт', 'Prom', 'Rozetka', 'Епіцентр', 'Instagram'],
  services: ['Разові послуги', 'Абонементи', 'Договори з компаніями'],
  it: ['Експорт послуг', 'Українські клієнти'],
  production: ['Опт', 'Торгові мережі', 'Власна роздріб', 'Експорт'],
  construction: ['Генпідряд', 'Субпідряд', 'Продаж об’єктів'],
  hotel: ['Проживання', 'Booking.com та OTA', 'Прямі бронювання', 'Ресторан', 'Лаунж-бар', 'Торгова зона', 'SPA', 'Конференц-зали', 'Корпоративні клієнти'],
  food: ['Торгові мережі', 'Дистрибутори', 'HoReCa', 'Фірмові магазини', 'Експорт']
};
export const OPTS = {
  purchase: ['Постачальники з ПДВ', 'ФОП-постачальники', 'Імпорт у валюті', 'Передоплата', 'Відстрочка оплати', 'Закупівля за готівку'],
  pay: ['Оклад', 'Погодинна', '% від виручки', 'Відрядна', 'Премії'],
  analytics: ['По точках', 'По каналах продажу', 'По напрямках', 'По змінах', 'По працівниках', 'По проєктах'],
  premises: ['Оренда', 'Власне', 'Частково власне'],
  chief: ['Штатний бухгалтер', 'Аутсорс', 'Немає, веде керівник'],
  approver: ['Директор', 'Власник', 'Фінансовий директор'],
  balances: ['Перенести з BAS або 1С', 'Ввести вручну', 'Починаємо з нуля']
};
export const ADD_DEFAULT: Record<ListKey, [string, string]> = { entities: ['Нова компанія', 'ФОП або ТОВ · вкажіть систему оподаткування'], points: ['Нова точка', 'Адреса й каса ПРРО'], depts: ['Новий підрозділ', 'Для чого він потрібен'], stores: ['Нове місце зберігання', 'Склад, бар, вітрина'] };
export const ALIAS: Record<string, string> = { medoc: 'медок медок мідок medoc', medocedo: 'медок medoc', privat: 'приват privat приват24', mono: 'моно монобанк', bas: 'бас', onec: '1c 1с', np: 'нп nova poshta', vchasno: 'vchasno', vkep: 'вчасно кеп', vkasa: 'вчасно каса', checkbox: 'чекбокс', poster: 'постер', diia: 'дія diia', smartid: 'смартід приват', cabinet: 'дпс кабінет податкова cabinet', sota: 'sota', dilovod: 'діловод', rozetka: 'розетка', prom: 'пром', liqpay: 'лікпей', excel: 'ексель гугл таблиці' };
export type ConnItem = [string, string, string, string, string[]?];
export const CONN: { g: string; s: string; items: ConnItem[] }[] = [
  { g: 'Банки', s: 'Виписки через API, доступ лише на читання', items: [
    ['privat', 'ПБ', 'ПриватБанк', 'API Приват24 для бізнесу'], ['mono', 'MB', 'monobank', 'API рахунків ФОП і бізнесу'], ['pumb', 'ПУ', 'ПУМБ', 'API бізнес-рахунків'],
    ['oschad', 'ОЩ', 'Ощадбанк', 'API бізнес-рахунків'], ['raif', 'RB', 'Райффайзен Банк', 'API бізнес-рахунків'], ['ukrsib', 'УС', 'УкрСиббанк', 'API бізнес-рахунків'],
    ['abank', 'А', 'А-Банк', 'API бізнес-рахунків'], ['sense', 'SB', 'Sense Bank', 'API бізнес-рахунків'], ['ugb', 'УГ', 'Укргазбанк', 'API бізнес-рахунків'],
    ['otp', 'OTP', 'OTP Bank', 'API бізнес-рахунків'], ['kredo', 'КР', 'Кредобанк', 'API бізнес-рахунків'], ['bankfile', 'ФК', 'Інший банк', 'Файл клієнт-банку: 1CClientBankExchange, CSV, XLSX'] ] },
  { g: 'Податкова і звітність', s: 'Звіти, податкові накладні, ЄРПН, квитанції', items: [
    ['cabinet', 'ЕК', 'Електронний кабінет ДПС', 'Розрахунки з бюджетом, звіти, квитанції'], ['medoc', 'MD', 'M.E.Doc', 'ПН і РК, реєстрація в ЄРПН, звітність'],
    ['sota', 'СО', 'СОТА', 'Звітність і ПН'], ['fredo', 'FR', 'FREDO Звіт', 'Звітність і ПН'], ['artzvit', 'АЗ', 'Арт-Звіт Плюс', 'Звітність і ПН'],
    ['pfu', 'ПФ', 'Портал Пенсійного фонду', 'Персоніфікація, лікарняні'] ] },
  { g: 'Підпис КЕП', s: 'Чим ви підписуєте звіти й документи', items: [
    ['diia', 'ДП', 'Дія.Підпис', 'Підпис через застосунок Дія'], ['smartid', 'SI', 'SmartID', 'Хмарний КЕП ПриватБанку'], ['vkep', 'ВК', 'Вчасно.КЕП', 'Хмарний КЕП'],
    ['depositsign', 'DS', 'DepositSign', 'Хмарний КЕП'], ['filekey', 'ФК', 'Файловий або апаратний ключ', 'Key-6.dat, .jks, .pfx, токен'] ] },
  { g: 'Електронний документообіг', s: 'Вхідні та вихідні документи від контрагентів', items: [
    ['vchasno', 'ВЧ', 'Вчасно', 'Накладні, акти, рахунки'], ['paperless', 'PL', 'Paperless', 'Накладні, акти, рахунки'], ['medocedo', 'MD', 'M.E.Doc ЕДО', 'Первинні документи'],
    ['flydoc', 'FD', 'FlyDoc', 'Первинні документи'], ['edin', 'ED', 'EDIN', 'EDI з торговими мережами', ['retail', 'wholesale', 'production', 'food']] ] },
  { g: 'Облікові системи', s: 'Перенесення залишків або робота паралельно', items: [
    ['bas', 'BAS', 'BAS Бухгалтерія', 'Обмін і перенесення даних'], ['onec', '1С', '1С', 'Перенесення даних і залишків'], ['dilovod', 'ДЛ', 'Dilovod', 'Перенесення даних'],
    ['excel', 'XL', 'Excel або Google Таблиці', 'Імпорт довідників і залишків'] ] },
  { g: 'Каси, ПРРО і POS', s: 'Чеки, Z-звіти, продажі по позиціях', items: [
    ['checkbox', 'CB', 'Checkbox', 'Чеки і Z-звіти ПРРО'], ['cashalot', 'CA', 'Cashalot', 'Чеки і Z-звіти ПРРО'], ['vkasa', 'ВК', 'Вчасно.Каса', 'Чеки і Z-звіти ПРРО'],
    ['dpsprro', 'ДП', 'ПРРО «Каса» від ДПС', 'Чеки і Z-звіти'], ['poster', 'PO', 'Poster', 'Продажі по позиціях і техкарти', ['cafe', 'retail', 'hotel']] ] },
  { g: 'Готельні системи', s: 'Бронювання, проживання й розрахунки з гостями', items: [
    ['servio', 'SV', 'Servio HMS', 'Номерний фонд, проживання, рахунки гостей', ['hotel']], ['shelter', 'SH', 'Shelter', 'Номерний фонд, проживання, рахунки гостей', ['hotel']], ['opera', 'OP', 'OPERA PMS', 'Номерний фонд, проживання, рахунки гостей', ['hotel']],
    ['booking', 'BK', 'Booking.com', 'Бронювання, комісії й виплати', ['hotel']], ['tourtax', 'ТЗ', 'Туристичний збір', 'Розрахунок за ночами проживання і звітність', ['hotel']] ] },
  { g: 'Онлайн-оплати', s: 'Платежі на сайті й еквайринг', items: [
    ['liqpay', 'LP', 'LiqPay', 'Платежі й повернення'], ['wfp', 'WP', 'WayForPay', 'Платежі й повернення'], ['monopay', 'MP', 'monopay', 'Еквайринг monobank'],
    ['portmone', 'PM', 'Portmone', 'Платежі й повернення'] ] },
  { g: 'Маркетплейси й CRM', s: 'Замовлення, комісії, виплати', items: [
    ['prom', 'PR', 'Prom', 'Замовлення і виплати', ['ecom', 'retail']], ['rozetka', 'RZ', 'Rozetka', 'Замовлення, комісії, виплати', ['ecom', 'retail']], ['epicentr', 'ЕП', 'Епіцентр', 'Замовлення і виплати маркетплейсу', ['ecom', 'retail']],
    ['kasta', 'KS', 'Kasta', 'Замовлення і виплати', ['ecom', 'retail']], ['horoshop', 'HS', 'Хорошоп', 'Замовлення інтернет-магазину', ['ecom']], ['keycrm', 'KC', 'KeyCRM', 'Замовлення і оплати', ['ecom', 'retail', 'services']],
    ['salesdrive', 'SD', 'SalesDrive', 'Замовлення і оплати', ['ecom']] ] },
  { g: 'Доставка', s: 'Накладений платіж і витрати на доставку', items: [
    ['np', 'НП', 'Нова пошта', 'ТТН, накладений платіж, комісії'], ['ukrposhta', 'УП', 'Укрпошта', 'Відправлення й накладений платіж'], ['meest', 'ME', 'Meest', 'Відправлення й накладений платіж'] ] },
  { g: 'Перевірка контрагентів', s: 'Реквізити, статус платника ПДВ, ризики', items: [
    ['edr', 'ЄД', 'ЄДР і реєстр платників ПДВ', 'Перевірка кожного нового контрагента'], ['opendatabot', 'OD', 'Opendatabot', 'Моніторинг змін у контрагентів'], ['youcontrol', 'YC', 'YouControl', 'Ризики й судові справи'] ] },
  { g: 'Канали для первинки', s: 'Куди надсилати фото й файли документів', items: [
    ['tg', 'TG', 'Telegram-бот', 'Фото накладних і чеків'], ['mail', '@', 'Пошта docs@saldo.ua', 'Пересилання рахунків і актів'], ['gdrive', 'GD', 'Google Диск', 'Папка з документами'] ] }
];
export const ONB_STEPS = ['Тип бізнесу', 'Компанії й оподаткування', 'Точки й склади', 'Продажі й закупівлі', 'Люди й майно', 'Облік і відповідальні', 'Підключення', 'Готово'];

export const isFop = (form?: string) => !!form && form.startsWith('fop');

