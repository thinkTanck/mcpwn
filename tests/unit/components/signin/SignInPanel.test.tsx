import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInPanel } from '@/components/signin/SignInPanel';
import { sendMagicLink } from '@/lib/auth/actions';

vi.mock('@/lib/auth/actions', () => ({
  sendMagicLink: vi.fn(),
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
    vi.mocked(sendMagicLink).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SignInPanel authEnabled />);

    expect(screen.queryByText(/no email is sent yet/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/email/i), 'real@user.com');
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }));

    expect(sendMagicLink).toHaveBeenCalledWith('real@user.com');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /check your inbox/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/no email is sent in this preview/i)).not.toBeInTheDocument();
  });

  it('surfaces the provider error on failure', async () => {
    vi.mocked(sendMagicLink).mockResolvedValue({ ok: false, error: 'rate limited' });
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
});
