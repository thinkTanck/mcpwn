import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectScreen } from '@/components/connect/ConnectScreen';

/**
 * Connect / Run Setup — the targeting console, redesigned for the inverted model
 * ([ADR-0006](docs/adr/0006-mcpwn-is-the-mcp-server.md)). The console picks ONE
 * Core-7 category, because one run serves one attack surface, and then either
 * plays that category's recorded sample or hands the live console the category
 * its endpoint will serve.
 *
 * The detector is stated BLIND · LOCKED as a FACT, never as a control that looks
 * like it might one day be switchable.
 */

const goLive = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /LIVE · your agent connects to us/i }));

describe('ConnectScreen · mode', () => {
  it('exposes SAMPLE and LIVE as aria-pressed tabs, SAMPLE selected by default', () => {
    render(<ConnectScreen />);

    expect(screen.getByRole('button', { name: /SAMPLE · no sign-in/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: /LIVE · your agent connects to us/i }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the no-sign-in distinction on the sample tab itself', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn={false} />);

    expect(screen.getByText(/sample playback needs no sign-in/i)).toBeInTheDocument();
    await goLive(user);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
  });
});

describe('ConnectScreen · detector', () => {
  it('states BLIND and LOCKED as a fact, with no control implying a future toggle', () => {
    const { container } = render(<ConnectScreen />);

    expect(screen.getByText('BLIND')).toBeInTheDocument();
    expect(screen.getByText('LOCKED')).toBeInTheDocument();
    expect(screen.getByText(/never user-swappable/i)).toBeInTheDocument();
    // No disabled control anywhere: a greyed-out picker would promise a choice.
    expect(container.querySelector('[disabled]')).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });
});

describe('ConnectScreen · one Core-7 category per run', () => {
  const CORE7: [string, string][] = [
    ['ASI01', 'Agent Goal Hijack'],
    ['ASI02', 'Tool Misuse and Exploitation'],
    ['ASI03', 'Identity and Privilege Abuse'],
    ['ASI04', 'Agentic Supply Chain Vulnerabilities'],
    ['ASI05', 'Unexpected Code Execution (RCE)'],
    ['ASI06', 'Memory & Context Poisoning'],
    ['ASI10', 'Rogue Agents'],
  ];

  it('offers the seven categories as a single-choice radio group', () => {
    render(<ConnectScreen />);

    expect(screen.getByRole('radiogroup', { name: /attack category/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    for (const [id, title] of CORE7) {
      expect(
        screen.getByRole('radio', {
          name: new RegExp(`${id}.*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
        }),
      ).toBeInTheDocument();
    }
  });

  it('selects exactly one at a time, starting on the recorded sample category', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen />);

    expect(screen.getByRole('radio', { name: /ASI06/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: /ASI01/ }));
    expect(screen.getByRole('radio', { name: /ASI01/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /ASI06/ })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('ConnectScreen · sample mode', () => {
  it('plays the recorded run for the chosen category', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen sampleRunIds={{ ASI06: 'sample-asi06', ASI01: 'sample-asi01' }} />);

    expect(screen.getByRole('link', { name: /play sample run/i })).toHaveAttribute(
      'href',
      '/runs/sample-asi06',
    );
    await user.click(screen.getByRole('radio', { name: /ASI01/ }));
    expect(screen.getByRole('link', { name: /play sample run/i })).toHaveAttribute(
      'href',
      '/runs/sample-asi01',
    );
  });

  it('falls back to the canonical sample route when no id was resolved', () => {
    render(<ConnectScreen />);

    expect(screen.getByRole('link', { name: /play sample run/i })).toHaveAttribute(
      'href',
      '/runs/sample',
    );
  });

  it('labels the sample as a constructed demonstration rather than a captured run', () => {
    render(<ConnectScreen sampleProvenance="constructed demonstration · recorded verdict" />);

    expect(screen.getByText('constructed demonstration · recorded verdict')).toBeInTheDocument();
  });

  it('offers no model picker, because a recording has one model and it is not a choice', () => {
    render(<ConnectScreen />);

    expect(screen.queryByRole('radiogroup', { name: /demo agent/i })).not.toBeInTheDocument();
  });
});

describe('ConnectScreen · the retired outbound model is gone', () => {
  it('asks for no agent endpoint and no API key in either mode', async () => {
    const user = userEvent.setup();
    const { container } = render(<ConnectScreen signedIn />);

    await goLive(user);

    expect(screen.queryByLabelText(/mcp endpoint/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).not.toMatch(/never stored/i);
    expect(container.textContent).not.toMatch(/coming soon/i);
  });
});
