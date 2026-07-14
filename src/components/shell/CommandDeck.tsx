import { NAV_ITEMS } from './nav-items';
import { NavLink } from './NavLink';
import { FleetStatus } from './FleetStatus';
import type { FleetStatus as FleetStatusData } from '@/data/source';

/**
 * Persistent command-deck rail on ≥760px (icon-only 72px → full 236px at
 * ≥1100px). A Server Component — active state comes from `pathname`, and the
 * FLEET STATUS tally is bound to the DataSource (full panel wide, dots on the
 * icon-rail).
 */
export function CommandDeck({ pathname, fleet }: { pathname: string; fleet: FleetStatusData }) {
  return (
    <nav
      aria-label="Command deck"
      className="sticky top-[62px] hidden h-[calc(100dvh-62px)] shrink-0 flex-col gap-1 self-start overflow-y-auto border-r border-line bg-gradient-to-b from-[rgba(10,15,21,0.6)] to-[rgba(5,8,11,0.2)] p-3 min-[760px]:flex min-[760px]:w-[72px] min-[1100px]:w-[236px]"
    >
      <div className="hidden px-3 pb-2.5 pt-1.5 font-mono text-[10px] tracking-[0.16em] text-ink-faint min-[1100px]:block">
        COMMAND DECK
      </div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          labelClassName="hidden min-[1100px]:inline"
        />
      ))}
      <div className="flex-1" />
      <FleetStatus fleet={fleet} variant="full" className="hidden min-[1100px]:flex" />
      <FleetStatus
        fleet={fleet}
        variant="dots"
        className="hidden min-[760px]:flex min-[1100px]:hidden"
      />
    </nav>
  );
}
