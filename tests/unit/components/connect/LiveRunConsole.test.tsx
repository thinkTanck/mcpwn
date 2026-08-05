import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveRunConsole } from '@/components/connect/LiveRunConsole';
import type {
  ConnectLiveRunPort,
  LiveRunStateView,
  LiveRunTicketView,
} from '@/components/connect/live-run-port';

/**
 * THE LIVE CONSOLE under the inverted model (ADR-0006): we host the MCP endpoint
 * and the user's agent connects to US. So this panel ISSUES a per-run endpoint
 * and token, explains how the task goal travels out of band, and then WAITS on
 * state the server really observed.
 *
 * Three things this suite exists to hold down:
 *   1. the token is a secret shown once — masked by default, copyable, and never
 *      handed to anything that persists it;
 *   2. a refusal is calm, typed, and quotes no numeral the screen authored;
 *   3. a state we cannot observe is never drawn as if we could.
 */

const TICKET: LiveRunTicketView = {
  runId: 'run-77',
  endpoint: 'https://mcpwn.dev/api/mcp/run-77',
  token: `mcpwn_rt_${'a'.repeat(32)}_${'b'.repeat(64)}`,
  expiresAt: '2026-08-05T12:00:00.000Z',
  category: 'ASI01',
  promptName: 'session_brief',
  taskGoal: 'Clear the finance inbox and act on anything that needs a reply.',
};

const AWAITING: LiveRunStateView = {
  runId: 'run-77',
  phase: 'awaiting_agent',
  steps: 0,
  observedAt: '2026-08-05T11:00:00.000Z',
  resultRunId: null,
};

function portWith(overrides: Partial<ConnectLiveRunPort> = {}): ConnectLiveRunPort {
  return {
    start: vi.fn(async () => ({ ok: true as const, value: TICKET })),
    readState: vi.fn(async () => ({ ok: true as const, value: AWAITING })),
    ...overrides,
  };
}

/** Refuse both calls with one code + sentence, the way a gate does. */
function refusingPort(code: string, message: string): ConnectLiveRunPort {
  const refusal = { ok: false as const, refusal: { code: code as never, message } };
  return { start: vi.fn(async () => refusal), readState: vi.fn(async () => refusal) };
}

const issue = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /issue run endpoint/i }));

function stubClipboard() {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('LiveRunConsole · the inverted model, stated on the screen', () => {
  it('says WE host the endpoint and the agent connects to us, before anything is issued', () => {
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);

    expect(screen.getByText(/point your agent at an endpoint we host/i)).toBeInTheDocument();
    // The retired model must not survive anywhere in the copy.
    expect(document.body.textContent).not.toMatch(/your agent's (endpoint|api key)/i);
  });

  it('asks for no endpoint, no key, and offers no field a secret could be pasted into', () => {
    const { container } = render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);

    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).not.toMatch(/never stored/i);
  });

  it('issues for the category the run will actually serve', async () => {
    const user = userEvent.setup();
    const port = portWith();
    render(<LiveRunConsole port={port} category="ASI05" signedIn />);

    await issue(user);

    expect(port.start).toHaveBeenCalledWith({ category: 'ASI05' });
  });
});

describe('LiveRunConsole · the per-run token is a secret shown once', () => {
  it('shows the endpoint in full and keeps the token masked until it is revealed', async () => {
    const user = userEvent.setup();
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);
    await issue(user);

    expect(await screen.findByText(TICKET.endpoint)).toBeInTheDocument();
    expect(screen.queryByText(TICKET.token)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reveal run token/i }));

    expect(screen.getByText(TICKET.token)).toBeInTheDocument();
  });

  it('copies the real token even while it is masked', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);
    await issue(user);
    await screen.findByText(TICKET.endpoint);

    await user.click(screen.getByRole('button', { name: /copy run token/i }));

    expect(writeText).toHaveBeenCalledWith(TICKET.token);
  });

  it('says the token is shown once and states what a leaked one is worth', async () => {
    const user = userEvent.setup();
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);
    await issue(user);
    await screen.findByText(TICKET.endpoint);

    expect(screen.getByText(/shown once/i)).toBeInTheDocument();
    expect(screen.getByText(/hostile by design/i)).toBeInTheDocument();
  });

  it('never puts the token anywhere the browser would keep it', async () => {
    const user = userEvent.setup();
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);
    await issue(user);
    await screen.findByText(TICKET.endpoint);
    await user.click(screen.getByRole('button', { name: /reveal run token/i }));

    // No form control (autofill, password managers), no storage, no URL.
    expect(document.querySelector('input')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
    expect(window.localStorage.getItem('token')).toBeNull();
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(TICKET.token);
    expect(window.location.href).not.toContain(TICKET.token);
  });
});

describe('LiveRunConsole · the task goal travels out of band', () => {
  it('names the published prompt first and says why the goal cannot be pushed', async () => {
    const user = userEvent.setup();
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);
    await issue(user);
    await screen.findByText(TICKET.endpoint);

    expect(screen.getByText('session_brief')).toBeInTheDocument();
    expect(
      screen.getByText(/MCP has no message that lets a server tell an agent what its job is/i),
    ).toBeInTheDocument();
  });

  it('always offers the paste fallback with the exact goal text, copyable', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);
    await issue(user);
    await screen.findByText(TICKET.endpoint);

    expect(screen.getByText(TICKET.taskGoal)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /copy task goal/i }));

    expect(writeText).toHaveBeenCalledWith(TICKET.taskGoal);
  });
});

describe('LiveRunConsole · real connection state, and only real connection state', () => {
  it('reads the run state as soon as the endpoint is issued', async () => {
    const user = userEvent.setup();
    const port = portWith();
    render(<LiveRunConsole port={port} category="ASI01" signedIn />);
    await issue(user);

    await waitFor(() => expect(port.readState).toHaveBeenCalledWith({ runId: 'run-77' }));
  });

  it('says nothing has connected yet, rather than implying progress', async () => {
    const user = userEvent.setup();
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);
    await issue(user);

    expect(await screen.findByText(/no agent has connected yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('reports the recorded step count the server observed, as evidence', async () => {
    const user = userEvent.setup();
    const port = portWith({
      readState: vi.fn(async () => ({
        ok: true as const,
        value: { ...AWAITING, phase: 'recording' as const, steps: 6 },
      })),
    });
    render(<LiveRunConsole port={port} category="ASI01" signedIn />);
    await issue(user);

    expect(await screen.findByText('6')).toBeInTheDocument();
    expect(screen.getByText(/steps recorded/i)).toBeInTheDocument();
  });

  it('states plainly that reasoning is not observable and is never invented', async () => {
    const user = userEvent.setup();
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);
    await issue(user);
    await screen.findByText(/no agent has connected yet/i);

    expect(screen.getByText(/we record what your agent does, not what it thinks/i)).toBeVisible();
  });

  it('hands off to the replay once the run has really finished', async () => {
    const user = userEvent.setup();
    const port = portWith({
      readState: vi.fn(async () => ({
        ok: true as const,
        value: {
          ...AWAITING,
          phase: 'finished' as const,
          steps: 11,
          resultRunId: 'run-77',
        },
      })),
    });
    render(<LiveRunConsole port={port} category="ASI01" signedIn />);
    await issue(user);

    expect(await screen.findByRole('link', { name: /open the replay/i })).toHaveAttribute(
      'href',
      '/runs/run-77',
    );
  });

  it('offers no replay link while the run is still open', async () => {
    const user = userEvent.setup();
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn />);
    await issue(user);
    await screen.findByText(/no agent has connected yet/i);

    expect(screen.queryByRole('link', { name: /open the replay/i })).not.toBeInTheDocument();
  });
});

describe('LiveRunConsole · refusals fail closed and say so calmly', () => {
  it('states an exhausted allowance in the words the server derived from config', async () => {
    const user = userEvent.setup();
    const sentence =
      'You have used 3 free live runs on this account. Sample playback stays open to everyone.';
    render(
      <LiveRunConsole
        port={refusingPort('ALLOWANCE_EXHAUSTED', sentence)}
        category="ASI01"
        signedIn
      />,
    );

    await issue(user);

    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.getByText('FREE LIVE RUNS USED')).toBeInTheDocument();
  });

  it('states a tripped spend cap without ever quoting a number', async () => {
    const user = userEvent.setup();
    const sentence = 'Live runs are paused for now. Sample playback stays open to everyone.';
    render(
      <LiveRunConsole
        port={refusingPort('SPEND_CAP_REACHED', sentence)}
        category="ASI01"
        signedIn
      />,
    );

    await issue(user);

    const heading = await screen.findByText('LIVE RUNS PAUSED');
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).not.toMatch(/\d/);
  });

  it('states an unreadable gate as its own fact, not as being out of runs', async () => {
    const user = userEvent.setup();
    const sentence =
      'We could not check your run allowance just now, so this run did not go ahead. ' +
      'Please try again in a moment.';
    render(
      <LiveRunConsole
        port={refusingPort('GATE_UNAVAILABLE', sentence)}
        category="ASI01"
        signedIn
      />,
    );

    await issue(user);

    expect(await screen.findByText('ALLOWANCE CHECK UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText(sentence)).toBeInTheDocument();
  });

  it('issues nothing when a run is refused', async () => {
    const user = userEvent.setup();
    render(
      <LiveRunConsole
        port={refusingPort('SPEND_CAP_REACHED', 'Paused.')}
        category="ASI01"
        signedIn
      />,
    );

    await issue(user);
    await screen.findByText('LIVE RUNS PAUSED');

    expect(screen.queryByRole('button', { name: /copy run token/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy run endpoint/i })).not.toBeInTheDocument();
  });

  it('keeps the sample route open from inside a refusal', async () => {
    const user = userEvent.setup();
    render(
      <LiveRunConsole
        port={refusingPort('ALLOWANCE_EXHAUSTED', 'Used up.')}
        category="ASI01"
        signedIn
      />,
    );

    await issue(user);

    expect(await screen.findByRole('link', { name: /sample run/i })).toHaveAttribute(
      'href',
      '/runs/sample',
    );
  });
});

describe('LiveRunConsole · the sign-in gate', () => {
  it('offers no issue control at all when signed out', () => {
    render(<LiveRunConsole port={portWith()} category="ASI01" signedIn={false} />);

    expect(screen.queryByRole('button', { name: /issue run endpoint/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
  });
});
