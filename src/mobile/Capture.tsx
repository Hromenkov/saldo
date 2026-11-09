// Камера на весь екран: сфотографувати накладну під час приймання товару й одразу надіслати на розпізнавання.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { cx, Ms } from '../lib';
import { useRecognize } from '../components/useRecognize';

type Shot = { file: File; url: string };
type Cam = 'starting' | 'live' | 'off';

const stamp = () => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Камеру відкрито ярликом /app/camera: після закриття адреса повертається до /app */
const leaveCameraUrl = () => { if (/\/camera\/?$/.test(location.pathname)) history.replaceState(history.state, '', '/app' + location.hash); };

export function Capture() {
  const { s, upd, snack } = useApp();
  const recognize = useRecognize();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<Cam>('starting');
  const [why, setWhy] = useState('');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flash, setFlash] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const open = s.cameraOpen;

  const stop = useCallback(() => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setCam('starting'); setTorch(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCam('off'); setWhy('Браузер не дає доступу до камери з цієї сторінки'); return; }
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } } })
      .then(st => {
        if (!alive) { st.getTracks().forEach(t => t.stop()); return; }
        stream.current = st;
        if (video.current) { video.current.srcObject = st; video.current.play().catch(() => undefined); }
        const caps = st.getVideoTracks()[0]?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean } | undefined;
        if (caps?.torch) setTorch(false);
        setCam('live');
      })
      .catch((e: DOMException) => {
        if (!alive) return;
        setCam('off');
        setWhy(e?.name === 'NotAllowedError' ? 'Доступ до камери заборонено. Дозвольте його в налаштуваннях браузера або зробіть фото звичайною камерою' : 'Камера недоступна. Можна зробити фото звичайною камерою телефона');
      });
    return () => { alive = false; stop(); };
  }, [open, stop]);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine !== false);
    addEventListener('online', on); addEventListener('offline', on);
    return () => { removeEventListener('online', on); removeEventListener('offline', on); };
  }, []);

  const close = useCallback(() => {
    stop();
    setShots(prev => { prev.forEach(x => URL.revokeObjectURL(x.url)); return []; });
    upd(d => { d.cameraOpen = false; });
    leaveCameraUrl();
  }, [stop, upd]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const add = (files: File[]) => setShots(prev => [...prev, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))]);

  const shoot = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(b => { if (b) add([new File([b], `nakladna-${stamp()}.jpg`, { type: 'image/jpeg' })]); }, 'image/jpeg', 0.92);
    setFlash(f => f + 1);
    navigator.vibrate?.(30);
  };

  const toggleTorch = async () => {
    const t = stream.current?.getVideoTracks()[0]; if (!t || torch === null) return;
    try { await t.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { setTorch(null); }
  };

  const remove = (i: number) => setShots(prev => { URL.revokeObjectURL(prev[i].url); return prev.filter((_, j) => j !== i); });

  const send = async () => {
    const files = shots.map(x => x.file);
    if (!files.length) return;
    close();
    const msgs = await recognize(files, { queueOffline: true });
    if (msgs.length) snack(msgs.join(' · '));
  };

  if (!open) return null;
  const n = shots.length;
  return (
    <div className="capture" role="dialog" aria-modal="true" aria-label="Фото накладної">
      <video ref={video} className="cap-video" playsInline muted autoPlay hidden={cam !== 'live'} />
      {flash > 0 && <div key={flash} className="cap-flash" />}

      <div className="cap-top">
        <button className="icon-btn sl" aria-label="Закрити" onClick={close}><Ms>close</Ms></button>
        <div className="cap-title">Фото накладної</div>
        {torch !== null
          ? <button className="icon-btn sl" aria-label="Ліхтарик" aria-pressed={torch} onClick={toggleTorch}><Ms>{torch ? 'flashlight_off' : 'flashlight_on'}</Ms></button>
          : <span style={{ width: 40 }} />}
      </div>

      {cam === 'live' && (
        <div className="cap-frame" aria-hidden="true"><i /><i /><i /><i /></div>
      )}
      {cam === 'live' && <div className="cap-hint">Накладна цілком у рамці, рівно й без відблисків. Кожне фото — окремий документ</div>}
      {cam === 'starting' && <div className="cap-msg"><Ms>photo_camera</Ms><div>Вмикаю камеру…</div></div>}
      {cam === 'off' && (
        <div className="cap-msg">
          <Ms>no_photography</Ms>
          <div>{why}</div>
          <label className="btn btn-filled sl">
            <Ms>photo_camera</Ms>Зробити фото
            <input type="file" hidden accept="image/*" capture="environment" onChange={e => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
          </label>
        </div>
      )}

      <div className="cap-bottom">
        {!online && <div className="cap-offline"><Ms>cloud_off</Ms>Без зв’язку: фото збережуться на телефоні й надішлються пізніше</div>}
        {n > 0 && (
          <div className="cap-strip">
            {shots.map((x, i) => (
              <div className="cap-thumb" key={x.url}>
                <img src={x.url} alt={`Фото ${i + 1}`} />
                <button aria-label={`Прибрати фото ${i + 1}`} onClick={() => remove(i)}><Ms>close</Ms></button>
              </div>
            ))}
          </div>
        )}
        <div className="cap-controls">
          <label className="cap-side sl" aria-label="Вибрати з галереї">
            <Ms>photo_library</Ms><span>Галерея</span>
            <input type="file" hidden multiple accept="image/*,.pdf" onChange={e => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
          </label>
          <button className={cx('cap-shutter', cam !== 'live' && 'off')} aria-label="Сфотографувати" disabled={cam !== 'live'} onClick={shoot}><span /></button>
          <button className="cap-side cap-send sl" disabled={!n} onClick={send} aria-label={n ? `Надіслати ${n} фото` : 'Надіслати'}>
            <Ms>send</Ms><span>{n ? `Надіслати ${n}` : 'Надіслати'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
