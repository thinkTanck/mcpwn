'use client';

import { useState, type ReactNode } from 'react';
import { Graticule } from './Graticule';
import { StatusBar } from './StatusBar';
import { CommandDeck } from './CommandDeck';

/** The HUD frame: status bar + command deck + scrollable main. Owns drawer state. */
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-base font-sans text-ink">
      <Graticule />
      <StatusBar onMenu={() => setNavOpen(true)} />
      <div className="relative z-[4] flex min-h-0 flex-1">
        <CommandDeck open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="relative min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
