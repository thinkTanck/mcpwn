'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';

/**
 * The replay core: a tri-state particle sphere drawn on a 2D canvas (no WebGL).
 * A fibonacci point cloud rotates slowly; latitude carries the state — cyan body,
 * an amber caution band, a red breach cap — with a luminous cyan nucleus so the
 * centre glows rather than reading as an empty dot grid. It sits behind the STEP
 * numeral in the orbital centre. Colours are read from the DTCG primitive tokens
 * at mount (canvas needs concrete RGB), so a theme swap flows through. Under
 * `prefers-reduced-motion` it paints one static frame and never animates.
 */
function readRgb(cs: CSSStyleDeclaration, name: string, fb: [number, number, number]) {
  const v = cs.getPropertyValue(name).trim();
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v.replace(/^#/, '#'));
  if (!m) return fb;
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] as [
    number,
    number,
    number,
  ];
}

export function ReplayCore({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const cs = getComputedStyle(document.documentElement);
    const CY = readRgb(cs, '--cyan-300', [84, 212, 230]);
    const AM = readRgb(cs, '--amber-400', [235, 181, 97]);
    const RD = readRgb(cs, '--red-400', [237, 87, 110]);
    const HI = readRgb(cs, '--cyan-100', [182, 236, 244]);

    const N = 680;
    const pts: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = i * 2.399963;
      pts.push([Math.cos(t) * r, y, Math.sin(t) * r]);
    }

    let raf = 0;
    let running = true;
    const draw = (time: number) => {
      const ctx = c.getContext('2d');
      if (ctx) {
        const w = c.width;
        const h = c.height;
        ctx.clearRect(0, 0, w, h);
        const ang = reduced ? 0.7 : time * 0.00014;
        const cx = w / 2;
        const cy = h / 2;
        const R = w * 0.36;
        const sc = w / 300;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        for (const p of pts) {
          const x = p[0] * ca - p[2] * sa;
          const z = p[0] * sa + p[2] * ca;
          const y = p[1];
          const depth = (z + 1) / 2;
          const px = cx + x * R;
          const py = cy + y * R;
          const s = sc * (0.6 + depth * 1.9);
          const al = 0.12 + depth * 0.62;
          const rgb = y > 0.6 ? RD : y > 0.46 ? AM : CY;
          const a = (y > 0.46 && y <= 0.6 ? al * 0.92 : al).toFixed(3);
          const col = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
          ctx.beginPath();
          ctx.arc(px, py, s, 0, 6.283);
          ctx.fillStyle = col;
          ctx.shadowBlur = depth * 7 * sc;
          ctx.shadowColor = col;
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        // Luminous nucleus.
        const nb = ctx.createRadialGradient(cx, cy, 0, cx, cy, sc * 46);
        nb.addColorStop(0, `rgba(${HI[0]},${HI[1]},${HI[2]},0.42)`);
        nb.addColorStop(0.34, `rgba(${CY[0]},${CY[1]},${CY[2]},0.2)`);
        nb.addColorStop(1, `rgba(${CY[0]},${CY[1]},${CY[2]},0)`);
        ctx.fillStyle = nb;
        ctx.beginPath();
        ctx.arc(cx, cy, sc * 46, 0, 6.283);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, sc * 2.6, 0, 6.283);
        ctx.fillStyle = `rgba(${HI[0]},${HI[1]},${HI[2]},0.9)`;
        ctx.shadowBlur = 20 * sc;
        ctx.shadowColor = `rgb(${HI[0]},${HI[1]},${HI[2]})`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (!reduced && running) raf = requestAnimationFrame(draw);
    };
    draw(performance.now());
    if (!reduced) raf = requestAnimationFrame(draw);
    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return <canvas ref={ref} width={600} height={600} aria-hidden="true" className={className} />;
}
