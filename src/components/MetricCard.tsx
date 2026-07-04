interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
}

export function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-[var(--ink)]">{value}</div>
      {detail && <div className="mt-1 text-xs text-[var(--ink-dim)]">{detail}</div>}
    </div>
  );
}
