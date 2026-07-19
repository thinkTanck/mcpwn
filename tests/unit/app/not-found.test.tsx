import { render, screen } from '@testing-library/react';
import NotFound from '@/app/not-found';

/**
 * Custom 404. It renders without the command deck, so its whole job is to name
 * the dead end and carry the user back into the app — the wayfinding links are
 * the contract worth locking.
 */
describe('NotFound (custom 404)', () => {
  it('names the dead end with a page heading', () => {
    render(<NotFound />);
    expect(
      screen.getByRole('heading', { level: 1, name: /nothing at this address/i }),
    ).toBeInTheDocument();
  });

  it('carries wayfinding back into the app (home, sample, connect)', () => {
    render(<NotFound />);
    const nav = screen.getByRole('navigation', { name: /where to next/i });
    const links = Object.fromEntries(
      screen.getAllByRole('link').map((a) => [a.getAttribute('href'), a] as const),
    );
    expect(nav).toBeInTheDocument();
    expect(links['/']).toBeTruthy();
    expect(links['/runs/sample']).toBeTruthy();
    expect(links['/connect']).toBeTruthy();
  });
});
