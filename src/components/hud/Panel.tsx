import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Translucent HUD surface: 1px hairline border + panel fill, radius-lg. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-line bg-panel', className)}>{children}</div>;
}
