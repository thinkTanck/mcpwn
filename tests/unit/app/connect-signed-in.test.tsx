import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConnectPage from '@/app/(hud)/connect/page';
import { getUser } from '@/lib/auth/user';

vi.mock('@/lib/auth/user', () => ({ getUser: vi.fn() }));

/**
 * REGRESSION GUARD. The route rendered `<ConnectScreen />` with no props at all,
 * so `signedIn` fell back to its `false` default and the amber sign-in gate was
 * shown to people who were already signed in — a live bug on a shipped screen,
 * caught by the remaining-work audit rather than by a test.
 *
 * The gate only applies to LIVE mode, so each case switches there first; asserting
 * on the default sample view would pass for the wrong reason.
 *
 * The assertion is on the GATE ITSELF — the sign-in route being offered in place
 * of the live console — rather than on a sentence, so the Connect redesign can
 * reword the gate without silently disabling this guard.
 */
describe('Connect page — real session state', () => {
  beforeEach(() => vi.clearAllMocks());

  const goLive = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /live/i }));
  };

  it('drops the sign-in gate for a signed-in visitor', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as never);

    render(await ConnectPage());
    await goLive();

    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
    // The signed-in visitor gets the live console, not the gate.
    expect(screen.getByRole('button', { name: /issue run endpoint/i })).toBeInTheDocument();
  });

  it('still gates a signed-out visitor', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);

    render(await ConnectPage());
    await goLive();

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in');
    expect(screen.queryByRole('button', { name: /issue run endpoint/i })).not.toBeInTheDocument();
  });
});
