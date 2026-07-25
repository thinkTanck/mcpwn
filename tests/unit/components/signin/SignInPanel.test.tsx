import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInPanel } from '@/components/signin/SignInPanel';
import { requestEmailCode, verifyEmailCode } from '@/lib/auth/actions';

vi.mock('@/lib/auth/actions', () => ({
  requestEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
  startGitHubOAuth: vi.fn(),
}));

/**
 * The wired path (authEnabled). The pre-auth preview behaviour is covered by the
 * sign-in page test; here we lock the two-step email OTP flow: request a code,
 * advance to the code step, verify, resend cooldown, back-to-email, the error
 * surfaces, and GitHub-behind-config.
 */
describe('SignInPanel (wired auth)', () => {
  beforeEach(() => vi.clearAllMocks());

  const reachCodeStep = async (user: ReturnType<typeof userEvent.setup>) => {
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true });
    await user.type(screen.getByLabelText(/email/i), 'real@user.com');
    await user.click(screen.getByRole('button', { name: /email me a code/i }));
    return screen.findByRole('heading', { name: /enter your code/i });
  };

  it('advances to the code step after a code is requested', async () => {
    const user = userEvent.setup();
    render(<SignInPanel authEnabled />);
    expect(screen.queryByText(/no email is sent yet/i)).not.toBeInTheDocument();

    await reachCodeStep(user);

    expect(requestEmailCode).toHaveBeenCalledWith('real@user.com');
    const code = screen.getByLabelText(/code/i);
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('surfaces the request error and stays on the email step', async () => {
    vi.mocked(requestEmailCode).mockResolvedValue({
      ok: false,
      error: 'email rate limit exceeded',
    });
    const user = userEvent.setup();
    render(<SignInPanel authEnabled />);

    await user.type(screen.getByLabelText(/email/i), 'real@user.com');
    await user.click(screen.getByRole('button', { name: /email me a code/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/rate limit/i));
    expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
  });

  it('surfaces a wrong-code error and stays on the code step', async () => {
    const user = userEvent.setup();
    render(<SignInPanel authEnabled next="/account" />);
    await reachCodeStep(user);

    vi.mocked(verifyEmailCode).mockResolvedValue({
      ok: false,
      error: 'That code is incorrect or has expired. Enter the latest one or resend a new code.',
    });
    await user.type(screen.getByLabelText(/code/i), '000000');
    await user.click(screen.getByRole('button', { name: /verify and continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect or has expired/i);
    expect(verifyEmailCode).toHaveBeenCalledWith('real@user.com', '000000', '/account');
    expect(screen.getByRole('heading', { name: /enter your code/i })).toBeInTheDocument();
  });

  it('returns to the email step from the code step', async () => {
    const user = userEvent.setup();
    render(<SignInPanel authEnabled />);
    await reachCodeStep(user);

    await user.click(screen.getByRole('button', { name: /use a different email/i }));
    expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /enter your code/i })).not.toBeInTheDocument();
  });

  it('disables resend during the cooldown then re-enables it', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(requestEmailCode).mockResolvedValue({ ok: true });
      render(<SignInPanel authEnabled />);
      // fireEvent is synchronous (no userEvent internal delays that stall under
      // fake timers). Drive the email step, then flush the request transition.
      const emailInput = screen.getByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: 'real@user.com' } });
      fireEvent.submit(emailInput.closest('form')!);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByRole('button', { name: /resend code in \d+s/i })).toBeDisabled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45_000);
      });
      expect(screen.getByRole('button', { name: /^resend code$/i })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('enables the GitHub button when GitHub OAuth is configured', () => {
    render(<SignInPanel authEnabled githubEnabled />);
    expect(screen.getByRole('button', { name: /continue with github/i })).not.toBeDisabled();
  });

  it('surfaces a clear reason (not a blank form) on a prior sign-in failure', () => {
    render(<SignInPanel authEnabled authError />);
    expect(screen.getByRole('alert')).toHaveTextContent(/could not complete that sign-in/i);
    expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
  });

  it('shows no failure notice when there is no prior error', () => {
    render(<SignInPanel authEnabled />);
    expect(screen.queryByText(/could not complete that sign-in/i)).not.toBeInTheDocument();
  });
});
