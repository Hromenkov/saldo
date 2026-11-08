import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { cx, Ms, now, reduceMotion } from '../lib';
import { me, MsgBody, REPLIES, sys, text, understand, type Body, type Msg } from '../chat';

export function Assistant({ open, wide, onClose }: { open: boolean; wide: boolean; onClose: () => void }) {
  const { s, upd, go, snack } = useApp();
  const feed = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [rec, setRec] = useState(false);
  // повідомлення, що були на старті, не анімуються; нові «випливають»
  const firstId = useRef(s.chat[s.chat.length - 1]?.id ?? 0);

  const scroll = () => { const f = feed.current; if (f) f.scrollTop = f.scrollHeight; };
  useLayoutEffect(scroll, [s.chat]);
  useEffect(() => { if (open) scroll(); }, [open]);

  const push = (m: Msg) => upd(d => { d.chat.push(m); });
  const sysReply = (reply: string | Body, delay = 700) => {
    const t = sys({ t: 'typing' }, now());
    push(t);
    setTimeout(() => upd(d => {
      const m = d.chat.find(x => x.id === t.id);
      if (m) { m.body = typeof reply === 'string' ? text(reply) : reply; m.time = now(); }
    }), delay);
  };

  const onAct = (msgId: number, label: string) => {
    upd(d => { const m = d.chat.find(x => x.id === msgId); if (m) m.done = true; });
    if (label === 'Подивитись') return go('reports');
    push(me(text(label), now()));
    sysReply(REPLIES[label] || 'Готово.');
    if (label === 'Підписати в Дії') setTimeout(() => upd(d => {
      d.chat.push(sys(text('Декларацію подано. Квитанцію №2 збережу, щойно вона надійде.'), now()));
      const rep = d.reports.find(x => x.st === 'ready'); if (rep) rep.st = 'sent';
    }), 2200);
  };

  const onMic = () => {
    if (rec) return;
    setRec(true);
    setTimeout(() => {
      setRec(false);
      push(me({ t: 'voice', dur: '0:05', text: 'Оплатив оренду за листопад двадцять вісім тисяч з Привату' }, now()));
      sysReply('Знайшов платіж у виписці ПриватБанку: 28 000,00 ₴, ФОП Савчук (орендодавець). Провів як оренду точки «Поділ». Акт ще не надійшов, попрошу його через Вчасно.', 900);
    }, 1600);
  };

  const onSend = () => {
    const el = input.current; const v = el?.value.trim(); if (!el || !v) return;
    el.value = '';
    push(me(text(v), now()));
    sysReply(understand(v));
    setTimeout(() => el.focus(), 0);
  };

  const onFile = (f: File) => {
    push(me({ t: 'upload', name: f.name, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined }, now()));
    sysReply({ t: 'check' }, 1300);
  };

  const anim = !reduceMotion();
  return (
    <aside className={cx('assist', !wide && open && 'open')} id="assist" aria-label="Помічник">
      <div className="assist-head">
        <span className="title-m"><Ms style={{ color: 'var(--md-primary)' }}>forum</Ms>Помічник</span>
        <button className="icon-btn sl" aria-label="Telegram" title="Пишіть у Telegram" onClick={() => snack('Відкрито @saldo_bot у Telegram')}><Ms>send</Ms></button>
        <button className="icon-btn sl" aria-label="Viber" title="Пишіть у Viber" onClick={() => snack('Відкрито Сальдо у Viber')}><Ms>chat</Ms></button>
        <button className="icon-btn sl" id="assistClose" aria-label="Сховати помічника" onClick={onClose}><Ms>close</Ms></button>
      </div>
      <div className="feed" id="feed" ref={feed}>
        <span className="day">Сьогодні</span>
        {s.chat.map(m => (
          <div key={m.id} className={cx('msg', m.who, anim && m.id > firstId.current && 'new')}>
            {m.who === 'sys' && <span className="av">С</span>}
            <div className="bubble">
              <MsgBody body={m.body} />
              {m.acts && m.body.t !== 'typing' && (
                <div className={cx('acts', m.done && 'done')}>
                  {m.acts.map(([label, kind]) => (
                    <button key={label} className={kind === 'chip' ? 'm-chip sl' : 'btn ' + kind + ' sl'} onClick={() => onAct(m.id, label)}>{label}</button>
                  ))}
                </div>
              )}
              {m.body.t !== 'typing' && <span className="time">{m.time}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="composer">
        <div className="bar">
          <label className="icon-btn sl" aria-label="Надіслати фото або файл" style={{ cursor: 'pointer' }}><Ms>add_photo_alternate</Ms>
            <input type="file" id="chatFile" accept="image/*,application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          </label>
          <input type="text" id="chatIn" ref={input} placeholder="Напишіть як є: «заплатив оренду 28 тисяч»" autoComplete="off" onKeyDown={e => { if (e.key === 'Enter') onSend(); }} />
          <button className={cx('mic', rec && 'rec')} id="micBtn" aria-label="Записати голосове" onClick={onMic}><span className="ms fill">{rec ? 'stop' : 'mic'}</span></button>
        </div>
        <div className="hint">Фото, голосове або текст. Решту система зробить сама.</div>
      </div>
    </aside>
  );
}
