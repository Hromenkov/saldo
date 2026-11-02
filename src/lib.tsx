import type { ReactNode } from 'react';

export const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt0 = (n: number) => n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const now = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export const Ms = ({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) =>
  <span className={cx('ms', className)} style={style}>{children}</span>;

const STATUS: Record<string, [string, string, string]> = {
  ok: ['st-ok', 'check', 'Проведено'],
  new: ['st-new', 'auto_awesome', 'Розпізнано'],
  check: ['st-check', 'help', 'Потрібна відповідь'],
  ready: ['st-new', 'draw', 'Готово до підпису'],
  sent: ['st-ok', 'done_all', 'Прийнято · квитанція №2'],
  draft: ['st-mute', 'edit_note', 'Чернетка']
};
export function StatusChip({ st }: { st: string }) {
  const [c, ic, t] = STATUS[st];
  return <span className={'status ' + c}><Ms>{ic}</Ms>{t}</span>;
}

export const ModeChip = ({ mode }: { mode: 'auto' | 'confirm' }) => mode === 'auto'
  ? <span className="status mode-auto"><Ms>bolt</Ms>Автоматично</span>
  : <span className="status mode-confirm"><Ms>rule</Ms>З підтвердженням</span>;

/** Українські закінчення: 1 файл, 2 файли, 5 файлів (як у прототипі) */
export const plural = (n: number, one: string, few: string, many: string) => n === 1 ? one : n < 5 ? few : many;
