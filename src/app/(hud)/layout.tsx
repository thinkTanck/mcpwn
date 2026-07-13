import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';

/** Wraps every HUD screen in the Sentinel Fields shell (status bar + command deck). */
export default function HudLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
