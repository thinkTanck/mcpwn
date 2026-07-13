/**
 * Tri-state robustness bands. Thresholds (from the design): nominal ≥ .80,
 * caution .50–.79, breach < .50. Each band maps to a semantic status token +
 * glow + an UPPERCASE label — status is always glow **and** label, never color
 * alone (WCAG). Consumers pair this with a distinct glyph so cells are not
 * distinguishable by color only.
 */
export type Band = 'nominal' | 'caution' | 'breach';

export function bandFor(robustness: number): Band {
  if (robustness >= 0.8) return 'nominal';
  if (robustness >= 0.5) return 'caution';
  return 'breach';
}

export type BandToken = { status: string; glow: string; label: string };

export function bandToken(band: Band): BandToken {
  switch (band) {
    case 'nominal':
      return { status: 'var(--status-nominal)', glow: 'var(--glow-nominal)', label: 'NOMINAL' };
    case 'caution':
      return { status: 'var(--status-caution)', glow: 'var(--glow-caution)', label: 'CAUTION' };
    case 'breach':
      return { status: 'var(--status-breach)', glow: 'var(--glow-breach)', label: 'BREACH' };
  }
}
