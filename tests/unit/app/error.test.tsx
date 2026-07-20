import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The default export is a component named `Error`; we alias it so the global
// `Error` constructor stays in scope for building real error props below.
import ErrorBoundary from '@/app/error';

describe('Error (route-segment error boundary)', () => {
  it('announces an accessible fallback and retries on "Try again"', async () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={new Error('boom')} reset={reset} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();

    const tryAgain = screen.getByRole('button', { name: 'Try again' });
    expect(tryAgain).toBeVisible();

    await userEvent.click(tryAgain);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('surfaces the error digest when present', () => {
    const reset = vi.fn();
    render(
      <ErrorBoundary error={Object.assign(new Error('x'), { digest: 'abc123' })} reset={reset} />,
    );

    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('offers a return-home off-ramp (the boundary bubbles above the command deck)', () => {
    render(<ErrorBoundary error={new Error('boom')} reset={vi.fn()} />);
    const home = screen.getByRole('link', { name: /return home/i });
    expect(home).toHaveAttribute('href', '/');
  });
});
