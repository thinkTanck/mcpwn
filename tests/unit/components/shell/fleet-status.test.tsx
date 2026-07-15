import { render, screen, within } from '@testing-library/react';
import { FleetStatus } from '@/components/shell/FleetStatus';
import type { FleetStatus as FleetStatusData } from '@/data/source';

const sample: FleetStatusData = {
  source: 'sample',
  nominal: 4,
  caution: 7,
  breach: 4,
  total: 15,
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
    expect(within(region).getByText('7 caution')).toBeInTheDocument();
    expect(within(region).getByText('4 breach')).toBeInTheDocument();
    expect(within(region).getByText('sample')).toBeInTheDocument();
  });

  it('shows a dimmed empty state when there are no runs', () => {
    render(<FleetStatus fleet={empty} />);
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
    expect(screen.getByText('measured')).toBeInTheDocument();
  });

  it('dots variant exposes the full tally as an accessible image name', () => {
    render(<FleetStatus fleet={sample} variant="dots" />);
    expect(
      screen.getByRole('img', { name: /4 nominal · 7 caution · 4 breach/ }),
    ).toBeInTheDocument();
  });
});
