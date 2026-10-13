'use client';
import { keur } from '@/lib/util';

export interface Series { label: string; color: string; values: number[]; dashed?: boolean; area?: boolean }

function niceTicks(min: number, max: number, n = 5) {
  if (min === max) max = min + 1;
  const raw = (max - min) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw))));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.01; v += step) out.push(+v.toFixed(6));
  return out;
}

export function LineChart({ series, xLabels, height = 220, fmt = keur, refLines = [] }: {
  series: Series[]; xLabels: string[]; height?: number; fmt?: (v: number) => string; refLines?: { value: number; label: string; color: string }[];
}) {
  const W = 760, H = height, L = 56, R = 12, T = 12, B = 26;
  const all = [...series.flatMap((s) => s.values), ...refLines.map((r) => r.value), 0];
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const x = (i: number) => L + (i * (W - L - R)) / (n - 1);
  const y = (v: number) => T + ((y1 - v) * (H - T - B)) / (y1 - y0 || 1);
  const every = Math.ceil(n / 12);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={series.map((s) => s.label).join(', ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="axis" strokeWidth={t === 0 ? 1.4 : 0.7} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="muted">{fmt(t)}</text>
          </g>
        ))}
        {xLabels.map((l, i) => (i % every === 0 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="muted">{l}</text> : null))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={L} x2={W - R} y1={y(r.value)} y2={y(r.value)} stroke={r.color} strokeDasharray="4 4" strokeWidth={1.2} />
            <text x={W - R - 4} y={y(r.value) - 4} textAnchor="end" style={{ fill: r.color }}>{r.label}</text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return (
            <g key={s.label}>
              {s.area && <polygon points={`${x(0)},${y(0)} ${pts} ${x(s.values.length - 1)},${y(0)}`} fill={s.color} opacity={0.1} />}
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.4} fill={s.color}><title>{`${s.label} – ${xLabels[i] ?? i} : ${fmt(v)}`}</title></circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="row small" style={{ gap: 14 }}>
          {series.map((s) => (
            <span key={s.label} className="row" style={{ gap: 4 }}>
              <svg width="16" height="8"><line x1="0" x2="16" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} /></svg>{s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barres horizontales simples (ex. intensité des forces de Porter). */
export function HBar({ value, max = 5, color = 'var(--accent)' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="bar" style={{ height: 8 }}>
      <div style={{ width: `${(value / max) * 100}%`, background: color }} />
    </div>
  );
}
