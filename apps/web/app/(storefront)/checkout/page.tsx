'use client';
import * as React from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc/client';
import { formatINR, cn } from '@/lib/utils';
import { PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD, type PaymentMethodId } from '@/lib/payments';
import { BasketHaggle } from '@/components/ai/BasketHaggle';

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const addresses = trpc.address.list.useQuery();
  const preview = trpc.order.preview.useQuery({});
  const createAddress = trpc.address.create.useMutation({ onSuccess: () => utils.address.list.invalidate() });
  const initiate = trpc.order.initiate.useMutation();
  const confirm = trpc.order.confirm.useMutation();

  const [addressId, setAddressId] = React.useState<string | null>(null);
  const [payMethod, setPayMethod] = React.useState<PaymentMethodId>(DEFAULT_PAYMENT_METHOD);
  const [showNew, setShowNew] = React.useState(false);
  const [form, setForm] = React.useState({
    fullName: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', country: 'IN',
  });

  React.useEffect(() => {
    if (addresses.data?.length && !addressId) {
      setAddressId(addresses.data.find((a) => a.isDefault)?.id ?? addresses.data[0]?.id ?? null);
    }
  }, [addresses.data, addressId]);

  async function payNow() {
    if (!addressId) {
      toast.error('Pick a delivery address');
      return;
    }

    const res = await initiate
      .mutateAsync({ addressId, paymentMethod: payMethod })
      .catch((e) => {
        toast.error(e?.message ?? 'Could not place the order');
        return null;
      });
    if (!res) return;

    if (res.mode === 'cod') {
      toast.success('Order placed — pay cash on delivery');
      utils.cart.get.invalidate();
      router.push(`/orders/${res.orderId}`);
      return;
    }
    if (res.mode === 'stub') {
      toast.success('Order placed (Razorpay not configured — stub mode)');
      utils.cart.get.invalidate();
      router.push(`/orders/${res.orderId}`);
      return;
    }

    const opts = {
      key: res.keyId,
      amount: res.amount * 100,
      currency: res.currency,
      name: 'AI Bazaar',
      description: 'Order ' + res.orderId,
      order_id: res.razorpayOrderId,
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        await confirm.mutateAsync({
          orderId: res.orderId,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        utils.cart.get.invalidate();
        toast.success('Payment captured');
        router.push(`/orders/${res.orderId}`);
      },
      theme: { color: '#4f46e5' },
    };
    if (window.Razorpay) new window.Razorpay(opts).open();
  }

  return (
    <div className="container-page grid gap-8 py-8 md:grid-cols-[1fr_360px]">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div className="space-y-6">
        <h1 className="font-display text-2xl">Checkout</h1>

        {/*
          The SECOND, optional haggle — over the whole basket. Complements the
          per-product one: lines already negotiated enter at their locked price,
          so this round can only improve on what the buyer holds. On lock,
          order.preview is refetched so the summary shows the server-priced
          total rather than anything computed on the client.
        */}
        {preview.data && preview.data.subtotal > 0 && (
          <BasketHaggle listTotal={preview.data.subtotal} onLocked={() => preview.refetch()} />
        )}

        {/* Address */}
        <Card className="p-6">
          <h2 className="text-base font-semibold">Delivery address</h2>
          <div className="mt-4 grid gap-3">
            {addresses.data?.map((a) => (
              <label
                key={a.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                  addressId === a.id ? 'border-primary bg-primary/5 ring-2 ring-ring' : 'border-border hover:bg-muted'
                }`}
              >
                <input
                  type="radio"
                  name="addr"
                  checked={addressId === a.id}
                  onChange={() => setAddressId(a.id)}
                  className="mt-1"
                />
                <div className="text-sm">
                  <div className="font-medium">{a.fullName} · {a.phone}</div>
                  <div className="text-muted-foreground">
                    {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}
                  </div>
                </div>
              </label>
            ))}
            {!showNew ? (
              <Button variant="outline" size="sm" className="w-max" onClick={() => setShowNew(true)}>
                + Add new address
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Full name"><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
                  <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                </div>
                <Field label="Address line 1"><Input value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} /></Field>
                <Field label="Address line 2 (optional)"><Input value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} /></Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
                  <Field label="State"><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
                  <Field label="PIN"><Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></Field>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const a = await createAddress.mutateAsync({ ...form, isDefault: true });
                      setAddressId(a.id);
                      setShowNew(false);
                    }}
                  >
                    Save address
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Payment — COD is live; online is wired but gated in lib/payments.ts. */}
        <Card className="p-4 sm:p-6">
          <h2 className="text-base font-semibold">Payment</h2>
          <div className="mt-3 grid gap-2">
            {PAYMENT_METHODS.map((m) => {
              const selected = payMethod === m.id;
              return (
                <label
                  key={m.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-colors sm:p-4',
                    m.enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                    selected && m.enabled ? 'border-fg bg-muted/40' : 'border-border',
                    m.enabled && !selected && 'hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="pay"
                    className="mt-0.5 accent-fg"
                    checked={selected}
                    disabled={!m.enabled}
                    onChange={() => m.enabled && setPayMethod(m.id)}
                  />
                  <div className="min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.label}</span>
                      {m.enabled ? (
                        <Badge variant="success" className="shrink-0">
                          Available
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0">
                          Coming soon
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">{m.description}</p>
                    {!m.enabled && m.note && (
                      <p className="mt-1 text-[12px] text-muted-foreground">{m.note}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Summary */}
      <Card className="h-max p-6">
        <h2 className="text-base font-semibold">Order summary</h2>
        {preview.data && (
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Subtotal" value={formatINR(preview.data.subtotal)} />
            {preview.data.discount > 0 && <Row label="Discount" value={`- ${formatINR(preview.data.discount)}`} />}
            <Row label="Shipping" value={preview.data.shipping ? formatINR(preview.data.shipping) : 'Free'} />
            <Row label="Tax (GST 18%)" value={formatINR(preview.data.tax)} />
            <div className="my-2 border-t border-border" />
            <Row label="Total" value={formatINR(preview.data.total)} bold />
          </div>
        )}
        <Button onClick={payNow} className="mt-6 w-full" size="lg" disabled={initiate.isPending || !addressId}>
          {/* "Pay now" is a lie for COD — the buyer pays the courier. */}
          {initiate.isPending
            ? 'Placing order…'
            : payMethod === 'COD'
              ? 'Place order · Pay on delivery'
              : 'Pay now'}
        </Button>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> 256-bit encrypted · GST invoice on email
        </div>
        <div className="mt-3 text-center text-xs text-muted-foreground">
          <Link href="/cart" className="underline-offset-2 hover:underline">← Back to cart</Link>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
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
