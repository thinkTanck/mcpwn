import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Mono muted label + readout value (right-aligned key/value row). */
export function Readout({
  label,
  value,
  valueClassName,
  className,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between font-mono text-xs', className)}>
      <span className="text-ink-muted">{label}</span>
      <span className={cn('text-readout', valueClassName)}>{value}</span>
    </div>
  );
}
