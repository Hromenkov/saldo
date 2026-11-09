// Застосунок на головному екрані телефона (PWA) без App Store: service worker і кнопка «Встановити».
import { useSyncExternalStore } from 'react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPrompt | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone/iPad: Safari не показує системного запиту, встановлення лише через «Поділитися → На початковий екран» */
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initPwa() {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPrompt; emit(); });
  addEventListener('appinstalled', () => { deferred = null; emit(); });
  // у режимі розробки кеш лише заважає: service worker тільки на зібраному сайті
  if (import.meta.env.PROD && 'serviceWorker' in navigator)
    addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

export const canPrompt = () => !!deferred;

/** Системний запит встановлення (Android, Chrome, Edge). false — запиту немає, треба показати інструкцію */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const p = deferred; deferred = null; emit();
  await p.prompt();
  return (await p.userChoice).outcome === 'accepted';
}

/** Чи показувати пункт «Встановити на телефон»: не показуємо, якщо вже відкрито з головного екрана */
export const useInstallable = () => useSyncExternalStore(
  f => { subs.add(f); return () => { subs.delete(f); }; },
  () => !isStandalone() && (!!deferred || isIos() || matchMedia('(pointer: coarse)').matches),
  () => false
);
