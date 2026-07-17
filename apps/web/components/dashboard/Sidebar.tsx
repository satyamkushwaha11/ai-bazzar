'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/storefront/Logo';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  Users,
  ShieldCheck,
  FolderTree,
  Tag,
  type LucideIcon,
} from 'lucide-react';

const SELLER_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/seller', label: 'Overview', icon: LayoutDashboard },
  { href: '/seller/products', label: 'Products', icon: Package },
  { href: '/seller/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/seller/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/seller/settings', label: 'Settings', icon: Settings },
];

const ADMIN_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/sellers', label: 'Sellers', icon: ShieldCheck },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/admin/categories', label: 'Categories', icon: FolderTree },
  { href: '/admin/coupons', label: 'Coupons', icon: Tag },
];

export function DashboardSidebar({ kind }: { kind: 'seller' | 'admin' }) {
  const pathname = usePathname();
  const nav = kind === 'seller' ? SELLER_NAV : ADMIN_NAV;
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Logo />
        <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {kind}
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {nav.map((n) => {
          const active = pathname === n.href || (n.href !== `/${kind}` && pathname.startsWith(n.href));
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-primary/10 font-medium text-fg' : 'text-muted-foreground hover:bg-muted hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-fg">← Back to store</Link>
      </div>
    </aside>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
      <div>
        <h1 className="font-display text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
