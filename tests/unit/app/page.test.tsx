import { render, screen } from '@testing-library/react';
import Home from '@/app/(hud)/page';

describe('Home (placeholder)', () => {
  it('renders the level-1 MCPwn heading', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1, name: 'MCPwn' })).toBeInTheDocument();
  });

  it('shows the bring-your-own-agent eyebrow', () => {
    render(<Home />);
    expect(screen.getByText(/bring your own mcp agent/i)).toBeInTheDocument();
  });
});
