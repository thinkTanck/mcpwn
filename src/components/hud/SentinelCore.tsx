'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';

/**
 * The tri-state "Sentinel" particle-sphere core — the visual through-line across
 * screens. A 2D canvas Fibonacci sphere (520 points); the upper cap renders in
 * breach-red, the rest in nominal-cyan.
 *
 * FRAME BUDGET (this is a CWV gate, not a preference). The first version drew
 * each point as its own `beginPath`/`fillStyle`/`fill` with `ctx.shadowBlur` set
 * — a gaussian blur per fill, 520 times a frame. Under Lighthouse's 4x CPU
 * throttling every frame became a >50ms long task, so the main thread never
 * reached the 5s quiet window Time to Interactive needs: TBT and TTI errored
 * (NO_TTI_CPU_IDLE_PERIOD) and the performance category scored `null`. This
 * version keeps the same 520 points and the same look but:
 *
 *   - batches every point into DEPTH_BANDS alpha bands per colour, so a frame
 *     costs a bounded number of draw calls (<= 4 x DEPTH_BANDS) instead of 520;
 *   - draws the bloom as a second, larger, fainter disc rather than a blur;
 *   - renders at ~30fps (the sphere turns once per ~39s — 60fps buys nothing);
 *   - stops entirely while the tab is hidden.
 *
 * Colours come from the DTCG status tokens via `var()`, so a theme swap moves
 * the canvas with everything else. Under `prefers-reduced-motion` it paints ONE
 * static frame and never starts a loop. `role="img"` + `aria-label` name it.
 */
const POINTS = 520;
/** Alpha bands the depth gradient is quantised into (visually continuous). */
const DEPTH_BANDS = 7;
/** ~30fps — the rotation is slow enough that 60fps is spent for nothing. */
const FRAME_MS = 33;

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

    // Resolved once from the DTCG semantic tokens; per-point opacity rides on
    // globalAlpha so the token value is never decomposed into raw channels.
    const styles = getComputedStyle(canvas);
    const token = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    const NOMINAL = token('--status-nominal', 'var(--status-nominal)');
    const BREACH = token('--status-breach', 'var(--status-breach)');

    const pts = fibonacciSphere(POINTS);
    ctx.shadowBlur = 0;

    /** One band of points sharing a colour and an alpha, drawn in one fill. */
    const band: { x: number; y: number; s: number }[][] = Array.from(
      { length: DEPTH_BANDS * 2 },
      () => [],
    );

    const render = (ang: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = w * 0.36;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);

      for (const b of band) b.length = 0;
      for (const [ox, oy, oz] of pts) {
        const x = ox * ca - oz * sa;
        const z = ox * sa + oz * ca;
        const depth = (z + 1) / 2;
        const breach = oy > 0.55;
        const level = Math.min(DEPTH_BANDS - 1, (depth * DEPTH_BANDS) | 0);
        const bucket = band[(breach ? DEPTH_BANDS : 0) + level];
        bucket?.push({ x: cx + x * R, y: cy + oy * R, s: 0.6 + depth * 1.9 });
      }

      // Bloom pass then core pass, one fill per band: the halo is a larger,
      // fainter disc, which costs a fill instead of a per-point blur.
      for (const pass of [
        { scale: 2.6, alpha: 0.16 },
        { scale: 1, alpha: 1 },
      ]) {
        for (let i = 0; i < band.length; i++) {
          const points = band[i];
          if (!points || points.length === 0) continue;
          const level = i % DEPTH_BANDS;
          const depth = (level + 0.5) / DEPTH_BANDS;
          ctx.globalAlpha = (0.15 + depth * 0.6) * pass.alpha;
          ctx.fillStyle = i < DEPTH_BANDS ? NOMINAL : BREACH;
          ctx.beginPath();
          for (const p of points) {
            ctx.arc(p.x, p.y, p.s * pass.scale, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    if (reduced) {
      render(0.6); // single static frame — no animation loop
      return;
    }

    let raf = 0;
    let last = -Infinity;
    const loop = (time: number) => {
      if (time - last >= FRAME_MS) {
        last = time;
        render(time * 0.00016);
      }
      raf = requestAnimationFrame(loop);
    };
    // A hidden tab already throttles rAF, but stopping outright means a
    // backgrounded page costs nothing at all.
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(loop);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(raf);
    };
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
