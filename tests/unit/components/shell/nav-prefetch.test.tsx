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
  it('marks the built routes as available', () => {
    const built = NAV_ITEMS.filter((i) => i.available).map((i) => i.href);
    expect(built).toEqual(['/', '/connect', '/runs/sample', '/leaderboard', '/findings/asi06-run']);
  });

  it('disables prefetch on a not-yet-built route so it does not RSC-404 on load', () => {
    // Tests NavLink's contract for an unbuilt destination. Every deck route is
    // built today, so this uses a synthetic unavailable item (the next such route
    // is Threats).
    const unbuilt = {
      ...NAV_ITEMS[0]!,
      label: 'Threats',
      href: '/threats',
      matchPrefix: '/threats',
      available: false,
    };
    render(<NavLink item={unbuilt} pathname="/" />);
    expect(screen.getByRole('link', { name: 'Threats' })).toHaveAttribute('data-prefetch', 'false');
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
