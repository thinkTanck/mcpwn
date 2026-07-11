import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home (landing page)', () => {
  it('renders the level-1 MCPwn heading', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1, name: 'MCPwn' })).toBeInTheDocument();
  });

  it('shows the CI-first skeleton status readout', () => {
    render(<Home />);
    expect(screen.getByText(/ci-first skeleton/i)).toBeInTheDocument();
  });
});
