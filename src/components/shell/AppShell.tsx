import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { getDataSource } from '@/data/source';
import { resolveRun } from '@/data/run-view';
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
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') ?? '/';
  // On a run screen, resolve the run server-side so the status bar can show the
  // run-context telemetry (RUN · TARGET · DETECTOR + outcome + severity). It goes
  // through the SAME resolver the replay screen uses, so the chrome and the
  // screen can never disagree about which run is on show: reading the sample
  // library alone left a persisted live run with no telemetry at all, and left
  // the mode badge saying SAMPLE over a run that was not one.
  const runId = /^\/runs\/([^/]+)/.exec(pathname)?.[1];
  const [fleet, view] = await Promise.all([
    getDataSource().getFleetStatus(),
    runId ? resolveRun(runId) : Promise.resolve(null),
  ]);
  const run = view?.run;
  const runContext = run
    ? {
        runId: run.runId,
        model: run.model,
        category: run.verdict.category,
        severity: run.verdict.severity,
        compromised: run.verdict.compromised,
      }
    : undefined;
  // The badge is provenance, so it follows the run rather than a default.
  const mode = view?.origin === 'live' ? 'live' : 'sample';
  return (
    <div className="relative min-h-dvh bg-base font-sans text-ink">
      {/* Skip link (WCAG 2.4.1) — first focusable element, so a keyboard user can
          bypass the six-item deck straight to content. Off-screen until focused. */}
      <a
        href="#main"
        className="sr-only rounded-md border border-line-em bg-solid px-4 py-2 font-mono text-xs tracking-[0.06em] text-nominal focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60]"
      >
        Skip to content
      </a>
      <Graticule />
      <StatusBar pathname={pathname} fleet={fleet} mode={mode} runContext={runContext} />
      <div className="flex min-h-[calc(100dvh-72px)]">
        <CommandDeck pathname={pathname} fleet={fleet} />
        <main
          id="main"
          tabIndex={-1}
          className="type-flow relative min-w-0 flex-1 overflow-x-clip focus:outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
