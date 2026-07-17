'use client';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';

export default function SellerOrdersPage() {
  const utils = trpc.useUtils();
  const list = trpc.seller.orders.useQuery();
  const update = trpc.seller.updateOrderItem.useMutation({
    onSuccess: () => { utils.seller.orders.invalidate(); toast.success('Updated'); },
  });

  return (
    <div>
      <PageHeader title="Orders" description="Process and ship your orders." />
      {list.data?.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No orders yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Buyer</th>
                <th className="p-3">Item</th>
                <th className="p-3">Qty × Price</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="p-3 align-top">
                    <div className="font-mono text-xs">#{it.orderId.slice(-8).toUpperCase()}</div>
                    <div className="text-xs text-muted-foreground">{new Date(it.order.createdAt).toLocaleDateString()}</div>
                  </td>
                  <td className="p-3 align-top">
                    <div className="font-medium">{it.order.buyer.name}</div>
                    <div className="text-xs text-muted-foreground">{it.order.address.city}, {it.order.address.state}</div>
                  </td>
                  <td className="p-3 align-top">
                    <div className="font-medium">{it.variant.product.title}</div>
                    <div className="text-xs text-muted-foreground">{it.variant.sku}</div>
                  </td>
                  <td className="p-3 align-top">{it.qty} × {formatINR(Number(it.unitPrice))}</td>
                  <td className="p-3 align-top">
                    <Badge variant={
                      it.status === 'DELIVERED' ? 'success' :
                      it.status === 'CANCELLED' ? 'destructive' :
                      it.status === 'SHIPPED' ? 'default' : 'secondary'
                    }>
                      {it.status}
                    </Badge>
                  </td>
                  <td className="p-3 align-top text-right">
                    <select
                      value={it.status}
                      onChange={(e) => update.mutate({ itemId: it.id, status: e.target.value as 'ACCEPTED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' })}
                      className="rounded-md border border-input bg-card px-2 py-1 text-xs"
                    >
                      {['PLACED', 'ACCEPTED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
