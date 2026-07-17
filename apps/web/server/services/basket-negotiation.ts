import { prisma } from '@/server/db';
import { DEFAULT_BASKET_POLICY, type BasketLine, type BasketPolicy } from '@/server/ai/basket';
import type { AllocatedLine } from '@/server/ai/basket';
import { resolveRules } from '@/server/ai/rules';

/**
 * Data access for the optional basket haggle at checkout.
 *
 * Two rules are enforced here rather than in the engine, because they are about
 * what the engine is FED:
 *
 * 1. NO DOUBLE-DIP. A line the buyer already negotiated enters at its LOCKED
 *    price, not at list. Feeding list would let round two hand back a discount
 *    already given — or worse, quote a price WORSE than the buyer already
 *    holds, because the basket curve starts near list.
 *
 * 2. NO SELLER LOSS. Each line's floor is the RESOLVED floor from rules.ts —
 *    the strictest of minPrice, cost + margin, and max discount — not the raw
 *    minPrice column, which a seller may have set below their own cost.
 *
 * Floors are recomputed from live rows every turn and never persisted.
 */

const num = (d: unknown) => Number(d);

export interface BasketContext {
  cartId: string;
  lines: BasketLine[];
  /** Public, safe for the client and the LLM. */
  display: Array<{
    variantId: string;
    title: string;
    qty: number;
    startPrice: number;
    seller: string;
    /** True when this line's price was already negotiated on the product page. */
    alreadyNegotiated: boolean;
  }>;
  policy: BasketPolicy;
  sellerCount: number;
  /** Total room left across the basket. 0 = everything is already at its floor. */
  remainingRange: number;
}

export async function loadBasket(userId: string): Promise<BasketContext | null> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: {
      id: true,
      items: {
        select: {
          qty: true,
          variantId: true,
          lockedOffer: { select: { price: true, expiresAt: true, consumed: true } },
          variant: {
            select: {
              listPrice: true,
              minPrice: true, // private
              costPrice: true, // private
              product: {
                select: {
                  title: true,
                  negotiationEnabled: true,
                  maxDiscountPct: true,
                  minMarginPct: true,
                  negotiationAggressiveness: true,
                  negotiationMaxTurns: true,
                  volumeMinQty: true,
                  freebie: true,
                  seller: {
                    select: {
                      id: true,
                      storeName: true,
                      negotiationEnabled: true,
                      negotiationAggressiveness: true,
                      negotiationMaxTurns: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) return null;

  const lines: BasketLine[] = [];
  const display: BasketContext['display'] = [];
  const sellers: Array<{ id: string; aggressiveness: number; maxTurns: number }> = [];

  for (const item of cart.items) {
    const p = item.variant.product;

    const rules = resolveRules(
      {
        listPrice: num(item.variant.listPrice),
        minPrice: num(item.variant.minPrice),
        costPrice: item.variant.costPrice == null ? null : num(item.variant.costPrice),
      },
      {
        negotiationEnabled: p.negotiationEnabled,
        maxDiscountPct: p.maxDiscountPct,
        minMarginPct: p.minMarginPct,
        negotiationAggressiveness: p.negotiationAggressiveness,
        negotiationMaxTurns: p.negotiationMaxTurns,
        volumeMinQty: p.volumeMinQty,
        freebie: p.freebie,
      },
      {
        negotiationEnabled: p.seller.negotiationEnabled,
        negotiationAggressiveness: p.seller.negotiationAggressiveness,
        negotiationMaxTurns: p.seller.negotiationMaxTurns,
      },
    );

    if (!rules.negotiable) continue;

    // Rule 1: start from what the buyer already holds, if anything.
    const live =
      item.lockedOffer && !item.lockedOffer.consumed && item.lockedOffer.expiresAt > new Date()
        ? num(item.lockedOffer.price)
        : null;
    const startPrice = live ?? num(item.variant.listPrice);

    // A line already at or below its floor has nothing left to give. Including
    // it with listPrice < minPrice would throw in the engine's band check.
    if (startPrice <= rules.floor) {
      display.push({
        variantId: item.variantId,
        title: p.title,
        qty: item.qty,
        startPrice,
        seller: p.seller.storeName,
        alreadyNegotiated: live != null,
      });
      continue;
    }

    lines.push({
      variantId: item.variantId,
      qty: item.qty,
      listPrice: startPrice,
      minPrice: rules.floor, // Rule 2: the resolved floor, never the raw column.
    });
    display.push({
      variantId: item.variantId,
      title: p.title,
      qty: item.qty,
      startPrice,
      seller: p.seller.storeName,
      alreadyNegotiated: live != null,
    });
    sellers.push({
      id: p.seller.id,
      aggressiveness: rules.aggressiveness,
      maxTurns: rules.maxTurns,
    });
  }

  if (lines.length === 0) return null;

  // A multi-vendor basket has several policies in play. Take the most
  // conservative combination so no seller concedes faster than they configured.
  const policy: BasketPolicy = {
    aggressiveness: Math.min(...sellers.map((s) => s.aggressiveness), DEFAULT_BASKET_POLICY.aggressiveness),
    maxTurns: Math.min(...sellers.map((s) => s.maxTurns), DEFAULT_BASKET_POLICY.maxTurns),
  };

  return {
    cartId: cart.id,
    lines,
    display,
    policy,
    sellerCount: new Set(sellers.map((s) => s.id)).size,
    remainingRange: lines.reduce((s, l) => s + (l.listPrice - l.minPrice) * l.qty, 0),
  };
}

/**
 * Materialise an agreed basket price as one LockedOffer per line.
 *
 * Reusing the per-variant LockedOffer is deliberate: priceCart already turns
 * `cartItem.lockedOffer.price` into the line's unitPrice, so checkout, Razorpay
 * totals, per-seller commission and payouts keep working untouched.
 */
export async function lockBasket(opts: {
  userId: string;
  cartId: string;
  basketId: string;
  allocation: AllocatedLine[];
  expiresAt: Date;
}): Promise<void> {
  const { userId, cartId, basketId, allocation, expiresAt } = opts;

  await prisma.$transaction(async (tx) => {
    const variantIds = allocation.map((a) => a.variantId);
    const items = await tx.cartItem.findMany({
      where: { cartId, variantId: { in: variantIds } },
      select: { id: true, variantId: true, lockedOfferId: true },
    });

    // Replace any earlier offer on these lines — cartItem.lockedOfferId is
    // unique, so the old row has to be detached before the new one attaches.
    const stale = items.map((i) => i.lockedOfferId).filter((v): v is string => Boolean(v));
    if (stale.length) {
      await tx.cartItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { lockedOfferId: null },
      });
      await tx.lockedOffer.deleteMany({ where: { id: { in: stale }, consumed: false } });
    }

    const byVariant = new Map(items.map((i) => [i.variantId, i.id]));
    for (const a of allocation) {
      const cartItemId = byVariant.get(a.variantId);
      if (!cartItemId) continue; // line vanished mid-haggle
      const offer = await tx.lockedOffer.create({
        data: { userId, variantId: a.variantId, price: a.unitPrice, expiresAt, basketId },
        select: { id: true },
      });
      await tx.cartItem.update({ where: { id: cartItemId }, data: { lockedOfferId: offer.id } });
    }
  });
}
