/**
 * The NOT-MEASURED mark: a barred ring, deliberately unlike the three band
 * glyphs (○ △ ◇) so an inert cell never reads as a weak one.
 *
 * `--status-inert` is the neutral fourth state and is NEVER a tri-state member
 * (ADR-0003), so this mark carries no band colour of its own: it inherits
 * `currentColor` from whatever inert-toned thing it sits in. Decorative
 * (`aria-hidden`) because the words "No data" always sit beside it. It is one
 * icon shared by the legend, the blank cells and the two section badges, so the
 * whole screen says "not measured" the same way.
 */
export function InertMark({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.4 6h5.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
