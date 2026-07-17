'use client';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';

export default function AdminOrdersPage() {
  const list = trpc.admin.orders.useQuery();
  return (
    <div>
      <PageHeader title="Orders" description="Marketplace-wide order activity." />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="p-3">Order</th><th className="p-3">Buyer</th><th className="p-3">Items</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Date</th></tr>
          </thead>
          <tbody>
            {list.data?.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">#{o.id.slice(-8).toUpperCase()}</td>
                <td className="p-3">
                  <div>{o.buyer.name}</div>
                  <div className="text-xs text-muted-foreground">{o.buyer.email}</div>
                </td>
                <td className="p-3">{o.items.length}</td>
                <td className="p-3 font-semibold">{formatINR(Number(o.total))}</td>
                <td className="p-3"><Badge variant={o.status === 'PAID' || o.status === 'FULFILLED' ? 'success' : 'secondary'}>{o.status}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
