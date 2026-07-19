'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';

const SplashCore = dynamic(() => import('./SplashCore'), { ssr: false });

const SEEN_KEY = 'mcpwn.boot.v1.seen';

// The five-line readout (Core-7, corrected from the old Core-5).
const LINES: { label: string; value?: string }[] = [
  { label: 'SENTINEL FIELDS' },
  { label: 'DETECTOR', value: 'BLIND · LOCKED' },
  { label: 'CORE-7 SIGNATURES', value: 'ASI01 · 02 · 03 · 04 · 05 · 06 · 10' },
  { label: 'CALIBRATION', value: 'MEASURED · LEAKAGE-SEPARATED' },
  { label: 'SYSTEM ONLINE' },
];

type Stage = 'field' | 'reticle' | 'readout' | 'online' | 'gone';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * First-visit boot splash. A fade-OVER reveal, not a gate: it mounts only after
 * hydration (absent from SSR) so Home paints underneath and LCP is never blocked.
 * ~4s, completion-paced: cold field → the r3f core assembles and settles → the
 * reticle draws closed → the five-line readout resolves → SYSTEM ONLINE + hold →
 * the overlay eases away to Home. Skippable (SKIP / click / any key). Reduced
 * motion, low power, or no WebGL jump straight to the resolved end frame and fade
 * fast. CYAN ONLY — a boot screen is nominal. Shown once, then persisted.
 */
export function BootSplash() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(false); // decided on the client (first-visit)
  const [stage, setStage] = useState<Stage>('field');
  const [lines, setLines] = useState(0);
  const [fading, setFading] = useState(false);
  const [webgl, setWebgl] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    timers.current.forEach(clearTimeout);
    setFading(true);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage blocked → still dismiss for this session */
    }
    setTimeout(() => setStage('gone'), 420);
  };

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return; // not first visit → never shows, Home is untouched
    const canWebgl = hasWebGL();
    const isDesktop =
      typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
    const list = timers.current;
    const push = (fn: () => void, ms: number) => list.push(setTimeout(fn, ms));

    // Kick the sequence when the browser is IDLE (after Home's critical render +
    // LCP), so the fade-over never competes with first paint. Runs off the effect
    // body, so no synchronous setState-in-effect.
    const kick = () => {
      setWebgl(canWebgl);
      setDesktop(isDesktop);
      setActive(true);
      if (reduced || !canWebgl) {
        // Resolved end frame immediately, then a fast fade.
        setStage('online');
        setLines(LINES.length);
        push(finish, 900);
      } else {
        // Cold field → core settles → reticle → readout → online → hold → away.
        push(() => setStage('reticle'), 1150);
        push(() => setStage('readout'), 1850);
        [0, 1, 2, 3].forEach((n, k) => push(() => setLines(n + 1), 1950 + k * 260));
        push(() => {
          setStage('online');
          setLines(LINES.length);
        }, 3150);
        push(finish, 4050);
      }
    };
    let idle = 0;
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(kick, { timeout: 1600 });
    } else {
      list.push(setTimeout(kick, 300));
    }
    return () => {
      if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      list.forEach(clearTimeout);
    };
  }, [reduced]);

  // Skip on any key or click while the splash is up.
  useEffect(() => {
    if (!active || stage === 'gone') return;
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [active, stage]);

  if (!active || stage === 'gone') return null;

  const reticleClosed = stage === 'reticle' || stage === 'readout' || stage === 'online';
  const online = stage === 'online';

  return (
    <div
      role="status"
      aria-label="MCPwn booting"
      className={
        'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-base transition-opacity duration-[400ms] ease-out ' +
        (fading ? 'opacity-0' : 'opacity-100 motion-safe:animate-[splash-in_320ms_ease-out]')
      }
    >
      {/* Core + reticle */}
      <div className="relative h-[240px] w-[240px]">
        {!reduced && webgl && desktop ? (
          <SplashCore />
        ) : (
          // Static resolved core frame (reduced-motion / no-WebGL).
          <svg viewBox="0 0 240 240" className="h-full w-full" aria-hidden="true">
            <g fill="none" stroke="var(--status-nominal)" strokeWidth="1">
              <circle cx="120" cy="120" r="46" opacity="0.5" />
              <circle cx="120" cy="120" r="28" opacity="0.8" />
              <path d="M120 74l40 23v46l-40 23-40-23V97z" opacity="0.6" />
            </g>
          </svg>
        )}
        {/* Reticle draws closed */}
        <svg
          viewBox="0 0 240 240"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <circle
            cx="120"
            cy="120"
            r="104"
            fill="none"
            stroke="var(--status-nominal)"
            strokeWidth="1.2"
            strokeDasharray="653"
            strokeDashoffset={reticleClosed ? 0 : 653}
            style={{ transition: 'stroke-dashoffset 700ms ease-out', opacity: 0.7 }}
            transform="rotate(-90 120 120)"
          />
          {[0, 90, 180, 270].map((a) => (
            <line
              key={a}
              x1="120"
              y1="12"
              x2="120"
              y2="26"
              stroke="var(--status-nominal)"
              strokeWidth="1.2"
              opacity={reticleClosed ? 0.8 : 0}
              style={{ transition: 'opacity 500ms ease-out' }}
              transform={`rotate(${a} 120 120)`}
            />
          ))}
        </svg>
      </div>

      {/* Five-line readout */}
      <dl className="mt-8 w-full max-w-[440px] px-6 font-mono text-[13px] leading-relaxed text-nominal">
        {LINES.map((ln, i) => {
          const shown = i < lines || (online && i === LINES.length - 1);
          const isTitle = i === 0;
          const isOnline = i === LINES.length - 1;
          return (
            <div
              key={ln.label}
              className={
                'flex items-baseline gap-2 transition-opacity duration-300 ' +
                (shown ? 'opacity-100' : 'opacity-0')
              }
            >
              <dt
                className={
                  isTitle || isOnline
                    ? 'tracking-[0.18em] text-readout'
                    : 'shrink-0 tracking-[0.08em] text-ink-faint'
                }
              >
                {ln.label}
              </dt>
              {ln.value && (
                <>
                  <span aria-hidden="true" className="min-w-0 flex-1 truncate text-line-em">
                    ································································
                  </span>
                  <dd className="shrink-0 text-readout">{ln.value}</dd>
                </>
              )}
            </div>
          );
        })}
      </dl>

      <button
        type="button"
        onClick={finish}
        className="mt-8 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-faint transition-colors hover:border-line-em hover:text-ink"
      >
        Skip
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
