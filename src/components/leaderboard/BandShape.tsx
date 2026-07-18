import type { Band } from '@/lib/hud/bands';

/**
 * Shape code for a robustness band — the SECOND, non-colour channel that makes a
 * heatmap cell distinguishable without relying on hue (WCAG 1.4.1 Use of Colour):
 *
 *   ○ circle   nominal (≥ .80)
 *   △ triangle caution (.50 to .79)
 *   ◇ diamond  breach  (< .50)
 *
 * Decorative (`aria-hidden`): the band is also named in text (the cell's
 * accessible label + the legend), so the glyph never carries meaning alone.
 * Inherits `currentColor`, so it is tinted by the cell's band colour class.
 */
export function BandShape({ band, className }: { band: Band; className?: string }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: '0 0 12 12',
    'aria-hidden': true as const,
    focusable: false as const,
    className,
  };
  if (band === 'nominal') {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (band === 'caution') {
    return (
      <svg {...common}>
        <path d="M6 1.4 11 10.6 1 10.6Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M6 1 11 6 6 11 1 6Z" fill="currentColor" />
    </svg>
  );
}
