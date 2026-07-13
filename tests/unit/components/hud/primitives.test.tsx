import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusChip, Button, SentinelCore, Panel, Readout } from '@/components/hud';

describe('StatusChip', () => {
  it('names the state in text (never color-only) alongside a glyph', () => {
    const { container } = render(<StatusChip state="breach" label="BREACH" />);
    expect(screen.getByText('BREACH')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('is an accessible button (type=button) that fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>LAUNCH</Button>);
    const btn = screen.getByRole('button', { name: 'LAUNCH' });
    expect(btn).toHaveAttribute('type', 'button');
    await user.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Readout', () => {
  it('renders a labelled key/value readout', () => {
    render(<Readout label="category" value="ASI06" />);
    expect(screen.getByText('category')).toBeInTheDocument();
    expect(screen.getByText('ASI06')).toBeInTheDocument();
  });
});

describe('Panel', () => {
  it('renders its children', () => {
    render(
      <Panel>
        <p>inside</p>
      </Panel>,
    );
    expect(screen.getByText('inside')).toBeInTheDocument();
  });
});

describe('SentinelCore', () => {
  it('exposes an accessible image name and survives a canvas-less environment', () => {
    render(<SentinelCore size={120} label="Sentinel core" />);
    expect(screen.getByRole('img', { name: 'Sentinel core' })).toBeInTheDocument();
  });
});
