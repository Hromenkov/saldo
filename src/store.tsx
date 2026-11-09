import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { produce, type Draft } from 'immer';
import { ASSETS, BANK, CLOSE, DOCS, HISTORY, LEDGER, QUESTIONS, REPORTS, type Biz, type Form, type HistoryItem } from './data';
import { INITIAL_CHAT, type Msg } from './chat';
import { asOf, audit } from './audit';

export type Role = 'owner' | 'acc';
export type View = 'overview' | 'pulse' | 'questions' | 'docs' | 'bank' | 'ledger' | 'close' | 'reports' | 'ops' | 'assets' | 'structure' | 'stock' | 'vat' | 'payroll' | 'credit' | 'audit';
export type Sheet = { kind: 'doc'; id: number } | { kind: 'op'; i: number } | { kind: 'asset'; id: string };
export type Dialog = { kind: 'sign'; name: string; per: string } | { kind: 'upload' } | { kind: 'plan' } | { kind: 'act'; cp: string; edrpou?: string } | { kind: 'install' };

export type State = {
  role: Role; mode: 'mgmt' | 'acc'; period: string; view: View;
  docTab: string; structTab: string;
  docs: typeof DOCS; bank: typeof BANK; questions: typeof QUESTIONS; reports: typeof REPORTS; close: typeof CLOSE;
  history: HistoryItem[];
  /** основні засоби */
  assets: typeof ASSETS;
  ledger: typeof LEDGER;
  /** звідки ОСВ: null = демо-дані, інакше назва файлу і період з 1С */
  ledgerSrc: string | null;
  biz: { b: Biz; f: Form; group: string } | null;
  chat: Msg[];
  /** лічильник переходів: на нього реагує анімація появи сторінки */
  nav: number;
  /** звідки прийшли посиланням зі сторінки: ланцюжок для крихт і кнопки «Назад» */
  trail: View[];
  sheet: Sheet | null; sheetOpen: boolean;
  /** попередні картки, якщо з картки відкрили іншу (наприклад, пов’язаний документ) */
  sheetBack: Sheet[];
  dialog: Dialog | null; dialogOpen: boolean;
  /** кожне відкриття — свіжа форма, як у прототипі */
  overlaySeq: number;
  drawerOpen: boolean; onbOpen: boolean;
  /** повноекранна камера для фото накладної (телефон, /app/camera) */
  cameraOpen: boolean;
};

/** Кількість помилок аудиту для значка в меню; рахується з тих самих документів і банку */
const auditErrors = (s: State) => audit(s.docs, s.bank, { today: asOf() }).errors;

export const NAV: Record<Role, [View, string, string, ((s: State) => number | '')?][]> = {
  owner: [
    ['overview', 'space_dashboard', 'Огляд'],
    ['pulse', 'monitor_heart', 'Пульс'],
    ['audit', 'fact_check', 'Аудит', s => auditErrors(s) || ''],
    ['questions', 'contact_support', 'Питання', s => s.questions.length || ''],
    ['reports', 'description', 'Звітність', s => s.reports.filter(r => r.st === 'ready').length || ''],
    ['docs', 'folder_open', 'Документи'],
    ['bank', 'account_balance', 'Банк'],
    ['stock', 'inventory_2', 'Склад'],
    ['structure', 'schema', 'Структура і зміни']
  ],
  acc: [
    ['docs', 'inbox', 'Вхідні документи', s => s.docs.filter(d => d.st !== 'ok').length || ''],
    ['bank', 'account_balance', 'Банк', s => s.bank.filter(b => b.st !== 'ok').length || ''],
    ['audit', 'fact_check', 'Аудит до копійки', s => auditErrors(s) || ''],
    ['questions', 'contact_support', 'Питання власнику', s => s.questions.length || ''],
    ['stock', 'inventory_2', 'Склад'],
    ['ops', 'account_tree', 'Типові операції'],
    ['vat', 'receipt', 'ПДВ'],
    ['payroll', 'badge', 'Зарплата'],
    ['assets', 'inventory_2', 'Основні засоби'],
    ['credit', 'currency_exchange', 'Кредити і валюта'],
    ['ledger', 'table_view', 'Оборотно-сальдова'],
    ['close', 'event_available', 'Закриття місяця'],
    ['structure', 'schema', 'Структура і зміни'],
    ['reports', 'description', 'Звітність']
  ]
};

/** Назва сторінки для крихт: з меню поточної ролі, інакше з будь-якої */
export const viewLabel = (role: Role, v: View) =>
  (NAV[role].find(n => n[0] === v) || NAV.owner.find(n => n[0] === v) || NAV.acc.find(n => n[0] === v))?.[2] || v;

const ALL_VIEWS = new Set<string>([...NAV.owner, ...NAV.acc].map(n => n[0]));
const hashView = (): View | null => { const h = location.hash.replace(/^#\/?/, ''); return ALL_VIEWS.has(h) ? h as View : null; };

const onbSeen = () => { try { return sessionStorage.getItem('saldo-onb') === '1'; } catch { return false; } };

/** Ярлик «Сфотографувати накладну» з головного екрана телефона відкриває /app/camera одразу в камері */
const cameraLink = () => { try { return /\/camera\/?$/.test(location.pathname); } catch { return false; } };

/** Посилання з лендингу: /app?view=pulse відкриває одразу потрібну сторінку демо, без онбордингу */
const linkedView = (): View | null => {
  try { const v = new URLSearchParams(location.search).get('view'); return NAV.owner.some(n => n[0] === v) ? v as View : null; } catch { return null; }
};

const initial = (): State => ({
  role: hashView() && !NAV.owner.some(n => n[0] === hashView()) ? 'acc' : 'owner', mode: 'mgmt', period: 'Листопад 2026',
  view: linkedView() ?? hashView() ?? 'overview', trail: [], sheetBack: [], docTab: 'all', structTab: 'Усі',
  docs: structuredClone(DOCS), bank: structuredClone(BANK), questions: structuredClone(QUESTIONS),
  reports: structuredClone(REPORTS), close: structuredClone(CLOSE), history: structuredClone(HISTORY), assets: structuredClone(ASSETS),
  ledger: structuredClone(LEDGER), ledgerSrc: null,
  biz: null, chat: INITIAL_CHAT(), nav: 0,
  sheet: null, sheetOpen: false, overlaySeq: 0, dialog: null, dialogOpen: false, drawerOpen: false, onbOpen: !onbSeen() && !linkedView() && !cameraLink(), cameraOpen: cameraLink()
});

type Snack = { text: string; undo: (() => void) | null; open: boolean; seq: number };

type Ctx = {
  s: State;
  upd: (f: (d: Draft<State>) => void) => void;
  /** перехід посиланням зі сторінки; top: з меню (без ланцюжка «назад») */
  go: (v: View, opts?: { top?: boolean }) => void;
  /** крок назад: картка → попередня картка, сторінка → попередня сторінка */
  back: () => void;
  snack: (text: string, undo?: () => void) => void;
  snackState: Snack;
  closeSnack: (runUndo: boolean) => void;
  openSheet: (sh: Sheet) => void;
  closeSheet: () => void;
  openDialog: (d: Dialog) => void;
  hideDialog: () => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error('useApp outside provider'); return c; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState(initial);
  const upd = useCallback((f: (d: Draft<State>) => void) => setS(prev => produce(prev, f)), []);

  const cur = useRef(s); cur.current = s;
  const go = useCallback((v: View, opts?: { top?: boolean }) => {
    const p = cur.current;
    const target: View = NAV[p.role].some(n => n[0] === v) ? v : NAV[p.role][0][0];
    let trail = p.trail;
    if (opts?.top) trail = [];
    else if (target !== p.view) {
      const i = trail.indexOf(target);
      trail = i >= 0 ? trail.slice(0, i) : [...trail, p.view];
    }
    upd(d => { d.view = target; d.trail = trail; d.sheetOpen = false; d.sheetBack = []; d.drawerOpen = false; d.nav++; });
    // запис в історії браузера: «Назад» браузера і миші повертає на попередню сторінку разом із крихтами
    if (target !== p.view) history.pushState({ view: target, trail, prev: p.view }, '', '#/' + target);
    else history.replaceState({ view: target, trail, prev: history.state?.prev }, '', '#/' + target);
  }, [upd]);

  // «Назад» у браузері: показати сторінку з історії
  useEffect(() => {
    if (!history.state?.view) history.replaceState({ view: cur.current.view, trail: [] }, '', '#/' + cur.current.view);
    const onPop = (e: PopStateEvent) => {
      const v = (e.state?.view as View | undefined) || hashView() || 'overview';
      const trail = (e.state?.trail as View[] | undefined) || [];
      upd(d => {
        d.sheetOpen = false; d.sheetBack = []; d.drawerOpen = false;
        if (!NAV[d.role].some(n => n[0] === v)) d.role = NAV.owner.some(n => n[0] === v) ? 'owner' : 'acc';
        d.trail = trail.filter(x => NAV[d.role].some(n => n[0] === x));
        if (v !== d.view) { d.view = v; d.nav++; }
      });
    };
    addEventListener('popstate', onPop); return () => removeEventListener('popstate', onPop);
  }, [upd]);

  const [snackState, setSnack] = useState<Snack>({ text: '', undo: null, open: false, seq: 0 });
  const timer = useRef<number>(0);
  const undoRef = useRef<(() => void) | null>(null);
  const snack = useCallback((text: string, undo?: () => void) => {
    undoRef.current = undo || null;
    setSnack(p => ({ text, undo: undo || null, open: true, seq: p.seq + 1 }));
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSnack(p => ({ ...p, open: false })), 4000);
  }, []);
  const closeSnack = useCallback((runUndo: boolean) => {
    if (runUndo && undoRef.current) undoRef.current();
    undoRef.current = null;
    setSnack(p => ({ ...p, open: false }));
  }, []);

  const value = useMemo<Ctx>(() => ({
    s, upd, go, snack, snackState, closeSnack,
    openSheet: sh => upd(d => {
      // картка з картки: попередню можна повернути стрілкою «Назад»
      if (d.sheetOpen && d.sheet) d.sheetBack.push(d.sheet); else d.sheetBack = [];
      d.sheet = sh; d.sheetOpen = true; d.overlaySeq++;
    }),
    closeSheet: () => upd(d => { d.sheetOpen = false; d.drawerOpen = false; d.sheetBack = []; }),
    back: () => {
      if (s.sheetOpen && s.sheetBack.length) upd(d => { d.sheet = d.sheetBack.pop()!; d.overlaySeq++; });
      else if (s.sheetOpen) upd(d => { d.sheetOpen = false; d.sheetBack = []; });
      else if (s.trail.length) {
        const to = s.trail[s.trail.length - 1];
        // якщо попередній запис історії і є ця сторінка, крокуємо історією, щоб не плодити записи
        if (history.state?.view === s.view && history.state?.prev === to) history.back(); else go(to);
      }
    },
    openDialog: dl => upd(d => { d.dialog = dl; d.dialogOpen = true; d.overlaySeq++; }),
    hideDialog: () => upd(d => { d.dialogOpen = false; })
  }), [s, upd, go, snack, snackState, closeSnack]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
