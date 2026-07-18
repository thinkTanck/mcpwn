'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';

/**
 * Count-up of a MAGNITUDE only (never an id) — the restrained-alive HUD motion
 * applied to the leaderboard's OVERALL readout. The final value is the resting
 * state: it renders immediately (SSR, no-JS, and `prefers-reduced-motion` all
 * show the true number), and only eases up from zero when motion is allowed.
 * CWV-safe: text-content updates via a single rAF loop, no layout thrash.
 */
export function CountUp({
  value,
  decimals = 2,
  durationMs = 900,
  className,
}: {
  value: number;
  decimals?: number;
  durationMs?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    // Reduced motion (and SSR/first paint) rest at the final value — see the
    // render below; nothing to animate, and no synchronous setState in effect.
    if (reduced || typeof requestAnimationFrame !== 'function') return;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [value, durationMs, reduced]);

  // When motion is suppressed, always show the final value (correct even if the
  // prop changes); otherwise show the animated display.
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {(reduced ? value : display).toFixed(decimals)}
    </span>
  );
}
