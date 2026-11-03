import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { produce, type Draft } from 'immer';
import { ASSETS, BANK, CLOSE, DOCS, HISTORY, LEDGER, QUESTIONS, REPORTS, type Biz, type Form, type HistoryItem } from './data';
import { INITIAL_CHAT, type Msg } from './chat';

export type Role = 'owner' | 'acc';
export type View = 'overview' | 'questions' | 'docs' | 'bank' | 'ledger' | 'close' | 'reports' | 'ops' | 'assets' | 'structure' | 'stock' | 'credit';
export type Sheet = { kind: 'doc'; id: number } | { kind: 'op'; i: number } | { kind: 'asset'; id: string };
export type Dialog = { kind: 'sign'; name: string; per: string } | { kind: 'upload' } | { kind: 'plan' } | { kind: 'act'; cp: string; edrpou?: string };

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
  sheet: Sheet | null; sheetOpen: boolean;
  dialog: Dialog | null; dialogOpen: boolean;
  /** кожне відкриття — свіжа форма, як у прототипі */
  overlaySeq: number;
  drawerOpen: boolean; onbOpen: boolean;
};

export const NAV: Record<Role, [View, string, string, ((s: State) => number | '')?][]> = {
  owner: [
    ['overview', 'space_dashboard', 'Огляд'],
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
    ['questions', 'contact_support', 'Питання власнику', s => s.questions.length || ''],
    ['stock', 'inventory_2', 'Склад'],
    ['ops', 'account_tree', 'Типові операції'],
    ['assets', 'inventory_2', 'Основні засоби'],
    ['credit', 'currency_exchange', 'Кредити і валюта'],
    ['ledger', 'table_view', 'Оборотно-сальдова'],
    ['close', 'event_available', 'Закриття місяця'],
    ['structure', 'schema', 'Структура і зміни'],
    ['reports', 'description', 'Звітність']
  ]
};

const onbSeen = () => { try { return sessionStorage.getItem('saldo-onb') === '1'; } catch { return false; } };

const initial = (): State => ({
  role: 'owner', mode: 'mgmt', period: 'Листопад 2026', view: 'overview', docTab: 'all', structTab: 'Усі',
  docs: structuredClone(DOCS), bank: structuredClone(BANK), questions: structuredClone(QUESTIONS),
  reports: structuredClone(REPORTS), close: structuredClone(CLOSE), history: structuredClone(HISTORY), assets: structuredClone(ASSETS),
  ledger: structuredClone(LEDGER), ledgerSrc: null,
  biz: null, chat: INITIAL_CHAT(), nav: 0,
  sheet: null, sheetOpen: false, overlaySeq: 0, dialog: null, dialogOpen: false, drawerOpen: false, onbOpen: !onbSeen()
});

type Snack = { text: string; undo: (() => void) | null; open: boolean; seq: number };

type Ctx = {
  s: State;
  upd: (f: (d: Draft<State>) => void) => void;
  go: (v: View) => void;
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

  const go = useCallback((v: View) => upd(d => {
    if (!NAV[d.role].some(n => n[0] === v)) v = NAV[d.role][0][0];
    d.view = v; d.sheetOpen = false; d.drawerOpen = false; d.nav++;
  }), [upd]);

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
    openSheet: sh => upd(d => { d.sheet = sh; d.sheetOpen = true; d.overlaySeq++; }),
    closeSheet: () => upd(d => { d.sheetOpen = false; d.drawerOpen = false; }),
    openDialog: dl => upd(d => { d.dialog = dl; d.dialogOpen = true; d.overlaySeq++; }),
    hideDialog: () => upd(d => { d.dialogOpen = false; })
  }), [s, upd, go, snack, snackState, closeSnack]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
