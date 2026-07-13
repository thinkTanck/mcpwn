import { ModeBadge, type Mode } from './ModeBadge';
import { MobileDrawer } from './MobileDrawer';

/**
 * Top status bar (banner). Fully server-rendered — the mobile drawer uses the
 * native Popover API, so the shell ships no client JS and LCP stays fast.
 */
export function StatusBar({ pathname, mode = 'sample' }: { pathname: string; mode?: Mode }) {
  return (
    <header className="sticky top-0 z-[45] flex h-12 shrink-0 items-center gap-4 border-b border-line bg-gradient-to-b from-[rgba(16,24,35,0.75)] to-[rgba(5,8,11,0.4)] px-4 backdrop-blur-[6px]">
      <MobileDrawer pathname={pathname} />
      <div className="flex items-center gap-2.5">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
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
        <span className="font-mono text-sm font-medium tracking-[0.14em] text-ink-hi">
          MCP<span className="text-nominal">wn</span>
        </span>
        <span className="hidden font-mono text-[11px] tracking-[0.1em] text-ink-faint min-[760px]:inline">
          SENTINEL FIELDS
        </span>
      </div>
      <div className="flex-1" />
      <ModeBadge mode={mode} />
    </header>
  );
}
