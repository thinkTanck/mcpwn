/**
 * The node-type legend for the replay timeline — the five colour meanings, in
 * DTCG tokens (matching the orbital's per-type node colours). Static reference,
 * so a simple labelled list of swatches.
 */
const ITEMS: { label: string; color: string }[] = [
  { label: 'Attacker/Agent', color: 'var(--text)' },
  { label: 'Tool', color: 'var(--status-nominal)' },
  { label: 'Memory', color: 'var(--line-emphasis)' },
  { label: 'Complete', color: 'var(--status-caution)' },
  { label: 'Breach', color: 'var(--status-breach)' },
];

export function StepLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[13px] text-ink-muted">
      {ITEMS.map((it) => (
        <li key={it.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: it.color }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
