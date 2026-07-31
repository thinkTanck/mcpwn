import { render, screen, act } from '@testing-library/react';
import { SentinelCore } from '@/components/hud';

/**
 * SentinelCore is the only unbounded animation loop in the app, and it sits on
 * Home — the one page the Lighthouse CWV gate measures. Its first implementation
 * drew 520 canvas arcs per frame, each with `ctx.shadowBlur` (a gaussian blur
 * per fill). Under Lighthouse's 4x CPU throttling every frame became a >50ms
 * long task, so the main thread never reached the 5s quiet window Lighthouse
 * needs for Time to Interactive: TBT and TTI errored out (NO_TTI_CPU_IDLE_PERIOD)
 * and the whole performance category scored `null` in some runs. Measured on
 * Home, n=7 before vs n=7 after: performance p75 0.81 (2 runs null) -> 0.915
 * (zero null), TBT p75 637ms -> 215ms, TTI p75 12.4s -> 3.3s.
 *
 * These are executable frame-budget invariants, not style preferences. They are
 * what keeps the CWV gate from going back to a coin flip.
 */

type Call = { op: string; args: unknown[] };

/** A recording stand-in for CanvasRenderingContext2D (jsdom has no canvas). */
function recordingContext() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };
  const ctx = {
    calls,
    state,
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    arc: record('arc'),
    fill: record('fill'),
    fillRect: record('fillRect'),
    set fillStyle(v: unknown) {
      state.fillStyle = v;
      calls.push({ op: 'set:fillStyle', args: [v] });
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set globalAlpha(v: unknown) {
      state.globalAlpha = v;
      calls.push({ op: 'set:globalAlpha', args: [v] });
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set shadowBlur(v: unknown) {
      state.shadowBlur = v;
      calls.push({ op: 'set:shadowBlur', args: [v] });
    },
    get shadowBlur() {
      return state.shadowBlur;
    },
    set shadowColor(v: unknown) {
      state.shadowColor = v;
      calls.push({ op: 'set:shadowColor', args: [v] });
    },
    get shadowColor() {
      return state.shadowColor;
    },
  };
  return ctx;
}

type Ctx = ReturnType<typeof recordingContext>;

let ctx: Ctx;
/** Pending rAF callbacks by handle — cancellation is modelled, not stubbed away. */
let frames: Map<number, FrameRequestCallback>;
let nextHandle: number;

beforeEach(() => {
  ctx = recordingContext();
  frames = new Map();
  nextHandle = 1;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const handle = nextHandle++;
    frames.set(handle, cb);
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames.delete(handle);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Run the frames the component has queued so far (one animation tick). */
function tick(time: number) {
  const queued = [...frames];
  act(() => {
    for (const [handle, cb] of queued) {
      frames.delete(handle);
      cb(time);
    }
  });
}

describe('SentinelCore', () => {
  it('exposes an accessible image name and survives a canvas-less environment', () => {
    render(<SentinelCore size={120} label="Sentinel core" />);
    expect(screen.getByRole('img', { name: 'Sentinel core' })).toBeInTheDocument();
  });

  it('batches its points into a bounded number of fills instead of one per point', () => {
    render(<SentinelCore size={120} />);
    tick(0);

    const arcs = ctx.calls.filter((c) => c.op === 'arc').length;
    const fills = ctx.calls.filter((c) => c.op === 'fill').length;

    // The sphere still has its full point density...
    expect(arcs).toBeGreaterThanOrEqual(500);
    // ...but a frame costs a bounded number of draw calls, not one per point.
    expect(fills).toBeLessThanOrEqual(32);
  });

  it('starts a fresh subpath per point, so a batch draws discs and not streaks', () => {
    render(<SentinelCore size={120} />);
    tick(0);

    // Consecutive arc() calls in one path are joined by a connecting line, so a
    // batch without a moveTo per point fills as streaks across the sphere.
    const moveTos = ctx.calls.filter((c) => c.op === 'moveTo').length;
    const arcs = ctx.calls.filter((c) => c.op === 'arc').length;
    expect(moveTos).toBe(arcs);
  });

  it('never enables canvas shadow blur (a per-fill gaussian blur, 500+ times a frame)', () => {
    render(<SentinelCore size={120} />);
    tick(0);

    const blurs = ctx.calls.filter((c) => c.op === 'set:shadowBlur').map((c) => Number(c.args[0]));
    expect(blurs.every((v) => v === 0)).toBe(true);
  });

  it('paints from the DTCG status tokens, never hardcoded channel literals', () => {
    render(<SentinelCore size={120} />);
    tick(0);

    const styles = ctx.calls.filter((c) => c.op === 'set:fillStyle').map((c) => String(c.args[0]));
    expect(styles.length).toBeGreaterThan(0);
    // getComputedStyle in jsdom resolves custom properties to '' — the component
    // must fall back to a var() reference, never to inlined rgb/hex channels.
    for (const s of styles) {
      expect(s).not.toMatch(/rgba?\(\s*\d/);
      expect(s).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it('stops animating while the document is hidden, and resumes when it returns', () => {
    render(<SentinelCore size={120} />);
    tick(0);
    expect(frames.size).toBe(1); // a live loop keeps one frame pending

    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(frames.size).toBe(0); // the pending frame is cancelled, none rescheduled

    spy.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(frames.size).toBe(1);

    spy.mockRestore();
  });

  it('paints exactly one static frame under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<SentinelCore size={120} />);
    expect(ctx.calls.filter((c) => c.op === 'clearRect').length).toBe(1);
    expect(frames.size).toBe(0);
  });
});
