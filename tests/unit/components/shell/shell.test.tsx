import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '@/components/shell/AppShell';

// The shell reads the active route via next/navigation.
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const DECK_LINKS = ['Home', 'Connect / Run', 'Live Replay', 'Leaderboard', 'Findings'];

describe('AppShell', () => {
  it('exposes banner, navigation and main landmarks with the five deck links', () => {
    render(
      <AppShell>
        <p>screen content</p>
      </AppShell>,
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    const deck = screen.getByRole('navigation', { name: 'Command deck' });
    for (const name of DECK_LINKS) {
      expect(within(deck).getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('marks the active route (Home at "/") with aria-current="page"', () => {
    render(
      <AppShell>
        <p>screen content</p>
      </AppShell>,
    );
    const deck = screen.getByRole('navigation', { name: 'Command deck' });
    expect(within(deck).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens the mobile command-deck drawer and closes it on Escape', async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <p>screen content</p>
      </AppShell>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open command deck' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Leaderboard' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
