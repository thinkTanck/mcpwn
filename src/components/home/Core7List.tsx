import Link from 'next/link';
import type { Category } from '@/contract';
import { CORE7 } from './core7';

/**
 * The Core-7 as a "pick a sample" launcher — one row per category, each a link to
 * watch that category's own sample attack replay. `runHref` maps a category id to
 * its sample run route (the featured ASI06 row points at `/runs/sample`).
 *
 * The `featuredId` row (the run trailed above) carries a subtle nominal wash + a
 * "featured" instrument tag, so the "Featured run: memory poisoning" strip and its
 * Core-7 row read as the same thing. Below the list, an inert (never-red) line
 * accounts for the 06→10 numeral gap: ASI07-09 are out of scope by the
 * measurability bar, linked to the Threats coverage board.
 *
 * Type roles: the ASI id is INSTRUMENT (mono, `.instrument`); the category title
 * is a SECONDARY sans label (a name, not prose); the big numeral is a sans
 * display glyph. No running prose lives here, so nothing is prose-in-instrument.
 */
export function Core7List({
  runHref,
  featuredId,
}: {
  runHref: (id: string) => string;
  featuredId?: Category;
}) {
  return (
    <nav aria-label="Core-7 sample runs" className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="micro-label !tracking-[0.16em] !text-nominal">
          The Core-7 · pick a sample
        </span>
        <span className="instrument-faint hidden sm:inline">Tap to watch</span>
      </div>
      <ul className="flex flex-col">
        {CORE7.map((c) => {
          const featured = c.id === featuredId;
          return (
            <li key={c.id}>
              <Link
                href={runHref(c.id)}
                aria-label={`Watch the ${c.id} ${c.title} sample attack${
                  featured ? ', the featured run' : ''
                }`}
                className={`group flex items-center gap-3 rounded-md border px-2 py-2 transition-colors hover:border-line hover:bg-nominal/[0.06] ${
                  featured ? 'border-line-em bg-nominal/[0.05]' : 'border-transparent'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-nominal shadow-glow-nominal"
                />
                <span className="min-w-[28px] font-sans text-lg font-semibold text-ink-hi tabular-nums">
                  {c.num}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="instrument block">
                    {c.id}
                    {featured && <span className="ml-2 text-nominal">· featured</span>}
                  </span>
                  <span className="block font-sans text-sm text-ink">{c.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-mono text-[12px] tracking-[0.08em] text-nominal">
                  Watch
                  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M2 6h7M6 3l3 3-3 3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* The 06→10 gap is a scoping decision, not a missing item: ASI07-09 do not
          clear the measurability bar (ADR-0003). Marked inert (neutral, never red),
          linked to the coverage board so a cold visitor reads scope, not a bug. */}
      <p
        className="mt-2 flex items-center gap-2 px-2 font-mono text-[12px] tracking-[0.04em]"
        style={{ color: 'var(--status-inert)' }}
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-current"
        />
        ASI07–09 not measurable ·{' '}
        <Link href="/threats" className="underline underline-offset-2 hover:text-ink">
          see Threats
        </Link>
      </p>
    </nav>
  );
}
