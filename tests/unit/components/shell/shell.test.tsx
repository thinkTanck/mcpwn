import { render, screen, within } from '@testing-library/react';
import { AppShell } from '@/components/shell/AppShell';
import { MobileDrawer } from '@/components/shell/MobileDrawer';
import type { FleetStatus } from '@/data/source';

// AppShell reads the active route from the x-pathname request header.
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => (k === 'x-pathname' ? '/' : null) }),
}));

const DECK_LINKS = ['Home', 'Connect / Run', 'Live Replay', 'Leaderboard', 'Findings'];
const sampleFleet: FleetStatus = {
  source: 'sample',
  nominal: 4,
  caution: 7,
  breach: 4,
  total: 15,
  empty: false,
};

describe('AppShell (server shell)', () => {
  it('exposes banner, navigation and main landmarks with the five deck links', async () => {
    render(await AppShell({ children: <p>screen content</p> }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    const deck = screen.getByRole('navigation', { name: 'Command deck' });
    for (const name of DECK_LINKS) {
      expect(within(deck).getByRole('link', { name })).toBeInTheDocument();
    }
    // FLEET STATUS is bound to the DataSource (Core-7 sample leaderboard → 4/11/6).
    expect(within(deck).getByText('4 nominal')).toBeInTheDocument();
    expect(within(deck).getByText('11 caution')).toBeInTheDocument();
  });

  it('marks the active route (Home at "/") with aria-current="page"', async () => {
    render(await AppShell({ children: <p>screen content</p> }));
    const deck = screen.getByRole('navigation', { name: 'Command deck' });
    expect(within(deck).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('renders the mobile command-deck trigger + drawer nav (native popover, no JS)', async () => {
    render(await AppShell({ children: <p>screen content</p> }));
    const trigger = screen.getByRole('button', { name: 'Open command deck' });
    expect(trigger).toHaveAttribute('popovertarget', 'mobile-deck');
    // The drawer is a closed native popover (display:none until opened), so its
    // nav is queried as hidden; the open/close behaviour is covered by e2e.
    const mobileNav = screen.getByRole('navigation', {
      name: 'Command deck (mobile)',
      hidden: true,
    });
    for (const name of DECK_LINKS) {
      expect(within(mobileNav).getByRole('link', { name, hidden: true })).toBeInTheDocument();
    }
  });
});

describe('MobileDrawer', () => {
  it('marks the active route inside the popover drawer', () => {
    render(<MobileDrawer pathname="/leaderboard" fleet={sampleFleet} />);
    const nav = screen.getByRole('navigation', { name: 'Command deck (mobile)', hidden: true });
    expect(within(nav).getByRole('link', { name: 'Leaderboard', hidden: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
