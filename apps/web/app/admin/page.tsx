'use client';
import { PageHeader, StatCard } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';

export default function AdminOverview() {
  const stats = trpc.admin.stats.useQuery();
  return (
    <div>
      <PageHeader title="Platform overview" description="Real-time platform health." />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Users" value={stats.data?.users ?? '—'} />
        <StatCard label="Sellers" value={stats.data?.sellers ?? '—'} />
        <StatCard label="Products" value={stats.data?.products ?? '—'} />
        <StatCard label="Paid orders" value={stats.data?.orders ?? '—'} />
        <StatCard label="GMV" value={stats.data ? formatINR(stats.data.gmv) : '—'} />
      </div>
    </div>
  );
}
