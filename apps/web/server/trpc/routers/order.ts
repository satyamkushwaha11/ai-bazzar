import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { priceCart } from '../../services/pricing';
import { isPaymentMethodEnabled } from '@/lib/payments';
import { createRazorpayOrder, razorpayEnabled, verifyPaymentSignature } from '../../services/razorpay';

export const orderRouter = router({
  preview: protectedProcedure
    .input(z.object({ couponCode: z.string().optional() }))
    .query(({ ctx, input }) => priceCart(ctx.userId, input.couponCode)),

  /**
   * Place an order.
   *
   * COD places it outright: the money arrives on delivery, so there is no
   * gateway round trip and the seller can ship immediately (status CONFIRMED,
   * which is deliberately distinct from PENDING_PAYMENT — the latter means
   * "waiting on Razorpay", and a COD order is not waiting on anything).
   *
   * ONLINE still creates a Razorpay order and returns the handoff, but is gated
   * by lib/payments.ts until the merchant account is live.
   */
  initiate: protectedProcedure
    .input(
      z.object({
        addressId: z.string(),
        couponCode: z.string().optional(),
        paymentMethod: z.enum(['COD', 'ONLINE']).default('COD'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Re-check server-side: a disabled method must not be reachable by
      // crafting a request, no matter what the UI offers.
      if (!isPaymentMethodEnabled(input.paymentMethod)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That payment method is not available yet. Please use Cash on Delivery.',
        });
      }

      const priced = await priceCart(ctx.userId, input.couponCode);
      if (priced.lines.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cart is empty' });

      const address = await ctx.prisma.address.findUnique({ where: { id: input.addressId } });
      if (!address || address.userId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Address not found' });
      }

      const isCod = input.paymentMethod === 'COD';

      const order = await ctx.prisma.order.create({
        data: {
          buyerId: ctx.userId,
          addressId: input.addressId,
          paymentMethod: input.paymentMethod,
          status: isCod ? 'CONFIRMED' : 'PENDING_PAYMENT',
          subtotal: priced.subtotal,
          discount: priced.discount,
          shipping: priced.shipping,
          tax: priced.tax,
          total: priced.total,
          couponCode: priced.couponCode ?? null,
          items: {
            create: priced.lines.map((l) => ({
              sellerId: l.sellerId,
              variantId: l.variantId,
              qty: l.qty,
              unitPrice: l.unitPrice,
            })),
          },
        },
        include: { items: true },
      });

      if (isCod) {
        // A Payment row is still written so reporting and payouts have one shape
        // to read, regardless of how the money arrives. It stays CREATED until
        // the courier collects.
        await ctx.prisma.payment.create({
          data: {
            orderId: order.id,
            provider: 'cod',
            providerOrderId: `cod_${order.id}`,
            status: 'CREATED',
            amount: priced.total,
          },
        });
        await markCartConsumed(ctx.prisma, ctx.userId);
        return { mode: 'cod' as const, orderId: order.id, amount: priced.total };
      }

      if (!razorpayEnabled) {
        // Dev fallback: pretend payment succeeded so the flow is testable without keys.
        await ctx.prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
        await markCartConsumed(ctx.prisma, ctx.userId);
        return { mode: 'stub' as const, orderId: order.id };
      }

      const rzpOrder = await createRazorpayOrder({
        amountInRupees: priced.total,
        receipt: order.id,
        notes: { orderId: order.id, userId: ctx.userId },
      });
      await ctx.prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'razorpay',
          providerOrderId: rzpOrder.id,
          status: 'CREATED',
          amount: priced.total,
        },
      });
      return {
        mode: 'razorpay' as const,
        orderId: order.id,
        razorpayOrderId: rzpOrder.id,
        amount: priced.total,
        currency: 'INR',
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
      };
    }),

  /** Called from the client after Razorpay checkout success. Verifies signature, marks order PAID. */
  confirm: protectedProcedure
    .input(
      z.object({
        orderId: z.string(),
        razorpayOrderId: z.string(),
        razorpayPaymentId: z.string(),
        razorpaySignature: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ok = verifyPaymentSignature({
        orderId: input.razorpayOrderId,
        paymentId: input.razorpayPaymentId,
        signature: input.razorpaySignature,
      });
      if (!ok) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid payment signature' });
      const order = await ctx.prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order || order.buyerId !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.prisma.$transaction([
        ctx.prisma.payment.update({
          where: { orderId: input.orderId },
          data: {
            providerPaymentId: input.razorpayPaymentId,
            status: 'CAPTURED',
          },
        }),
        ctx.prisma.order.update({ where: { id: input.orderId }, data: { status: 'PAID' } }),
      ]);
      await markCartConsumed(ctx.prisma, ctx.userId);
      return { ok: true };
    }),

  myOrders: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.order.findMany({
      where: { buyerId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            variant: {
              select: {
                imageUrl: true,
                product: { select: { title: true, slug: true } },
              },
            },
          },
        },
      },
    }),
  ),

  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const o = await ctx.prisma.order.findUnique({
      where: { id: input.id },
      include: {
        address: true,
        items: { include: { variant: { select: { imageUrl: true, product: { select: { title: true } } } } } },
        payment: true,
      },
    });
    if (!o || o.buyerId !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND' });
    return o;
  }),
});

async function markCartConsumed(prisma: typeof import('../../db').prisma, userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
  if (!cart) return;
  const offerIds = cart.items.map((i) => i.lockedOfferId).filter(Boolean) as string[];
  await prisma.$transaction([
    ...(offerIds.length ? [prisma.lockedOffer.updateMany({ where: { id: { in: offerIds } }, data: { consumed: true } })] : []),
    prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),
  ]);
}
