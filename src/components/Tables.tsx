import { useEffect, useRef, useState } from 'react';
import { CAT, type BankRow } from '../data';
import { useApp } from '../store';
import { fmt, StatusChip } from '../lib';

export function BankTable({ rows, full, compact }: { rows: BankRow[]; full?: boolean; compact?: boolean }) {
  const { s } = useApp();
  const mg = s.role === 'owner' && s.mode === 'mgmt';
  const acc = (b: BankRow) => mg ? (CAT[b.dt + '/' + b.kt] || 'Без статті') : `Дт ${b.dt} · Кт ${b.kt}`;
  const sum = (b: BankRow) => <td className={'r ' + (b.s > 0 ? 'pos' : 'neg')}>{b.s > 0 ? '+' : '−'}{fmt(Math.abs(b.s))}</td>;
  if (compact) return (
    <div className="table-wrap"><table className="dt compact">
      <thead><tr><th>Дата</th><th>Контрагент</th><th className="r">Сума, ₴</th><th>Статус</th></tr></thead>
      <tbody>{rows.map((b, i) => <tr key={i}><td className="num">{b.d}</td><td><div className="title-s">{b.cp}</div><div className="body-s muted">{acc(b)}</div></td>{sum(b)}<td><StatusChip st={b.st} /></td></tr>)}</tbody>
    </table></div>
  );
  return (
    <div className="table-wrap"><table className="dt">
      <thead><tr><th>Дата</th><th>Контрагент</th>{full && <th>Призначення платежу</th>}<th>{mg ? 'Стаття' : 'Проводка'}</th><th className="r">Сума, ₴</th><th>Статус</th></tr></thead>
      <tbody>{rows.map((b, i) => <tr key={i}><td className="num">{b.d}</td><td className="title-s">{b.cp}</td>{full && <td className="muted">{b.p}</td>}<td className="acc">{acc(b)}</td>{sum(b)}<td><StatusChip st={b.st} /></td></tr>)}</tbody>
    </table></div>
  );
}

/** Графік залишку коштів; ширина підлаштовується під картку */
export function Chart({ add = 0 }: { add?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return <div className="chart-box" ref={ref}>{W > 0 && <ChartSvg add={add} W={W} />}</div>;
}

function ChartSvg({ add, W }: { add: number; W: number }) {
  const pts = [358, 362, 371, 406, 404, 396, 398, 389, 395, 384, 380, 384, 383, 418, 410, 412].map((v, i) => v + 10 + Math.round(add * (0.7 + i * 0.02)));
  const H = 220, pl = 44, pr = 12, pt = 12, pb = 28;
  const min = Math.floor((Math.min(...pts) - 15) / 10) * 10, max = Math.ceil((Math.max(...pts) + 10) / 10) * 10;
  const x = (i: number) => pl + i * (W - pl - pr) / (pts.length - 1);
  const y = (v: number) => pt + (max - v) * (H - pt - pb) / (max - min);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1)} ${H - pb} L${x(0)} ${H - pb} Z`;
  const ticks = [0, 1, 2].map(k => Math.round((min + 10 + k * (max - min - 20) / 2) / 10) * 10);
  const days: [number, string][] = [[0, '01.11'], [5, '06.11'], [10, '11.11'], [15, '17.11']];
  const last = pts.length - 1;
  return (
    <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Залишок коштів з 1 по 17 листопада, від ${pts[0]} до ${pts[last]} тисяч гривень`}>
      {ticks.map(t => <g key={t}><line className="grid-l" x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} /><text className="axis" x={pl - 8} y={y(t) + 4} textAnchor="end">{t}к</text></g>)}
      {days.map(([i, l]) => <text key={l} className="axis" x={x(i)} y={H - 8} textAnchor="middle">{l}</text>)}
      <path d={area} style={{ fill: "var(--chart-line)" }} fillOpacity=".06" />
      <path d={line} fill="none" style={{ stroke: "var(--chart-line)" }} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(pts[last])} r="4" style={{ fill: "var(--chart-line)", stroke: "var(--card)" }} strokeWidth="2" />
    </svg>
  );
}
