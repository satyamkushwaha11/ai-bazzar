'use client';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search, ShoppingBag, Heart, Sun, Moon, User, LogOut, LayoutDashboard, ShieldCheck, Menu, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Logo } from './Logo';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { trpc } from '@/lib/trpc/client';

export interface Department {
  name: string;
  slug: string;
  children: Array<{ name: string; slug: string }>;
}

/** How many departments sit inline in the nav row; the rest live in the menu. */
const INLINE_DEPTS = 7;

export function Header({ departments = [] }: { departments?: Department[] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const cart = trpc.cart.get.useQuery(undefined, { enabled: !!session });
  const cartCount = cart.data?.items.reduce((s, i) => s + i.qty, 0) ?? 0;

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg">
      {/* Primary row — search takes the centre, as on any real marketplace. */}
      <div className="container-page flex h-14 items-center gap-3 sm:gap-6">
        <Logo />

        <form onSubmit={onSearch} className="hidden flex-1 md:block">
          <SearchField value={q} onChange={setQ} />
        </form>

        <div className="ml-auto flex items-center gap-0.5 md:ml-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>

          {session && (
            <Button asChild variant="ghost" size="icon" aria-label="Wishlist">
              <Link href="/wishlist">
                <Heart className="h-4 w-4" />
              </Link>
            </Button>
          )}

          <Button asChild variant="ghost" size="icon" className="relative" aria-label="Cart">
            <Link href="/cart">
              <ShoppingBag className="h-4 w-4" />
              {cartCount > 0 && (
                <span className="tabular absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-fg px-1 text-[10px] font-semibold leading-none text-bg">
                  {cartCount}
                </span>
              )}
            </Link>
          </Button>

          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={session.user.image ?? undefined} />
                    <AvatarFallback className="text-[10px]">{session.user.name?.[0] ?? 'U'}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{session.user.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">{session.user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push('/orders')}>
                  <ShoppingBag className="h-4 w-4" /> My orders
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push('/account')}>
                  <User className="h-4 w-4" /> Account
                </DropdownMenuItem>
                {session.user.role === 'SELLER' && (
                  <DropdownMenuItem onSelect={() => router.push('/seller')}>
                    <LayoutDashboard className="h-4 w-4" /> Seller dashboard
                  </DropdownMenuItem>
                )}
                {session.user.role === 'ADMIN' && (
                  <DropdownMenuItem onSelect={() => router.push('/admin')}>
                    <ShieldCheck className="h-4 w-4" /> Admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => signOut({ callbackUrl: '/' })}>
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" className="ml-2">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Secondary row — departments, with the long tail behind a menu. */}
      <nav className="hidden border-t border-border md:block">
        {/*
          The department list scrolls; "All" and "Today's deals" are pinned
          either side. Laying them out in one non-scrolling row overflowed the
          BODY by 105px at 768px (iPad mini) — seven departments plus a
          right-pushed link simply do not fit, and the whole page scrolled
          sideways as a result.
        */}
        <div className="container-page flex h-9 items-center gap-1 text-[13px]">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted"
          >
            {menuOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
            All
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {departments.slice(0, INLINE_DEPTS).map((d) => (
              <Link
                key={d.slug}
                href={`/c/${d.slug}`}
                className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-fg"
              >
                {d.name}
              </Link>
            ))}
          </div>

          <Link
            href="/search?q=deals"
            className="shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium text-fg transition-colors hover:bg-muted"
          >
            Today&rsquo;s deals
          </Link>
        </div>

        {/* Mega-menu: every department and subcategory, one click from anywhere. */}
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 top-[92px] z-30 bg-black/20"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="absolute inset-x-0 z-40 max-h-[70vh] overflow-y-auto border-b border-border bg-bg shadow-pop">
              <div className="container-page grid grid-cols-2 gap-x-6 gap-y-5 py-5 lg:grid-cols-4 xl:grid-cols-6">
                {departments.map((d) => (
                  <div key={d.slug}>
                    <Link
                      href={`/c/${d.slug}`}
                      onClick={() => setMenuOpen(false)}
                      className="text-[13px] font-semibold hover:underline"
                    >
                      {d.name}
                    </Link>
                    <ul className="mt-1.5 space-y-1">
                      {d.children.map((c) => (
                        <li key={c.slug}>
                          <Link
                            href={`/c/${c.slug}`}
                            onClick={() => setMenuOpen(false)}
                            className="text-[12px] text-muted-foreground hover:text-fg hover:underline"
                          >
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </nav>

      {/* Mobile search */}
      <form onSubmit={onSearch} className="container-page block py-2 md:hidden">
        <SearchField value={q} onChange={setQ} />
      </form>
    </header>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          /* type=search gives mobile keyboards a "Search" key and a clear affordance. */
          type="search"
          enterKeyHint="search"
          placeholder="Search products, brands and categories"
          aria-label="Search products"
          className="h-9 w-full rounded-md border border-input bg-muted pl-9 pr-12 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-fg focus-visible:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 [&::-webkit-search-cancel-button]:appearance-none"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          AI
        </span>
      </div>
      {/*
        An explicit submit button. Enter alone is not discoverable on touch, where
        there is no visible way to fire the search at all.
      */}
      <Button type="submit" size="icon" className="h-9 w-9 shrink-0" aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}
