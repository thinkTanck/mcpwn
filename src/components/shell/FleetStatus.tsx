import { cn } from '@/lib/utils';
import { CountUp } from './CountUp';
import type { FleetStatus as FleetStatusData } from '@/data/source';

/**
 * Command-deck FLEET STATUS — the tri-state tally bound to the DataSource. Each
 * tier is named in text (never color-only) with a glowing dot + count. Carries a
 * provenance chip (SAMPLE vs MEASURED) and a dimmed empty state.
 */
const TIERS = [
  { key: 'nominal', dot: 'bg-nominal', glow: 'shadow-glow-nominal' },
  { key: 'caution', dot: 'bg-caution', glow: 'shadow-glow-caution' },
  { key: 'breach', dot: 'bg-breach', glow: 'shadow-glow-breach' },
] as const;

export function FleetStatus({
  fleet,
  variant = 'full',
  className,
}: {
  fleet: FleetStatusData;
  variant?: 'full' | 'dots';
  className?: string;
}) {
  const summary = `Fleet (${fleet.source}): ${fleet.nominal} nominal · ${fleet.caution} caution · ${fleet.breach} breach`;

  // Compact rail (icon-only 72px): just the tri-state dots; the full tally is the accessible name.
  if (variant === 'dots') {
    return (
      <div
        role="img"
        aria-label={summary}
        title={summary}
        className={cn(
          'flex flex-col items-center gap-2.5 border-t border-line pt-3.5',
          fleet.empty && 'opacity-30',
          className,
        )}
      >
        {TIERS.map((t) => (
          <span
            key={t.key}
            aria-hidden="true"
            className={cn('h-[7px] w-[7px] rounded-full', t.dot, t.glow)}
          />
        ))}
      </div>
    );
  }

  return (
    <section
      aria-label="Fleet status"
      className={cn(
        'flex flex-col gap-2 border-t border-line px-3 pb-1 pt-3.5',
        fleet.empty && 'opacity-50',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[14px] uppercase tracking-[0.14em] text-ink-faint">
          Fleet status
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-faint">
          {fleet.source}
        </span>
      </div>
      {fleet.empty ? (
        <p className="font-mono text-[14px] leading-relaxed text-ink-faint">
          No runs yet — launch one to populate.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {TIERS.map((t) => (
            <li key={t.key} className="flex items-center gap-2.5">
              <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full', t.dot, t.glow)} />
              {/* The visible count animates up; an sr-only copy carries the stable
                  real value so a screen reader hears "4 nominal", not the tick. */}
              <span aria-hidden="true" className="font-mono text-[15px] text-ink-muted">
                <CountUp value={fleet[t.key]} className="tabular-nums text-ink-hi" /> {t.key}
              </span>
              <span className="sr-only">
                {fleet[t.key]} {t.key}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
