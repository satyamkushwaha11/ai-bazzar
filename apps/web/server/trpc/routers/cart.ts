import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

async function getOrCreateCart(prisma: typeof import('../../db').prisma, userId: string) {
  return prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export const cartRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const cart = await getOrCreateCart(ctx.prisma, ctx.userId);
    const items = await ctx.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            attrs: true,
            listPrice: true,
            imageUrl: true,
            stock: true,
            product: { select: { id: true, title: true, slug: true, sellerId: true } },
          },
        },
        lockedOffer: { select: { price: true, expiresAt: true, consumed: true } },
      },
    });
    return { id: cart.id, items };
  }),

  add: protectedProcedure
    .input(
      z.object({
        variantId: z.string(),
        qty: z.number().int().min(1).max(20).default(1),
        lockedOfferId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cart = await getOrCreateCart(ctx.prisma, ctx.userId);
      const variant = await ctx.prisma.productVariant.findUnique({ where: { id: input.variantId } });
      if (!variant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found' });
      if (variant.stock < input.qty) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Insufficient stock' });

      if (input.lockedOfferId) {
        const offer = await ctx.prisma.lockedOffer.findUnique({ where: { id: input.lockedOfferId } });
        if (
          !offer ||
          offer.userId !== ctx.userId ||
          offer.variantId !== input.variantId ||
          offer.consumed ||
          offer.expiresAt < new Date()
        ) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Offer invalid or expired' });
        }
      }

      return ctx.prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
        update: { qty: { increment: input.qty }, ...(input.lockedOfferId && { lockedOfferId: input.lockedOfferId }) },
        create: {
          cartId: cart.id,
          variantId: input.variantId,
          qty: input.qty,
          lockedOfferId: input.lockedOfferId ?? null,
        },
      });
    }),

  setQty: protectedProcedure
    .input(z.object({ itemId: z.string(), qty: z.number().int().min(0).max(20) }))
    .mutation(async ({ ctx, input }) => {
      if (input.qty === 0) {
        await ctx.prisma.cartItem.delete({ where: { id: input.itemId } });
        return { removed: true };
      }
      return ctx.prisma.cartItem.update({ where: { id: input.itemId }, data: { qty: input.qty } });
    }),

  remove: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.cartItem.delete({ where: { id: input.itemId } });
      return { ok: true };
    }),

  clear: protectedProcedure.mutation(async ({ ctx }) => {
    const cart = await getOrCreateCart(ctx.prisma, ctx.userId);
    await ctx.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { ok: true };
  }),
});
