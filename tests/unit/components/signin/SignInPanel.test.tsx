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

  /**
   * REGRESSION GUARD, half two of the Slice 1.5 prod bug. Supabase's Email OTP
   * length is a project setting (6 to 10); this project emits 8. The first cut
   * hardcoded maxLength=6 and sliced input to 6, so the real emailed code was
   * silently truncated to a prefix and every verify failed. The field must carry
   * whatever GoTrue issued.
   */
  it('accepts a code longer than six digits and sends it whole', async () => {
    const user = userEvent.setup();
    render(<SignInPanel authEnabled next="/account" />);
    await reachCodeStep(user);

    vi.mocked(verifyEmailCode).mockResolvedValue({ ok: false, error: 'nope' });
    await user.type(screen.getByLabelText(/code/i), '71814917');
    expect(screen.getByLabelText(/code/i)).toHaveValue('71814917');

    await user.click(screen.getByRole('button', { name: /verify and continue/i }));
    expect(verifyEmailCode).toHaveBeenCalledWith('real@user.com', '71814917', '/account');
  });

  it('allows up to the ten digits Supabase can be configured to emit', async () => {
    const user = userEvent.setup();
    render(<SignInPanel authEnabled />);
    await reachCodeStep(user);
    const code = screen.getByLabelText(/code/i);

    await user.type(code, '12345678901234');
    expect(code).toHaveValue('1234567890');
  });

  /** The copy must not promise a digit count the project does not emit. */
  it('does not claim a six-digit code anywhere', async () => {
    const user = userEvent.setup();
    const { container } = render(<SignInPanel authEnabled />);
    expect(container.textContent).not.toMatch(/6-digit|six-digit/i);
    await reachCodeStep(user);
    expect(container.textContent).not.toMatch(/6-digit|six-digit/i);
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
    // Still on the email step: it did not advance to the code step.
    expect(screen.queryByRole('heading', { name: /enter your code/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
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
    // The field is marked invalid and linked to the error for screen readers.
    const codeInput = screen.getByLabelText(/code/i);
    expect(codeInput).toHaveAttribute('aria-invalid', 'true');
    expect(codeInput.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it('announces a new code on resend', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(requestEmailCode).mockResolvedValue({ ok: true });
      render(<SignInPanel authEnabled />);
      const emailInput = screen.getByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: 'real@user.com' } });
      fireEvent.submit(emailInput.closest('form')!);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // Wait out the cooldown, then resend.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45_000);
      });
      fireEvent.click(screen.getByRole('button', { name: /^resend code$/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole('status')).toHaveTextContent(/new code sent/i);
    } finally {
      vi.useRealTimers();
    }
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
