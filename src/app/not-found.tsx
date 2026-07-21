import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Not found · MCPwn',
  description: 'No MCPwn route or run at this address.',
};

/**
 * Custom 404. A root-level not-found renders inside the root layout only, so it
 * has no command deck — which makes it a dead-end that must carry its own
 * wayfinding back into the app. Register: BRAND.
 *
 * Colour: a missing route is a SYSTEM state, not a red-team signal, so it wears
 * the neutral `--status-inert` plane (ADR-0003), never breach-red. Destinations
 * use the normal cyan link affordance.
 */
export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-base px-6 py-16 text-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -10%,color-mix(in srgb,var(--status-inert) 12%,transparent),transparent 55%)',
        }}
      />

      <div className="flex w-full max-w-md flex-col items-start gap-5">
        <span aria-hidden="true" style={{ color: 'var(--status-inert)' }}>
          {/* A ring with a broken arc — signal lost. */}
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
            <path
              d="M29 16a13 13 0 1 1-7-11.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              opacity="0.5"
            />
            <path d="M16 10v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="16" cy="21.5" r="1.1" fill="currentColor" />
          </svg>
        </span>

        <div className="flex flex-col gap-2">
          <p className="micro-label" style={{ color: 'var(--status-inert)' }}>
            404 · No signal
          </p>
          <h1 className="reading-h2 font-semibold text-ink-hi">Nothing at this address</h1>
        </div>

        <p className="reading text-ink-muted">
          This route is not part of MCPwn, or the run has expired. Pick a heading below to get back
          on course.
        </p>

        <nav aria-label="Where to next" className="mt-1 flex w-full flex-col gap-2.5">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-between rounded-md border border-line-em bg-nominal/10 px-4 font-mono text-[13px] tracking-[0.06em] text-readout transition-colors hover:bg-nominal/20"
          >
            <span>Home</span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/runs/sample"
            className="inline-flex min-h-11 items-center justify-between rounded-md border border-line px-4 font-mono text-[13px] tracking-[0.04em] text-ink-muted transition-colors hover:border-line-em hover:text-ink-hi"
          >
            <span>Watch the sample run</span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/connect"
            className="inline-flex min-h-11 items-center justify-between rounded-md border border-line px-4 font-mono text-[13px] tracking-[0.04em] text-ink-muted transition-colors hover:border-line-em hover:text-ink-hi"
          >
            <span>Connect your agent</span>
            <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
