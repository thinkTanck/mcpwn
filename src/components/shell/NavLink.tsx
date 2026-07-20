import Link from 'next/link';
import { cn } from '@/lib/utils';
import { isActive, type NavItem } from './nav-items';

/**
 * A single command-deck link with the active glow-bar + aria-current. A pure
 * Server Component — `pathname` is passed in (read from the request header in
 * AppShell), so no client `usePathname` is needed.
 */
export function NavLink({
  item,
  pathname,
  labelClassName,
}: {
  item: NavItem;
  pathname: string;
  labelClassName?: string;
}) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      // Unbuilt routes stay visible in the deck but must not be prefetched, or
      // Next would RSC-404 them on load. Fan-out PRs flip `available` per route.
      prefetch={item.available ? undefined : false}
      aria-current={active ? 'page' : undefined}
      // The 72px icon-rail (760-1100px) hides the label and the icon is
      // aria-hidden, so without this the link has no accessible name and a mouse
      // user sees an unlabelled glyph. aria-label keeps the name at every width;
      // title gives the icon-rail a hover tooltip.
      aria-label={item.label}
      title={item.label}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3.5 py-3.5 font-mono text-xs tracking-[0.06em] transition-colors',
        active ? 'bg-nominal/8 text-ink-hi' : 'text-ink-muted hover:bg-raised/70 hover:text-ink-hi',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-2 left-[-12px] top-2 w-0.5 rounded-full',
          active ? 'bg-nominal shadow-glow-nominal' : 'bg-transparent',
        )}
      />
      <span className="shrink-0 opacity-90">{item.icon}</span>
      <span className={labelClassName}>{item.label}</span>
    </Link>
  );
}
