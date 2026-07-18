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

describe('runs/[id] replay', () => {
  it('resolves the run and renders the operable replay bound to the run id', async () => {
    const ui = await RunReplay({ params: Promise.resolve({ id: 'asi06-run' }) });
    render(ui);
    // Run id is surfaced (bound to the record, not a literal).
    expect(screen.getByText('asi06-run')).toBeInTheDocument();
    // The reliable base — the operable step timeline — is present.
    expect(screen.getByRole('list', { name: /step timeline/i })).toBeInTheDocument();
  });
});
