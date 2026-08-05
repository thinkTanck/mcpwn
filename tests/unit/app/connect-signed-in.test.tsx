import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConnectPage from '@/app/(hud)/connect/page';
import { startLiveRun } from '@/app/actions/live-run';
import { getUser } from '@/lib/auth/user';

vi.mock('@/lib/auth/user', () => ({ getUser: vi.fn() }));

/**
 * The live-run actions are a `'use server'` module: importing them for real here
 * would drag `next/headers`, Supabase and the whole pipeline into a component
 * test. They are mocked because what this file is testing is the WIRING — that
 * the route binds the real actions to the screen's port — not what the actions
 * themselves do. Those have their own suite.
 */
vi.mock('@/app/actions/live-run', () => ({
  startLiveRun: vi.fn(async () => ({ ok: false, code: 'INVALID_REQUEST', message: 'no' })),
  getLiveRunStatus: vi.fn(async () => ({ ok: false, code: 'RUN_NOT_FOUND', message: 'no' })),
  finishLiveRun: vi.fn(async () => ({ ok: false, code: 'RUN_NOT_FOUND', message: 'no' })),
}));

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

/**
 * THE BINDING ITSELF. The console is coded against a port, and until this route
 * attached the real actions to it the whole live path was inert. This asserts the
 * attachment rather than trusting it: pressing the one control that starts a run
 * must reach `startLiveRun`, with the chosen category and with no account named
 * by the browser.
 */
describe('Connect page — the live-run actions are really bound', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reaches the real startLiveRun action, with the category and no account', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as never);
    const user = userEvent.setup();

    render(await ConnectPage());
    await user.click(screen.getByRole('button', { name: /live/i }));
    await user.click(screen.getByRole('radio', { name: /ASI05/ }));
    await user.click(screen.getByRole('button', { name: /issue run endpoint/i }));

    await waitFor(() => expect(startLiveRun).toHaveBeenCalledWith({ category: 'ASI05' }));
    expect(JSON.stringify(vi.mocked(startLiveRun).mock.calls[0])).not.toContain('userId');
  });

  it('states the refusal the bound action returned, and issues nothing', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as never);
    vi.mocked(startLiveRun).mockResolvedValue({
      ok: false,
      code: 'SPEND_CAP_REACHED',
      message: 'Live runs are paused for now. Sample playback stays open to everyone.',
    } as never);
    const user = userEvent.setup();

    render(await ConnectPage());
    await user.click(screen.getByRole('button', { name: /live/i }));
    await user.click(screen.getByRole('button', { name: /issue run endpoint/i }));

    expect(await screen.findByText('LIVE RUNS PAUSED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy run token/i })).not.toBeInTheDocument();
  });
});
