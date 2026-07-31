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

    expect(screen.queryByText(/live runs require sign-in/i)).not.toBeInTheDocument();
  });

  it('still gates a signed-out visitor', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);

    render(await ConnectPage());
    await goLive();

    expect(screen.getByText(/live runs require sign-in/i)).toBeInTheDocument();
  });
});
