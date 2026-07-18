import type { CoverageState } from './threat-data';

type IconKind = CoverageState | 'addable';

/**
 * Coverage-state glyph. Paired ALWAYS with a text label (never color-only):
 *   covered — ringed check   inert — ringed dash   addable — dashed ring.
 * Uses `currentColor`, so the color is set by the surrounding text token
 * (`text-nominal` for covered, `var(--status-inert)` for inert/addable).
 */
export function CoverageIcon({ kind, size = 14 }: { kind: IconKind; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      style={{ flex: '0 0 auto' }}
    >
      {kind === 'addable' ? (
        <circle cx="8" cy="8" r="6.5" strokeWidth="1.3" strokeDasharray="2 2.4" />
      ) : (
        <circle cx="8" cy="8" r="6.5" strokeWidth="1.3" />
      )}
      {kind === 'covered' && (
        <path
          d="M5 8.2 7.2 10.4 11 6"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {kind === 'inert' && (
        <line x1="5" y1="8" x2="11" y2="8" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}
