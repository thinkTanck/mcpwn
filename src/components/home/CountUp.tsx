'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';

/**
 * Count-up for a MAGNITUDE only (a measured metric like precision/recall) — never
 * an identifier, step number, run id, or severity (those must never animate). The
 * resting state is the FINAL value: SSR and the reduced-motion path both render
 * `value` immediately, so there is no CLS and no blank frame; when motion is
 * allowed the number eases up from zero once, on mount.
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
  const format = (n: number) => n.toFixed(decimals);
  const final = format(value);
  const [display, setDisplay] = useState(final);

  useEffect(() => {
    // Reduced motion (and SSR/first paint) rest at the final value — see the
    // render below; nothing to animate, and no synchronous setState in effect.
    if (reduced) return;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(format(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, durationMs, reduced]);

  // When motion is suppressed, always show the final value (correct even if the
  // prop changes); otherwise show the animated display.
  return <span className={className}>{reduced ? final : display}</span>;
}
