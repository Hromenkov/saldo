# Сальдо — карта для задач

Чтобы экономить контекст: **читайте только нужный модуль**, не весь `src/` и не `README.md` целиком (README — справка по бухгалтерской логике, искать в нём через grep).

**Не читать:** `public/landing/index.html` (лендинг, только если задача про лендинг), `package-lock.json`, `tests/fixtures/*.png`, `dist/`.

## Сборка и проверки

- `npm run build` = `tsc -b` + все `scripts/check-*.mts` + `vite build`. Netlify запускает его же (`netlify.toml`), сайт finance.ukrai.org публикуется из `main`.
- `npm test` — только проверки `scripts/check-*.mts` (быстро). `npm run check:functions` — типы Netlify Functions.
- `tsconfig` с `noUnusedLocals`: лишний импорт ломает сборку.

## Где что лежит

| Что правим | Файл |
|---|---|
| Точка входа, провайдер | `src/main.tsx`, `src/App.tsx` (каркас, меню), `src/MainView.tsx` (переключение страниц) |
| Состояние, навигация, меню по ролям (`NAV`) | `src/store.tsx` |
| Мелкие общие компоненты (`Ms`, `cx`, `fmt`, чипы) | `src/lib.tsx` |
| Ответы помощника | `src/chat.tsx`, UI — `src/components/Assistant.tsx` |
| Онбординг | `src/components/Onboarding.tsx` |
| Таблица банка и пр. | `src/components/Tables.tsx` |
| Корень оверлеев (панель, диалоги, снекбар) | `src/components/Overlays.tsx` |
| Карточка документа (проводки, номенклатура, склад, подстава) | `src/components/overlays/DocSheet.tsx` |
| Карточка типовой операции | `src/components/overlays/OpSheet.tsx` |
| Диалоги: подпись, загрузка/импорт 1С, план, акт сверки | `src/components/overlays/dialogs.tsx` |
| Общий путь «файлы → распознавание → документы» (диалог, камера, очередь) | `src/components/useRecognize.ts` |
| Телефон: камера для накладной (`/app/camera`) | `src/mobile/Capture.tsx` |
| Телефон: нижняя панель, очередь фото без сети, «Встановити на телефон» | `src/mobile/Mobile.tsx`, `queue.ts` (IndexedDB), `pwa.ts` |
| PWA: манифест, иконки, service worker | `public/manifest.webmanifest`, `public/icons/`, `public/sw.js` (при смене логики кеша поднять `VERSION`) |

**Страницы** (`src/views/`): `Overview` огляд · `Pulse` пульс владельца · `Audit` аудит · `Pages` (вопросы, документы, банк, ОСВ, закрытие месяца, отчётность) · `Assets` ОЗ (+ `AssetSheet`) · `Stock` склад · `Credit` кредиты и валюта · `Payroll` зарплата · `Vat` НДС · `Ops` типовые операции · `Structure` структура и изменения.

**Демо-данные** (`src/data/`, импортировать из `'../data'`): `docs.ts` документы, банк, вопросы, отчёты, закрытие, ОЗ, ОСВ · `onboarding.ts` типы бизнеса, формы, каталоги подключений · `ops.ts` каталог типовых операций · `structure.ts` структура, история, типы изменений.

**Стили** (`src/styles/`, порядок задан в `index.css`): `tokens` токены (светлая палитра в стиле ReUI «Signal», радиус 0; старые имена `--md-*` ссылаются на новые `--bg`, `--fg`, `--muted`, `--border`…) и кнопки · `shell` каркас (сайдбар на всю высоту, шапка с крошками) · `components` карточки, списки, чипы, таблицы, поля, панель, диалог · `onboarding` · `assistant` · `theme` тема «Signal» (ReUI/shadcn): рамки, фреймы, бейджи, таблицы · `pulse` · `mobile` телефон: нижняя панель, камера, safe-area (только `max-width: 600px` и полноэкранная камера, десктоп не трогает).

**Логика (без UI):**
- `src/recognize/` — распознавание документов: `schema` поля, `client` вызов API, `checks` проверки, `chart` план счетов и корреспонденции, `accounts` список счетов, `rules` правила по контрагенту, `nomenclature` справочник, `basis` подстава и статьи ДДС, `settlements` взаиморасчёты, `suppliers`/`companies`/`registry` реестры, `cost`/`escalate` стоимость и второе чтение.
- `src/import1c/` — импорт выписок, EnterpriseData, ОСВ; `export.ts` — выгрузка в BAS.
- `src/finance/` (кредиты, курсы НБУ, валюта), `src/assets/fixed.ts` (ОЗ и амортизация), `src/stock/` (склад), `src/payroll/` (зарплата), `src/vat/` (НДС), `src/audit/` (аудит и пульс).
- `netlify/functions/` — серверные функции: `recognize.mts` (Claude API, нужен `ANTHROPIC_API_KEY`), `nbu-rate.mts`.
- Проверки для каждого модуля — `scripts/check-<модуль>.mts`.

Если файл перерос ~25 КБ, при правке лучше вынести самостоятельную часть в соседний файл и обновить эту карту.
