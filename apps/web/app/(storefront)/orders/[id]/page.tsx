'use client';
import { use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const o = trpc.order.byId.useQuery({ id });
  if (o.isLoading) return <div className="container-page py-12">Loading…</div>;
  const order = o.data;
  if (!order) return <div className="container-page py-12">Order not found.</div>;

  return (
    <div className="container-page grid gap-6 py-8 md:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div>
          <Link href="/orders" className="text-xs text-muted-foreground hover:text-fg">← All orders</Link>
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="font-display text-2xl sm:text-3xl">
              Order #{order.id.slice(-8).toUpperCase()}
            </h1>
            <Badge variant={order.status === 'PAID' || order.status === 'CONFIRMED' ? 'success' : 'secondary'}>
              {order.status === 'CONFIRMED' ? 'Confirmed' : order.status}
            </Badge>
            {order.paymentMethod === 'COD' && <Badge variant="outline">Cash on Delivery</Badge>}
          </div>
          <div className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</div>

          {/*
            A COD buyer has paid nothing yet. Saying so plainly avoids the "is
            this actually ordered?" question that an unexplained status invites.
          */}
          {order.paymentMethod === 'COD' && order.status !== 'CANCELLED' && (
            <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
              Your order is placed. Please keep{' '}
              <span className="tabular font-medium text-fg">{formatINR(Number(order.total))}</span> in
              cash ready — you pay the courier on delivery.
            </p>
          )}
        </div>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Items</h2>
          <div className="mt-3 space-y-3">
            {order.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3">
                {it.variant.imageUrl && (
                  <div className="relative h-16 w-16 overflow-hidden rounded">
                    <Image src={it.variant.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium">{it.variant.product.title}</div>
                  <div className="text-xs text-muted-foreground">Qty {it.qty} · {it.status}</div>
                  {it.trackingId && (
                    <div className="text-xs text-muted-foreground">
                      Tracking: {it.trackingUrl ? <a className="underline" href={it.trackingUrl}>{it.trackingId}</a> : it.trackingId}
                    </div>
                  )}
                </div>
                <div className="text-sm font-semibold">{formatINR(Number(it.unitPrice) * it.qty)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Delivery address</h2>
          <div className="mt-2 text-sm text-muted-foreground">
            {order.address.fullName} · {order.address.phone}
            <br />
            {order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ''}, {order.address.city}, {order.address.state} {order.address.pincode}
          </div>
        </Card>
      </div>

      <Card className="h-max p-6">
        <h2 className="text-base font-semibold">Payment</h2>
        <div className="mt-3 space-y-1 text-sm">
          <Row label="Subtotal" value={formatINR(Number(order.subtotal))} />
          {Number(order.discount) > 0 && <Row label="Discount" value={`- ${formatINR(Number(order.discount))}`} />}
          <Row label="Shipping" value={Number(order.shipping) ? formatINR(Number(order.shipping)) : 'Free'} />
          <Row label="Tax" value={formatINR(Number(order.tax))} />
          <div className="my-2 border-t border-border" />
          <Row label="Total paid" value={formatINR(Number(order.total))} bold />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-base font-semibold' : 'text-muted-foreground'}`}>
      <span>{label}</span>
      <span className={bold ? 'text-fg' : ''}>{value}</span>
    </div>
  );
}
