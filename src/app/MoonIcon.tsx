import { moonIllumination } from '../core/models';

/** Moon disc showing the lit fraction for a phase angle (0 = new, π = full). */
export function MoonIcon({ phase, size = 22 }: { phase: number; size?: number }) {
  const r = size / 2 - 1;
  const c = size / 2;
  const lit = moonIllumination(phase);
  const waxing = phase < Math.PI;
  const crescent = lit < 0.5;
  const rx = r * Math.abs(1 - 2 * lit);
  const outer = waxing ? 1 : 0;
  const inner = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
  const d = `M${c} ${c - r} A${r} ${r} 0 0 ${outer} ${c} ${c + r} A${rx} ${r} 0 0 ${inner} ${c} ${c - r}Z`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="var(--moon-dark)" stroke="var(--panel-border)" />
      <path d={d} fill="var(--moon-lit)" />
    </svg>
  );
}

export function moonPhaseName(phase: number): string {
  const names = [
    'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
    'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent',
  ];
  const i = Math.round((phase / (2 * Math.PI)) * 8) % 8;
  return names[i] ?? 'Moon';
}
