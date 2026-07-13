import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Graticule } from './Graticule';
import { StatusBar } from './StatusBar';
import { CommandDeck } from './CommandDeck';

/**
 * The HUD frame: status bar + command deck + main. A Server Component with NO
 * client JS — the active nav comes from the `x-pathname` request header
 * (middleware) and the mobile drawer is a native popover. Uses natural document
 * flow with a sticky header/rail (not a fixed-height overflow container), which
 * avoids the synchronous-layout cost that was delaying LCP.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '/';
  return (
    <div className="relative min-h-dvh bg-base font-sans text-ink">
      <Graticule />
      <StatusBar pathname={pathname} />
      <div className="flex min-h-[calc(100dvh-3rem)]">
        <CommandDeck pathname={pathname} />
        <main className="relative min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
