'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader, StatCard } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';

export default function SellerOverview() {
  const me = trpc.seller.me.useQuery();
  const a = trpc.seller.analytics.useQuery();

  return (
    <div>
      <PageHeader
        title={`Welcome${me.data?.storeName ? `, ${me.data.storeName}` : ''}`}
        description={me.data?.status === 'PENDING'
          ? 'Your store is awaiting admin approval. You can still set up products in DRAFT.'
          : 'Here is what is happening with your store today.'}
        action={
          <Button asChild>
            <Link href="/seller/products/new">+ New product</Link>
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Revenue (paid)" value={a.data ? formatINR(a.data.revenue) : '—'} />
        <StatCard label="Units sold" value={a.data?.unitsSold ?? '—'} />
        <StatCard label="Order items" value={a.data?.orders ?? '—'} />
      </div>
    </div>
  );
}
