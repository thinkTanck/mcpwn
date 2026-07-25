import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInPanel } from '@/components/signin/SignInPanel';
import { requestEmailCode } from '@/lib/auth/actions';

vi.mock('@/lib/auth/actions', () => ({
  requestEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
  startGitHubOAuth: vi.fn(),
}));

/**
 * The wired path (authEnabled). The pre-auth preview behaviour is covered by the
 * sign-in page test; here we lock the real magic-link call, the confirmation, the
 * error surface, and GitHub-behind-config.
 */
describe('SignInPanel (wired auth)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a real magic link, confirms, and drops the preview banner', async () => {
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SignInPanel authEnabled />);

    expect(screen.queryByText(/no email is sent yet/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/email/i), 'real@user.com');
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }));

    expect(requestEmailCode).toHaveBeenCalledWith('real@user.com');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /check your inbox/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/no email is sent in this preview/i)).not.toBeInTheDocument();
  });

  it('surfaces the provider error on failure', async () => {
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: false, error: 'rate limited' });
    const user = userEvent.setup();
    render(<SignInPanel authEnabled />);

    await user.type(screen.getByLabelText(/email/i), 'real@user.com');
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/rate limited/i));
  });

  it('enables the GitHub button when GitHub OAuth is configured', () => {
    render(<SignInPanel authEnabled githubEnabled />);
    expect(screen.getByRole('button', { name: /continue with github/i })).not.toBeDisabled();
  });

  it('surfaces a clear reason (not a blank form) when a sign-in link failed', () => {
    render(<SignInPanel authEnabled linkError />);
    // A failed callback lands here: explain why, do not dump the user on a blank form.
    expect(screen.getByRole('alert')).toHaveTextContent(/already used or (has )?expired/i);
    // The magic-link form remains, as the "request a new link" action.
    expect(screen.getByRole('button', { name: /email me a sign-in link/i })).toBeInTheDocument();
  });

  it('shows no failure notice when there is no link error', () => {
    render(<SignInPanel authEnabled />);
    expect(screen.queryByText(/already used or (has )?expired/i)).not.toBeInTheDocument();
  });
});
