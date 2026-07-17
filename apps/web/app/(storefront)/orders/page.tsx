'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';

export default function OrdersPage() {
  const orders = trpc.order.myOrders.useQuery();
  if (orders.isLoading) return <div className="container-page py-12">Loading…</div>;

  return (
    <div className="container-page py-8">
      <h1 className="font-display text-3xl">Your orders</h1>
      {orders.data?.length === 0 ? (
        <div className="mt-12 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          You haven't placed an order yet. <Link href="/" className="text-fg underline">Browse products</Link>.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.data?.map((o) => (
            <Card key={o.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Order #{o.id.slice(-8).toUpperCase()}</div>
                  <div className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</div>
                </div>
                <Badge variant={o.status === 'PAID' ? 'success' : o.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
                  {o.status}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {o.items.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2">
                    {it.variant.imageUrl && (
                      <div className="relative h-12 w-12 overflow-hidden rounded">
                        <Image src={it.variant.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                      </div>
                    )}
                    <div className="text-sm">
                      <div className="font-medium">{it.variant.product.title}</div>
                      <div className="text-xs text-muted-foreground">Qty {it.qty} · {formatINR(Number(it.unitPrice))}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Link href={`/orders/${o.id}`} className="text-sm font-medium text-primary hover:underline">View details →</Link>
                <div className="text-base font-semibold">{formatINR(Number(o.total))}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
