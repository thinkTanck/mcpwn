'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';

/**
 * Count-up reveal for a REAL derived value (the fleet tri-state counts are tallied
 * from the leaderboard cells). It animates 0 → value once on mount — revealing the
 * real number, never fabricating drift. `prefers-reduced-motion` renders the value
 * directly (no animation). Tabular figures via the caller's className so width
 * never reflows. Callers should also expose the stable value to assistive tech
 * (e.g. an sr-only copy), so a screen reader hears the value, not the tick.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (reduced) return; // rendered directly below — no animation, no effect setState
    let raf = 0;
    const t0 = performance.now();
    const dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return <span className={className}>{reduced ? value : n}</span>;
}
