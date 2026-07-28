import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConnectPage from '@/app/(hud)/connect/page';
import { getUser } from '@/lib/auth/user';

vi.mock('@/lib/auth/user', () => ({ getUser: vi.fn() }));
vi.mock('@/app/(hud)/connect/actions', () => ({ launchLiveRun: vi.fn() }));

/**
 * The Connect ROUTE, as opposed to the console component. It previously rendered
 * `<ConnectScreen />` with no props, so `signedIn` defaulted to false and the
 * amber sign-in gate was shown to signed-in users too. The route must thread the
 * real session through.
 */

describe('Connect page · session threading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides the sign-in gate for a signed-in user', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as never);
    const user = userEvent.setup();
    render(await ConnectPage());

    await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
    expect(screen.queryByRole('link', { name: /SIGN IN/i })).not.toBeInTheDocument();
  });

  it('shows the sign-in gate for a signed-out visitor', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const user = userEvent.setup();
    render(await ConnectPage());

    await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
    expect(screen.getByRole('link', { name: /SIGN IN/i })).toHaveAttribute('href', '/sign-in');
  });

  it('reports live runs as not yet enabled while the validated judge is absent', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1' } as never);
    const user = userEvent.setup();
    render(await ConnectPage());

    await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
    expect(screen.getByText(/LIVE RUNS NOT ENABLED YET/)).toBeInTheDocument();
  });
});
