'use client';

/**
 * Root/global error boundary. Next.js renders this only when the root layout
 * itself throws, which means it replaces the entire document — so, unlike the
 * segment-level error.tsx, it must render its own <html> and <body>.
 *
 * Accessibility: the fallback is a live region (role="alert") announced by
 * assistive technology, with a single labelled button to attempt recovery.
 *
 * Not unit-tested: mounting a component that returns <html>/<body> inside
 * jsdom's container is invalid, so this file is verified via typecheck/build
 * and excluded from unit coverage.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-[var(--bg)] text-[var(--fg)]">
        <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6 py-16">
          <div role="alert" className="flex flex-col gap-4 rounded-lg border p-6">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--danger,#ef4444)]">
              ▸ critical fault
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p>
              A critical error took down the interface. Reloading usually clears it — if it
              persists, the run may need to be restarted.
            </p>
            {error.digest ? <p className="font-mono text-xs">Reference: {error.digest}</p> : null}
            <div>
              <button
                type="button"
                onClick={reset}
                className="rounded-md border px-4 py-2 font-mono text-sm"
              >
                Try again
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
