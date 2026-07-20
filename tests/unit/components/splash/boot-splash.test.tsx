import { act, render, screen, within } from '@testing-library/react';
import { BootSplash } from '@/components/splash/BootSplash';

/**
 * Boot splash. In jsdom there is no WebGL and no matchMedia desktop match, so the
 * splash takes the resolved-end-frame path (no r3f). These assertions pin the
 * load-bearing contract: it is absent until the idle kick fires (so Home paints
 * first), it shows the Core-7 readout (corrected from the old Core-5), and it
 * never shows on a repeat visit.
 */
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  // Force the setTimeout fallback so fake timers drive the sequence deterministically.
  // @ts-expect-error — narrowing the capability off for the test env
  delete window.requestIdleCallback;
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('BootSplash', () => {
  it('is absent on first render (Home paints under), then shows the Core-7 readout', () => {
    render(<BootSplash />);
    // Absent until the idle kick — Home is never blocked.
    expect(screen.queryByRole('status', { name: /booting/i })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(320);
    });

    const status = screen.getByRole('status', { name: /mcpwn booting/i });
    expect(within(status).getByText('SENTINEL FIELDS')).toBeInTheDocument();
    expect(within(status).getByText('CORE-7 SIGNATURES')).toBeInTheDocument();
    expect(within(status).getByText('ASI01 · 02 · 03 · 04 · 05 · 06 · 10')).toBeInTheDocument();
    expect(within(status).getByText('MEASURED · LEAKAGE-SEPARATED')).toBeInTheDocument();
    expect(within(status).getByText('SYSTEM ONLINE')).toBeInTheDocument();
    // No stale Core-5 label.
    expect(screen.queryByText(/CORE-5/i)).toBeNull();
  });

  it('never shows on a repeat visit (persisted first-visit flag)', () => {
    localStorage.setItem('mcpwn.boot.v1.seen', '1');
    render(<BootSplash />);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole('status', { name: /booting/i })).toBeNull();
  });
});
