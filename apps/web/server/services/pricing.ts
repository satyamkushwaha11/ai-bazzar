import { prisma } from '../db';

type Decimal = { toString(): string; toNumber?: () => number };

export interface CartLine {
  variantId: string;
  qty: number;
  unitPrice: number;
  sellerId: string;
  productTitle: string;
}

export interface PricedCart {
  lines: CartLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  couponCode?: string;
}

const FREE_SHIPPING_THRESHOLD = 999;
const SHIPPING_FLAT = 49;
const GST_RATE = 0.18;

const num = (d: Decimal | number) => (typeof d === 'number' ? d : Number(d));

/**
 * Single source of truth for pricing. Used by checkout, order creation,
 * Razorpay order amount, and invoices. Pulls live unit prices + locked offers
 * to prevent client tampering.
 */
export async function priceCart(userId: string, couponCode?: string): Promise<PricedCart> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          variant: {
            select: {
              id: true,
              listPrice: true,
              sku: true,
              product: { select: { title: true, sellerId: true } },
            },
          },
          lockedOffer: { select: { id: true, price: true, expiresAt: true, consumed: true } },
        },
      },
    },
  });

  const lines: CartLine[] = [];
  for (const item of cart?.items ?? []) {
    const offer = item.lockedOffer;
    const usingOffer =
      offer && !offer.consumed && offer.expiresAt > new Date() ? num(offer.price) : null;
    const unit = usingOffer ?? num(item.variant.listPrice);
    lines.push({
      variantId: item.variantId,
      qty: item.qty,
      unitPrice: unit,
      sellerId: item.variant.product.sellerId,
      productTitle: item.variant.product.title,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  let discount = 0;
  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
    if (coupon && coupon.active && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
      const min = coupon.minSubtotal ? num(coupon.minSubtotal) : 0;
      if (subtotal >= min) {
        discount =
          coupon.type === 'PERCENT'
            ? Math.min(coupon.maxDiscount ? num(coupon.maxDiscount) : Infinity, (subtotal * num(coupon.value)) / 100)
            : num(coupon.value);
      }
    }
  }

  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * GST_RATE);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
  const total = Math.round(taxable + tax + shipping);

  return { lines, subtotal: round(subtotal), discount: round(discount), shipping, tax, total, couponCode };
}

const round = (n: number) => Math.round(n);
