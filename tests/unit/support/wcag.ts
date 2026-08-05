/**
 * WCAG 2.2 relative luminance and contrast ratio.
 *
 * Shared by the token suite (which checks the ramps) and the type-role suite
 * (which checks the resolved colour of real call sites), so there is one
 * implementation of the formula the AA claim rests on.
 */

export type RGB = [number, number, number];

/** `#abc` or `#aabbcc` to an RGB triple. */
export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function relativeLuminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: RGB, b: RGB): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
