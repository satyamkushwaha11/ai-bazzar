import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { negotiate } from '../../ai/negotiation';
import { resolveRules } from '../../ai/rules';
import { DEFAULT_STRATEGY, extraConcession, type DealFacts } from '../../ai/strategy';
import { checkLimit, ratelimits } from '../../redis';

/**
 * Non-streaming negotiation endpoints used by the chat UI for state queries
 * and the deterministic engine. The streaming reply lives at /api/ai/negotiate.
 */
export const negotiationRouter = router({
  start: protectedProcedure
    .input(z.object({ variantId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { success } = await checkLimit(ratelimits.negotiate, `start:${ctx.userId}`);
      if (!success) throw new TRPCError({ code: 'TOO_MANY_REQUESTS' });

      const variant = await ctx.prisma.productVariant.findUnique({
        where: { id: input.variantId },
        include: { product: { include: { seller: true } } },
      });
      if (!variant) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!variant.product.seller.negotiationEnabled) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Negotiation disabled for this seller' });
      }

      // Reuse an active session if one exists.
      const existing = await ctx.prisma.negotiationSession.findFirst({
        where: { userId: ctx.userId, variantId: input.variantId, status: 'ACTIVE' },
      });
      if (existing && existing.expiresAt > new Date()) return { sessionId: existing.id };

      const session = await ctx.prisma.negotiationSession.create({
        data: {
          userId: ctx.userId,
          variantId: input.variantId,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
        },
      });
      return { sessionId: session.id };
    }),

  /**
   * What would the shopkeeper charge at this quantity, right now?
   *
   * Engine only — deliberately no LLM. Pricing is deterministic and takes one
   * round trip, whereas writing a sentence about it takes seconds. Tying the
   * two together made the quantity selector feel dead: the buyer changed it and
   * nothing moved until a whole conversational turn completed. This lets the
   * price update the instant they touch the control.
   *
   * Returns the PUBLIC number only. The floor never leaves the server.
   */
  quote: protectedProcedure
    .input(z.object({ sessionId: z.string(), qty: z.number().int().min(1).max(50) }))
    .query(async ({ ctx, input }) => {
      const s = await ctx.prisma.negotiationSession.findUnique({
        where: { id: input.sessionId },
        select: {
          userId: true,
          turns: true,
          variant: {
            select: {
              listPrice: true,
              minPrice: true,
              costPrice: true,
              stock: true,
              product: {
                select: {
                  negotiationEnabled: true,
                  maxDiscountPct: true,
                  minMarginPct: true,
                  negotiationAggressiveness: true,
                  negotiationMaxTurns: true,
                  volumeMinQty: true,
                  freebie: true,
                  seller: {
                    select: {
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
      });
      if (!s || s.userId !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND' });

      const v = s.variant;
      const p = v.product;
      const rules = resolveRules(
        {
          listPrice: Number(v.listPrice),
          minPrice: Number(v.minPrice),
          costPrice: v.costPrice == null ? null : Number(v.costPrice),
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
      if (!rules.negotiable) return null;

      const turns = ((s.turns as unknown) as Array<{ role: string }>) ?? [];
      const turn = turns.filter((t) => t.role === 'buyer').length + 1;

      const facts: DealFacts = {
        qty: input.qty,
        stock: v.stock,
        returningBuyer: false, // not needed for a price preview
        recentHaggles: 0,
        canOfferShipping: true,
        freebie: rules.freebie,
      };
      const strategy = { ...DEFAULT_STRATEGY, aggressiveness: rules.aggressiveness, maxTurns: rules.maxTurns };

      const quoteAt = (qty: number) =>
        negotiate({
          listPrice: Number(v.listPrice),
          minPrice: rules.floor,
          turn,
          buyerOffer: null,
          policy: { aggressiveness: rules.aggressiveness, maxTurns: rules.maxTurns },
          extraConcession: extraConcession(strategy, { ...facts, qty }, false),
        }).counterOffer;

      const unitPrice = quoteAt(input.qty);

      /*
       * Only surface a tier that ACTUALLY saves money. Volume concedes within
       * the range that is left, so a negotiation already at the floor has
       * nothing more to give — and "take 2, save ₹0" is a worse prompt than no
       * prompt at all.
       */
      const candidate = strategy.volumeTiers.find((t) => t.minQty > input.qty)?.minQty ?? null;
      const candidatePrice = candidate ? quoteAt(candidate) : null;
      const worthIt = candidate != null && candidatePrice != null && candidatePrice < unitPrice;

      return {
        qty: input.qty,
        unitPrice,
        total: unitPrice * input.qty,
        listPrice: Number(v.listPrice),
        nextTier: worthIt ? candidate : null,
        nextTierUnitPrice: worthIt ? candidatePrice : null,
        savePerUnitAtNextTier: worthIt ? unitPrice - candidatePrice! : null,
      };
    }),

  get: protectedProcedure.input(z.object({ sessionId: z.string() })).query(async ({ ctx, input }) => {
    const s = await ctx.prisma.negotiationSession.findUnique({
      where: { id: input.sessionId },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            attrs: true,
            listPrice: true,
            imageUrl: true,
            product: {
              select: { title: true, slug: true, seller: { select: { storeName: true, slug: true } } },
            },
          },
        },
        offer: { select: { id: true, price: true, expiresAt: true, consumed: true } },
      },
    });
    if (!s || s.userId !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND' });
    return s;
  }),

  abandon: protectedProcedure.input(z.object({ sessionId: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.negotiationSession.updateMany({
      where: { id: input.sessionId, userId: ctx.userId, status: 'ACTIVE' },
      data: { status: 'ABANDONED', closedAt: new Date() },
    });
    return { ok: true };
  }),
});
