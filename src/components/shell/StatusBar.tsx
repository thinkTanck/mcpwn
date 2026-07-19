import type { ReactNode } from 'react';
import { ModeBadge, type Mode } from './ModeBadge';
import { MobileDrawer } from './MobileDrawer';
import type { FleetStatus } from '@/data/source';

/**
 * Top status bar (banner). Server-rendered — the mobile drawer is a native
 * popover, so the shell ships no client JS. Dominant MCPwn lockup + a one-line
 * condensing meta (truncates rather than wraps). A `meta` slot lets run screens
 * inject the RUN · TARGET · DETECTOR context later.
 */
export function StatusBar({
  pathname,
  fleet,
  mode = 'sample',
  meta,
}: {
  pathname: string;
  fleet: FleetStatus;
  mode?: Mode;
  meta?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-[45] flex h-[62px] shrink-0 items-center gap-4 border-b border-line bg-gradient-to-b from-[rgba(16,24,35,0.75)] to-[rgba(5,8,11,0.4)] px-[18px] backdrop-blur-[6px]">
      <MobileDrawer pathname={pathname} fleet={fleet} />
      <div className="flex shrink-0 items-center gap-2.5">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="shrink-0 animate-[spin_22s_linear_infinite]"
        >
          <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line-emphasis)" strokeWidth="1" />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="var(--status-nominal)"
            strokeWidth="1.4"
            strokeDasharray="6 44"
          />
          <circle cx="12" cy="12" r="2.2" fill="var(--status-nominal)" />
        </svg>
        <span className="font-mono text-[21px] font-semibold tracking-[0.09em] text-ink-hi">
          MCP<span className="text-nominal">wn</span>
        </span>
      </div>
      <div className="hidden h-[26px] w-px shrink-0 bg-line min-[760px]:block" />
      <div className="hidden min-w-0 flex-1 truncate font-mono text-[12.5px] tracking-[0.1em] text-ink-faint min-[760px]:block">
        {meta}
      </div>
      <div className="flex-1 min-[760px]:hidden" />
      <ModeBadge mode={mode} />
    </header>
  );
}
