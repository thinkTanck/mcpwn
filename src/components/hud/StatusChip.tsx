import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Band } from '@/lib/hud/bands';

/**
 * Tri-state status pill — glow + icon(dot) + UPPERCASE label. Status is NEVER
 * color-only: the label text always names the state, and a glyph accompanies it.
 */
const chip: Record<
  Band,
  { text: string; border: string; bg: string; shadow: string; dot: string }
> = {
  nominal: {
    text: 'text-nominal',
    border: 'border-line-em',
    bg: 'bg-nominal/5',
    shadow: 'shadow-glow-nominal',
    dot: 'bg-nominal',
  },
  caution: {
    text: 'text-caution',
    border: 'border-caution/40',
    bg: 'bg-caution/5',
    shadow: 'shadow-glow-caution',
    dot: 'bg-caution',
  },
  breach: {
    text: 'text-breach-text',
    border: 'border-breach/40',
    bg: 'bg-breach/10',
    shadow: 'shadow-glow-breach',
    dot: 'bg-breach',
  },
};

export function StatusChip({
  state,
  label,
  icon,
  className,
}: {
  state: Band;
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  const s = chip[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[13px] uppercase tracking-[0.12em]',
        s.border,
        s.bg,
        s.text,
        s.shadow,
        className,
      )}
    >
      {icon ?? <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />}
      {label}
    </span>
  );
}
