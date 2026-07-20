'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';

const SEEN_KEY = 'mcpwn.boot.v1.seen';

// The five-line boot readout (Core-7).
const LINES: { label: string; value?: string }[] = [
  { label: 'SENTINEL FIELDS' },
  { label: 'DETECTOR', value: 'BLIND · LOCKED' },
  { label: 'CORE-7 SIGNATURES', value: 'ASI01 · 02 · 03 · 04 · 05 · 06 · 10' },
  { label: 'CALIBRATION', value: 'MEASURED · LEAKAGE-SEPARATED' },
  { label: 'SYSTEM ONLINE' },
];

type Stage = 'field' | 'reticle' | 'readout' | 'online' | 'gone';

/**
 * First-visit boot splash. A fade-OVER reveal, not a gate: it mounts only after
 * hydration (absent from SSR) so Home paints underneath and LCP is never blocked.
 * ~4s, completion-paced: cold field → the wireframe core assembles and idles →
 * the reticle draws closed → the five-line readout resolves → SYSTEM ONLINE +
 * hold → the overlay eases away to Home. Skippable (SKIP / click / any key).
 * `prefers-reduced-motion` jumps straight to the resolved end frame and fades
 * fast. CYAN ONLY — a boot screen is nominal. Shown once, then persisted.
 *
 * The core is SVG + CSS only (no WebGL): a wireframe sentinel that scales/fades up
 * and idle-spins, so the splash carries no 3D dependency.
 */
export function BootSplash() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(false); // decided on the client (first-visit)
  const [stage, setStage] = useState<Stage>('field');
  const [lines, setLines] = useState(0);
  const [fading, setFading] = useState(false);
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
    const list = timers.current;
    const push = (fn: () => void, ms: number) => list.push(setTimeout(fn, ms));

    // Kick when the browser is IDLE (after Home's critical render + LCP), so the
    // fade-over never competes with first paint.
    const kick = () => {
      setActive(true);
      if (reduced) {
        setStage('online');
        setLines(LINES.length);
        push(finish, 900);
      } else {
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

  // Skip on any key or click while the splash is up. Keydown is immediate; the
  // click-anywhere skip is armed ~600ms later so an accidental early tap does not
  // cut the intro before the trust lines land (the SKIP button is always live).
  // A Tab press also dismisses, so focus can never wander to Home behind the
  // overlay — no separate focus trap is needed for this transient screen.
  useEffect(() => {
    if (!active || stage === 'gone') return;
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    const arm = setTimeout(() => window.addEventListener('pointerdown', skip), 600);
    return () => {
      clearTimeout(arm);
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
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-base transition-opacity duration-[400ms] ease-out',
        fading ? 'opacity-0' : 'opacity-100 motion-safe:animate-[splash-in_320ms_ease-out]',
      )}
    >
      {/* Core + reticle */}
      <div className="relative h-[240px] w-[240px]">
        {/* Wireframe sentinel core — assembles (scale/fade) then idle-spins. */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center',
            !reduced && 'motion-safe:animate-[boot-assemble_1000ms_cubic-bezier(.2,0,0,1)_both]',
          )}
        >
          <svg
            viewBox="0 0 240 240"
            aria-hidden="true"
            className={cn(
              'h-[150px] w-[150px]',
              !reduced && 'motion-safe:animate-[spin_18s_linear_infinite]',
            )}
          >
            <g fill="none" stroke="var(--status-nominal)">
              <circle cx="120" cy="120" r="60" strokeWidth="1" opacity="0.45" />
              <circle cx="120" cy="120" r="38" strokeWidth="1" opacity="0.8" />
              <path d="M120 60l52 30v60l-52 30-52-30V90z" strokeWidth="1" opacity="0.6" />
              <path
                d="M68 90l52 30 52-30 M120 120v60"
                strokeWidth="0.8"
                opacity="0.3"
                strokeLinejoin="round"
              />
            </g>
            <circle cx="120" cy="120" r="3.2" fill="var(--status-nominal)" />
          </svg>
        </div>

        {/* Reticle draws closed. */}
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
          {[0, 90, 180, 270].map((deg) => (
            <line
              key={deg}
              x1="120"
              y1="12"
              x2="120"
              y2="26"
              stroke="var(--status-nominal)"
              strokeWidth="1.2"
              opacity={reticleClosed ? 0.8 : 0}
              style={{ transition: 'opacity 500ms ease-out' }}
              transform={`rotate(${deg} 120 120)`}
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
              className={cn(
                'flex flex-col gap-0.5 transition-opacity duration-300 sm:flex-row sm:items-baseline sm:gap-2',
                shown ? 'opacity-100' : 'opacity-0',
              )}
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
                  {/* Dot leader: desktop only (stacks on mobile so the value never
                      clips), and ink-faint so it clears AA even as pure decoration. */}
                  <span
                    aria-hidden="true"
                    className="hidden min-w-0 flex-1 truncate text-ink-faint sm:block"
                  >
                    ································································
                  </span>
                  <dd className="text-readout sm:shrink-0">{ln.value}</dd>
                </>
              )}
            </div>
          );
        })}
      </dl>

      <button
        type="button"
        onClick={finish}
        className="mt-8 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line px-3 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-faint transition-colors hover:border-line-em hover:text-ink"
      >
        Skip
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
