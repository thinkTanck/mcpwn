'use client';

import { ModeBadge, type Mode } from './ModeBadge';

/** Top status bar (banner): hamburger (mobile) · reticle + wordmark · mode badge. */
export function StatusBar({ mode = 'sample', onMenu }: { mode?: Mode; onMenu: () => void }) {
  return (
    <header className="relative z-[45] flex h-12 shrink-0 items-center gap-4 border-b border-line bg-gradient-to-b from-[rgba(16,24,35,0.75)] to-[rgba(5,8,11,0.4)] px-4 backdrop-blur-[6px]">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open command deck"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-ink hover:border-line-em hover:text-ink-hi min-[760px]:hidden"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12" x2="14" y2="12" />
          </g>
        </svg>
      </button>

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
