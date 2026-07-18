import { render, screen } from '@testing-library/react';
import { NavLink } from '@/components/shell/NavLink';
import { NAV_ITEMS } from '@/components/shell/nav-items';

// Mock next/link so the `prefetch` prop is reflected into the DOM and assertable.
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }: Record<string, unknown>) => (
    <a
      href={typeof href === 'string' ? href : '#'}
      data-prefetch={String(prefetch)}
      {...(rest as object)}
    >
      {children as React.ReactNode}
    </a>
  ),
}));

describe('command-deck nav availability', () => {
  it('marks the built routes (Home, Connect, Live Replay) as available', () => {
    const built = NAV_ITEMS.filter((i) => i.available).map((i) => i.href);
    expect(built).toEqual(['/', '/connect', '/runs/sample']);
  });

  it('disables prefetch on not-yet-built routes so they do not RSC-404 on load', () => {
    const leaderboard = NAV_ITEMS.find((i) => i.href === '/leaderboard')!;
    render(<NavLink item={leaderboard} pathname="/" />);
    expect(screen.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute(
      'data-prefetch',
      'false',
    );
  });

  it('leaves prefetch at the framework default for built routes', () => {
    const home = NAV_ITEMS.find((i) => i.href === '/')!;
    render(<NavLink item={home} pathname="/leaderboard" />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'data-prefetch',
      'undefined',
    );
  });
});
