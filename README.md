# Сальдо

Система обліку для малого бізнесу. Публікується на Netlify (finance.ukrai.org) автоматично з гілки main.

- `/` — система (React + TypeScript, Vite)
- `/landing` — лендинг
- `/legacy` — попередня версія прототипу одним HTML-файлом, для порівняння

## Розробка

```
npm install
npm run dev      # локально на http://localhost:5173
npm run build    # збірка в dist/
```

## Структура

- `src/data.ts` — демо-дані (документи, банк, звіти, каталоги для онбордингу)
- `src/store.tsx` — стан застосунку і навігація
- `src/views/` — сторінки: огляд, питання, документи, банк, ОСВ, закриття місяця, звітність, типові операції, структура
- `src/components/` — помічник, онбординг, панелі й діалоги
- `src/styles.css` — стилі (перенесені з прототипу без змін)

## Розпізнавання документів і імпорт з 1С

- **PDF і фото** надсилаються на `/api/recognize` (Netlify Function `netlify/functions/recognize.mts`). Вона читає документ через Claude API і повертає поля за схемою `src/recognize/schema.ts`. Перевірки (контрольна сума ЄДРПОУ/ІПН, арифметика, ПДВ, дублікати) робить код у `src/recognize/checks.ts`, не модель.
- Потрібна змінна середовища **`ANTHROPIC_API_KEY`** у налаштуваннях сайту Netlify (Site configuration → Environment variables). Без неї функція відповідає «Розпізнавання ще не підключене».
- Підтверджений рахунок для контрагента запам'ятовується як правило (`src/recognize/rules.ts`, поки в localStorage браузера).
- **Вивантаження з 1С/BAS** читаються прямо в браузері (`src/import1c`): виписка `1CClientBankExchange` (.txt, UTF-8 або windows-1251), EnterpriseData (.xml), оборотно-сальдова відомість (.xlsx або .csv).
- Перевірка типів функції: `npm run check:functions`.
