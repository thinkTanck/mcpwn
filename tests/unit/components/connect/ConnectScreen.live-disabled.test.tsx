import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectScreen } from '@/components/connect/ConnectScreen';

/**
 * INTERIM STATE, and the reason matters.
 *
 * ADR-0006 retired the model where the user hands us their agent's endpoint and
 * key. The screen kept asking for both anyway, under the reassurance "Used
 * server-side only, never stored" — a claim about a credential we had decided
 * never to take, on a live page, beside a launch button that does nothing.
 *
 * Soliciting a secret you have no use for is worse than an unbuilt feature,
 * because some people will paste a real key. So the live form is disabled until
 * the Connect reshape lands, which waits on the hypothesis spike. This is
 * deliberately NOT that reshape: it removes the untrue claim and the key prompt,
 * and nothing else.
 */
const goLive = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /live/i }));

describe('ConnectScreen — live mode is interim-disabled', () => {
  it('asks for no MCP endpoint and no API key', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn />);
    await goLive(user);

    expect(screen.queryByLabelText(/mcp endpoint/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    // No password field of any kind: that is what a pasted key would land in.
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('makes no claim about how a credential would be handled', async () => {
    const user = userEvent.setup();
    const { container } = render(<ConnectScreen signedIn />);
    await goLive(user);

    expect(container.textContent).not.toMatch(/never stored/i);
    expect(container.textContent).not.toMatch(/server-side only/i);
  });

  it('says plainly that live red-teaming is not available yet', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn />);
    await goLive(user);

    expect(screen.getByText(/live red-teaming is coming soon/i)).toBeInTheDocument();
  });

  it('offers no launch control that cannot work', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn />);
    await goLive(user);

    expect(screen.queryByRole('button', { name: /launch live run/i })).not.toBeInTheDocument();
  });

  it('still routes to the sample run, which does work', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn />);
    await goLive(user);

    expect(screen.getByRole('link', { name: /sample run/i })).toHaveAttribute(
      'href',
      '/runs/sample',
    );
  });
});

/** The interim disable must not cost the mode that genuinely works. */
describe('ConnectScreen — sample mode still works', () => {
  it('keeps the demo agent picker and the working launch link', () => {
    render(<ConnectScreen signedIn />);

    expect(screen.getByRole('radiogroup', { name: /demo agent/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /play sample run/i })).toHaveAttribute(
      'href',
      '/runs/sample',
    );
  });

  it('still lets a category be toggled off and back on', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn />);

    const asi01 = screen.getByRole('checkbox', { name: /ASI01/i });
    expect(asi01).toBeChecked();
    await user.click(asi01);
    expect(asi01).not.toBeChecked();
    await user.click(asi01);
    expect(asi01).toBeChecked();
  });

  it('comes back intact after a trip through live mode', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn />);

    await goLive(user);
    await user.click(screen.getByRole('button', { name: /sample/i }));

    expect(screen.getByRole('radiogroup', { name: /demo agent/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /play sample run/i })).toBeInTheDocument();
  });
});
