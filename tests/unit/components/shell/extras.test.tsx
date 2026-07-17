import { render, screen } from '@testing-library/react';
import { ModeBadge } from '@/components/shell/ModeBadge';
import { stepColorToken } from '@/lib/hud/trace-view';
import RunReplay from '@/app/(hud)/runs/[id]/page';

describe('ModeBadge', () => {
  it('names SAMPLE by default and LIVE when live', () => {
    const { rerender } = render(<ModeBadge />);
    expect(screen.getByText('SAMPLE')).toBeInTheDocument();
    rerender(<ModeBadge mode="live" />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});

describe('trace-view step colours', () => {
  it('maps the reasoning tiers', () => {
    expect(stepColorToken('agent_reasoning')).toContain('--text-muted');
    expect(stepColorToken('tool_result')).toContain('--status-nominal');
    expect(stepColorToken('memory_read')).toContain('--line-emphasis');
  });
});

describe('runs/[id] replay placeholder', () => {
  it('renders the run id inside a labelled replay region', async () => {
    const ui = await RunReplay({ params: Promise.resolve({ id: 'asi06-run' }) });
    render(ui);
    expect(screen.getByRole('region', { name: 'Live Attack Replay' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /asi06-run/ })).toBeInTheDocument();
  });
});
