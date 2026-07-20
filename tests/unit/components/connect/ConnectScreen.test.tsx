import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectScreen } from '@/components/connect/ConnectScreen';

/**
 * Connect / Run Setup screen — the targeting console. Asserts the load-bearing
 * behaviour of the frozen Connect design: the SAMPLE↔LIVE mode tabs
 * (`aria-pressed`), the Core-7 category checklist with a live selected count,
 * the masked BYOK key field, the BLIND · LOCKED detector, and the amber
 * sign-in gate that appears only for a live, signed-out run.
 */

describe('ConnectScreen · mode tabs', () => {
  it('exposes SAMPLE/LIVE as aria-pressed tabs, SAMPLE selected by default', () => {
    render(<ConnectScreen />);
    const sample = screen.getByRole('button', { name: /SAMPLE · no key/i });
    const live = screen.getByRole('button', { name: /LIVE · bring your agent/i });
    expect(sample).toHaveAttribute('aria-pressed', 'true');
    expect(live).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to LIVE and reveals the BYOK agent form', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen />);
    // SAMPLE default: no endpoint field yet.
    expect(screen.queryByLabelText(/MCP ENDPOINT/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
    expect(screen.getByRole('button', { name: /LIVE · bring your agent/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /SAMPLE · no key/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByLabelText(/MCP ENDPOINT/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/MODEL ID/i)).toBeInTheDocument();
  });
});

describe('ConnectScreen · BYOK key field', () => {
  it('renders a masked, labelled key input with the server-side-only helper', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen />);
    await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
    const key = screen.getByLabelText(/API KEY \/ TOKEN/i);
    expect(key).toHaveAttribute('type', 'password');
    expect(screen.getByText(/Used server-side only, never stored\./i)).toBeInTheDocument();
  });
});

describe('ConnectScreen · detector', () => {
  it('shows the BLIND · LOCKED detector, never user-swappable', () => {
    render(<ConnectScreen />);
    expect(screen.getByText('BLIND')).toBeInTheDocument();
    expect(screen.getByText('LOCKED')).toBeInTheDocument();
    expect(screen.getByText(/never user-swappable/i)).toBeInTheDocument();
  });
});

describe('ConnectScreen · Core-7 category checklist', () => {
  const CORE7: [string, string][] = [
    ['ASI01', 'Agent Goal Hijack'],
    ['ASI02', 'Tool Misuse and Exploitation'],
    ['ASI03', 'Identity and Privilege Abuse'],
    ['ASI04', 'Agentic Supply Chain Vulnerabilities'],
    ['ASI05', 'Unexpected Code Execution (RCE)'],
    ['ASI06', 'Memory & Context Poisoning'],
    ['ASI10', 'Rogue Agents'],
  ];

  it('lists exactly the seven Core-7 categories as checkboxes with pinned titles', () => {
    render(<ConnectScreen />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(7);
    for (const [id, title] of CORE7) {
      const box = screen.getByRole('checkbox', {
        name: new RegExp(`${id}.*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      });
      expect(box).toBeInTheDocument();
    }
  });

  it('starts with all seven selected and updates the live count when toggled', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen />);
    expect(screen.getByText('7 selected')).toBeInTheDocument();
    const asi01 = screen.getByRole('checkbox', { name: /ASI01/ });
    expect(asi01).toHaveAttribute('aria-checked', 'true');
    await user.click(asi01);
    expect(asi01).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('6 selected')).toBeInTheDocument();
  });
});

describe('ConnectScreen · launch + sign-in gate', () => {
  it('links the sample launch to the replay and labels the live launch by mode', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen />);
    // Sample is a fixed playback: the launch is a link straight to the replay.
    expect(screen.getByRole('link', { name: /PLAY SAMPLE RUN/i })).toHaveAttribute(
      'href',
      '/runs/sample',
    );
    await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
    expect(screen.getByRole('button', { name: /LAUNCH LIVE RUN/i })).toBeInTheDocument();
  });

  it('disables the live launch until endpoint, key, and a category are provided', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn />);
    await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
    const launch = screen.getByRole('button', { name: /LAUNCH LIVE RUN/i });
    expect(launch).toBeDisabled();
    await user.type(screen.getByLabelText(/MCP ENDPOINT/i), 'https://a.example/mcp');
    await user.type(screen.getByLabelText(/API KEY \/ TOKEN/i), 'sk-test');
    expect(launch).toBeEnabled();
  });

  it('shows the amber sign-in gate only when live and signed-out', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn={false} />);
    // SAMPLE mode: no gate.
    expect(screen.queryByRole('link', { name: /SIGN IN/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
    const gate = screen.getByRole('link', { name: /SIGN IN/i });
    expect(gate).toHaveAttribute('href', '/sign-in');
  });

  it('hides the sign-in gate when the user is signed in', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn />);
    await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
    expect(screen.queryByRole('link', { name: /SIGN IN/i })).not.toBeInTheDocument();
  });
});
