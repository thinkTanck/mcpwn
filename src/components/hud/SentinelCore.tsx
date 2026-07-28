'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';

/**
 * The tri-state "Sentinel" particle-sphere core — the visual through-line across
 * screens. A 2D canvas Fibonacci sphere (520 points); the upper cap renders in
 * breach-red, the rest in nominal-cyan. Canvas is imperative pixels, so the
 * tri-state colors are concrete here rather than CSS tokens.
 *
 * Under `prefers-reduced-motion` it paints ONE static frame and never starts an
 * animation loop. `role="img"` + `aria-label` give it an accessible name.
 * (The replay hero escalates this to a real 3D core in feat/replay-hero.)
 */
function fibonacciSphere(count: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = i * 2.399963;
    pts.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  return pts;
}

export function SentinelCore({
  size = 300,
  label = 'Sentinel core: the detector reads only the observable trace',
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return; // jsdom / no-canvas: render the element only

    const pts = fibonacciSphere(520);
    const render = (ang: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = w * 0.36;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (const [ox, oy, oz] of pts) {
        const x = ox * ca - oz * sa;
        const z = ox * sa + oz * ca;
        const depth = (z + 1) / 2;
        const s = 0.6 + depth * 1.9;
        const alpha = 0.15 + depth * 0.6;
        const breach = oy > 0.55;
        ctx.beginPath();
        ctx.arc(cx + x * R, cy + oy * R, s, 0, Math.PI * 2);
        ctx.fillStyle = breach ? `rgba(237,87,110,${alpha})` : `rgba(84,212,230,${alpha})`;
        ctx.shadowBlur = depth * 7;
        ctx.shadowColor = breach ? 'rgba(237,87,110,.7)' : 'rgba(84,212,230,.7)';
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    if (reduced) {
      render(0.6); // single static frame — no animation loop
      return;
    }
    let raf = 0;
    const loop = (time: number) => {
      render(time * 0.00016);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <canvas
      ref={ref}
      width={size * 2}
      height={size * 2}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      className={className}
    />
  );
}
