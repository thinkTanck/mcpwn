'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isActive, type NavItem } from './nav-items';

/**
 * A single command-deck link with the active glow-bar + aria-current. The active
 * state follows the LIVE route via `usePathname` — the deck lives in a layout,
 * which Next does not re-render on soft (client) navigation, so a header-passed
 * pathname would freeze on the first-loaded route (the deck stuck highlighting
 * Home). `usePathname` re-renders on every navigation. The `pathname` prop is the
 * SSR seed / fallback for when no router is mounted (unit tests), so the server
 * render and hydration still match.
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
  const livePathname = usePathname();
  const active = isActive(livePathname ?? pathname, item);
  // The action routes fold a plain-words purpose into the name, so a newcomer
  // learns what a route does on hover/focus without clicking. Self-explanatory
  // routes keep the bare label.
  const name = item.descriptor ? `${item.label}. ${item.descriptor}` : item.label;
  return (
    <Link
      href={item.href}
      // Unbuilt routes stay visible in the deck but must not be prefetched, or
      // Next would RSC-404 them on load. Fan-out PRs flip `available` per route.
      prefetch={item.available ? undefined : false}
      aria-current={active ? 'page' : undefined}
      // The 72px icon-rail (760-1100px) hides the label and the icon is
      // aria-hidden, so without this the link has no accessible name and a mouse
      // user sees an unlabelled glyph. aria-label keeps the name (with its purpose)
      // at every width; title gives every width a hover tooltip.
      aria-label={name}
      title={name}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3.5 py-3.5 font-mono text-xs tracking-[0.06em] transition-colors',
        active ? 'bg-nominal/8 text-nominal' : 'text-ink-hi hover:bg-raised/70',
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
