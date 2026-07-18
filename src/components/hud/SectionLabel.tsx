import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Mono uppercase eyebrow that titles a section (cyan by default). */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('font-mono text-[12px] uppercase tracking-[0.16em] text-nominal', className)}
    >
      {children}
    </div>
  );
}
