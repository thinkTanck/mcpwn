'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dialog } from '@base-ui-components/react/dialog';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, isActive, type NavItem } from './nav-items';

function NavLink({
  item,
  pathname,
  labelClassName,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  labelClassName?: string;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3.5 py-3 font-mono text-xs tracking-[0.06em] transition-colors',
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

/**
 * Command-deck navigation. A persistent rail on ≥760px (icon-only 72px →
 * full 236px at ≥1100px) plus a focus-trapped Base UI drawer on mobile. Rendered
 * inside the shell, which owns the drawer's open state.
 */
export function CommandDeck({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <nav
        aria-label="Command deck"
        className="hidden shrink-0 flex-col gap-1 border-r border-line bg-gradient-to-b from-[rgba(10,15,21,0.6)] to-[rgba(5,8,11,0.2)] p-3 min-[760px]:flex min-[760px]:w-[72px] min-[1100px]:w-[236px]"
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
      </nav>

      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-[rgba(3,5,7,0.6)] backdrop-blur-[2px] min-[760px]:hidden" />
          <Dialog.Popup className="fixed bottom-0 left-0 top-12 z-50 w-[236px] border-r border-line-em bg-solid p-4 shadow-[0_0_40px_rgba(0,0,0,0.6)] min-[760px]:hidden">
            <Dialog.Title className="px-3 pb-2.5 pt-1.5 font-mono text-[10px] tracking-[0.16em] text-ink-faint">
              COMMAND DECK
            </Dialog.Title>
            <nav aria-label="Command deck (mobile)" className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onClose} />
              ))}
            </nav>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
