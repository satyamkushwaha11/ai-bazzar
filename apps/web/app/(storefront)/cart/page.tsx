'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';

export default function CartPage() {
  const utils = trpc.useUtils();
  const cart = trpc.cart.get.useQuery();
  const preview = trpc.order.preview.useQuery({});
  const setQty = trpc.cart.setQty.useMutation({ onSuccess: () => { utils.cart.get.invalidate(); utils.order.preview.invalidate(); } });
  const remove = trpc.cart.remove.useMutation({ onSuccess: () => { utils.cart.get.invalidate(); utils.order.preview.invalidate(); toast.success('Removed'); } });

  if (cart.isLoading) return <div className="container-page py-12">Loading…</div>;
  const items = cart.data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="font-display text-3xl">Your cart is empty</h1>
        <p className="mt-1 text-sm text-muted-foreground">Find something you love — and haggle for it.</p>
        <Button asChild className="mt-6"><Link href="/">Start shopping</Link></Button>
      </div>
    );
  }

  return (
    <div className="container-page grid gap-8 py-8 md:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <h1 className="font-display text-3xl">Your cart</h1>
        {items.map((item) => {
          const offer = item.lockedOffer;
          const usingOffer = offer && !offer.consumed && new Date(offer.expiresAt) > new Date();
          const unit = usingOffer ? Number(offer!.price) : Number(item.variant.listPrice);
          return (
            <Card key={item.id} className="flex gap-4 p-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                {item.variant.imageUrl && (
                  <Image src={item.variant.imageUrl} alt={item.variant.product.title} fill sizes="96px" className="object-cover" />
                )}
              </div>
              <div className="flex flex-1 flex-col">
                <Link href={`/p/${item.variant.product.slug}`} className="font-medium hover:underline">
                  {item.variant.product.title}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {Object.values((item.variant.attrs as Record<string, string>) ?? {}).join(' · ')}
                </div>
                {usingOffer && (
                  <Badge variant="success" className="mt-1 w-max">🤝 Negotiated price locked</Badge>
                )}
                <div className="mt-auto flex items-end justify-between">
                  <div className="flex items-center rounded-md border border-border">
                    <button onClick={() => setQty.mutate({ itemId: item.id, qty: Math.max(0, item.qty - 1) })} className="px-2 py-1 hover:bg-muted">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="px-3 text-sm font-medium">{item.qty}</span>
                    <button onClick={() => setQty.mutate({ itemId: item.id, qty: item.qty + 1 })} className="px-2 py-1 hover:bg-muted">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatINR(unit * item.qty)}</div>
                    <button onClick={() => remove.mutate({ itemId: item.id })} className="text-xs text-muted-foreground hover:text-destructive">
                      <Trash2 className="mr-1 inline h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="h-max p-6">
        <h2 className="text-base font-semibold">Order summary</h2>
        {preview.data && (
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Subtotal" value={formatINR(preview.data.subtotal)} />
            {preview.data.discount > 0 && <Row label="Discount" value={`- ${formatINR(preview.data.discount)}`} />}
            <Row label="Shipping" value={preview.data.shipping ? formatINR(preview.data.shipping) : 'Free'} />
            <Row label="Tax (GST)" value={formatINR(preview.data.tax)} />
            <div className="my-2 border-t border-border" />
            <Row label="Total" value={formatINR(preview.data.total)} bold />
          </div>
        )}
        <Button asChild className="mt-6 w-full" size="lg">
          <Link href="/checkout">Proceed to checkout</Link>
        </Button>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Secure payment via Razorpay
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
