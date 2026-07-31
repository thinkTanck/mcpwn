import { render, screen, within } from '@testing-library/react';
import { FleetStatus } from '@/components/shell/FleetStatus';
import type { FleetStatus as FleetStatusData } from '@/data/source';

const sample: FleetStatusData = {
  source: 'sample',
  nominal: 4,
  caution: 11,
  breach: 6,
  total: 21,
  empty: false,
};
const empty: FleetStatusData = {
  source: 'measured',
  nominal: 0,
  caution: 0,
  breach: 0,
  total: 0,
  empty: true,
};

describe('FleetStatus', () => {
  it('names each tri-state tier with its count (never color-only) + a provenance chip', () => {
    render(<FleetStatus fleet={sample} />);
    const region = screen.getByRole('region', { name: 'Fleet status' });
    expect(within(region).getByText('4 nominal')).toBeInTheDocument();
    expect(within(region).getByText('11 caution')).toBeInTheDocument();
    expect(within(region).getByText('6 breach')).toBeInTheDocument();
    expect(within(region).getByText('sample')).toBeInTheDocument();
  });

  it('shows a quiet empty state when there are no runs', () => {
    render(<FleetStatus fleet={empty} />);
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
    expect(screen.getByText('measured')).toBeInTheDocument();
  });

  /**
   * REGRESSION GUARD. The empty state used to be quieted with `opacity-50` on the
   * whole <section>. That composited --text-faint (5.3:1) down to ~2.1:1 on the
   * deck backdrop, under even the 3:1 large-text floor, and it dimmed the FLEET
   * STATUS label and the provenance chip too, because the header sits outside the
   * empty branch. Quiet must come from the AA-safe --status-inert token, never
   * from an opacity multiplier that silently voids the token's contrast contract.
   */
  it('quiets the empty state with the inert token, never a blanket opacity', () => {
    render(<FleetStatus fleet={empty} />);
    const region = screen.getByRole('region', { name: 'Fleet status' });
    expect(region.className).not.toMatch(/\bopacity-/);

    // The sentence carries the inert colour explicitly.
    expect(screen.getByText(/no runs yet/i)).toHaveStyle({ color: 'var(--status-inert)' });

    // The header row is never dimmed by the empty branch: it is a sibling of it.
    expect(within(region).getByText('measured').className).not.toMatch(/\bopacity-/);
  });

  it('dots variant exposes the full tally as an accessible image name', () => {
    render(<FleetStatus fleet={sample} variant="dots" />);
    expect(
      screen.getByRole('img', { name: /4 nominal · 11 caution · 6 breach/ }),
    ).toBeInTheDocument();
  });
});
