import { useMemo } from 'react';

export function BarChart({
  data,
  color = 'var(--accent)',
  height = 160,
  suffix = '',
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  suffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height, paddingTop: 12 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span className="small muted" style={{ fontSize: 9.5, opacity: d.value ? 1 : 0.35 }}>
            {d.value ? `${d.value}${suffix}` : ''}
          </span>
          <div
            title={`${d.label}: ${d.value}${suffix}`}
            style={{
              width: '100%',
              maxWidth: 34,
              height: Math.max(2, (d.value / max) * (height - 44)),
              background: d.value ? color : 'var(--border)',
              borderRadius: 4,
              transition: 'height 300ms ease',
              opacity: d.value ? 1 : 0.4,
            }}
          />
          <span className="muted" style={{ fontSize: 9.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, color = 'var(--accent)', height = 60 }: { values: number[]; color?: string; height?: number }) {
  const path = useMemo(() => {
    if (!values.length) return '';
    const max = Math.max(1, ...values);
    const step = 100 / Math.max(1, values.length - 1);
    return values
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(100 - (v / max) * 92).toFixed(2)}`)
      .join(' ');
  }, [values]);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ProgressBar({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}
