import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignIn from '@/app/sign-in/page';

/**
 * Sign-in (BRAND · front door · pre-auth). Standalone route (outside the (hud)
 * shell) so the signed-out gate owns its own `main` landmark and never surfaces
 * the authenticated command deck. These RED assertions pin the a11y contract:
 * a main landmark, a labelled email field, a named primary control, and a
 * single top-level heading (no heading-order jump).
 */
describe('Sign-in screen', () => {
  it('renders a main landmark', () => {
    render(<SignIn />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('gives the email input an accessible label', () => {
    render(<SignIn />);
    const email = screen.getByLabelText(/email/i);
    expect(email).toBeInTheDocument();
    expect(email).toHaveAttribute('type', 'email');
  });

  it('names the primary magic-link button', () => {
    render(<SignIn />);
    expect(screen.getByRole('button', { name: /email me a sign-in link/i })).toBeInTheDocument();
  });

  it('does not claim an email was sent (honest preview, no auth wiring yet)', async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.type(screen.getByLabelText(/email/i), 'tester@example.com');
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }));
    expect(screen.queryByText(/we sent/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no email is sent in this preview/i)).toBeInTheDocument();
  });

  it('offers a keyless door to the sample run', () => {
    render(<SignIn />);
    expect(screen.getByRole('link', { name: /watch the sample run/i })).toHaveAttribute(
      'href',
      '/runs/sample',
    );
  });

  it('has a single level-1 heading and no heading-order jump', () => {
    render(<SignIn />);
    const headings = screen.getAllByRole('heading');
    // First heading in the document must be the page h1.
    expect(headings[0]?.tagName).toBe('H1');
    expect(
      screen.getByRole('heading', { level: 1, name: /continue to mcpwn/i }),
    ).toBeInTheDocument();
    // No h2/h3 appear before the h1 (no skipped/inverted levels).
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });
});
