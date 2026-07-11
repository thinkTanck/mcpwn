'use client';

/**
 * Route-segment error boundary. Next.js renders this in place of the segment's
 * UI when a Client/Server Component in the tree throws. It stays mounted inside
 * the root layout, so the fallback uses an <h2> rather than a page <h1>.
 *
 * Accessibility: the container is a live region (role="alert") so assistive
 * technology announces the failure, and recovery is a single labelled button.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <div
        role="alert"
        className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6"
      >
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--danger,#ef4444)]">
          <span aria-hidden="true">▸ </span>
          fault detected
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">Something went wrong</h2>
        <p className="text-[var(--muted)]">
          An unexpected error interrupted this view. Your run data is safe — you can retry this
          step.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-[var(--muted)]">
            Reference: <span className="text-[var(--accent)]">{error.digest}</span>
          </p>
        ) : null}
        <div>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-[var(--accent)] px-4 py-2 font-mono text-sm text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
