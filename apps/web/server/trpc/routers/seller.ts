import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, sellerProcedure } from '../trpc';
import { Role } from '@repo/db';
import { slugify } from '@/lib/utils';
import { resolveRules } from '@/server/ai/rules';
import { reembedProduct } from '@/server/services/embeddings';

const variantInput = z.object({
  id: z.string().optional(),
  sku: z.string().min(2),
  attrs: z.record(z.string(), z.string()).default({}),
  stock: z.number().int().min(0).default(0),
  listPrice: z.number().positive(),
  minPrice: z.number().positive(),
  /** What this unit costs the seller. Feeds the profit floor — never public. */
  costPrice: z.number().positive().nullish(),
  imageUrl: z.string().url().optional(),
});

/**
 * Per-product negotiation rules. All nullable — null means "inherit my store
 * default", which is why these are `.nullish()` rather than `.optional()`:
 * clearing a field must persist as NULL, not silently keep the old override.
 */
const productInput = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(10),
  brand: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  images: z.array(z.string().url()).default([]),
  variants: z.array(variantInput).min(1),

  negotiationEnabled: z.boolean().nullish(),
  minMarginPct: z.number().min(0).max(95).nullish(),
  maxDiscountPct: z.number().min(0).max(95).nullish(),
  negotiationAggressiveness: z.number().min(0).max(1).nullish(),
  negotiationMaxTurns: z.number().int().min(1).max(10).nullish(),
  volumeMinQty: z.number().int().min(2).max(50).nullish(),
  freebie: z.string().max(60).nullish(),
});

async function ensureSeller(ctx: { userId: string; prisma: typeof import('../../db').prisma }) {
  const seller = await ctx.prisma.seller.findUnique({ where: { userId: ctx.userId } });
  if (!seller) throw new TRPCError({ code: 'NOT_FOUND', message: 'Seller profile not found' });
  return seller;
}

export const sellerRouter = router({
  me: sellerProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.role === Role.ADMIN) return null;
    return ctx.prisma.seller.findUnique({ where: { userId: ctx.userId } });
  }),

  updateStore: sellerProcedure
    .input(
      z.object({
        storeName: z.string().min(2).optional(),
        bio: z.string().optional(),
        logoUrl: z.string().url().optional(),
        bannerUrl: z.string().url().optional(),
        negotiationEnabled: z.boolean().optional(),
        negotiationAggressiveness: z.number().min(0).max(1).optional(),
        negotiationMaxTurns: z.number().int().min(1).max(8).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ensureSeller(ctx);
      return ctx.prisma.seller.update({ where: { id: s.id }, data: input });
    }),

  products: sellerProcedure.query(async ({ ctx }) => {
    const s = await ensureSeller(ctx);
    return ctx.prisma.product.findMany({
      where: { sellerId: s.id },
      orderBy: { updatedAt: 'desc' },
      include: { variants: true, images: { take: 1, orderBy: { position: 'asc' } } },
    });
  }),

  upsertProduct: sellerProcedure
    .input(z.object({ id: z.string().optional() }).merge(productInput))
    .mutation(async ({ ctx, input }) => {
      const s = await ensureSeller(ctx);
      const slugBase = slugify(input.title);
      const minListPrice = Math.min(...input.variants.map((v) => v.listPrice));

      // Validate min < list per variant
      for (const v of input.variants) {
        if (v.minPrice > v.listPrice) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Variant ${v.sku}: min price cannot exceed list price.`,
          });
        }
      }

      /*
       * Refuse rules that would make the product unsellable, rather than saving
       * them and silently switching negotiation off later. The seller is here
       * right now and can fix it; a buyer hitting a dead "Negotiate" button
       * three days from now cannot.
       */
      for (const v of input.variants) {
        const resolved = resolveRules(
          { listPrice: v.listPrice, minPrice: v.minPrice, costPrice: v.costPrice ?? null },
          {
            negotiationEnabled: input.negotiationEnabled ?? null,
            maxDiscountPct: input.maxDiscountPct ?? null,
            minMarginPct: input.minMarginPct ?? null,
            negotiationAggressiveness: input.negotiationAggressiveness ?? null,
            negotiationMaxTurns: input.negotiationMaxTurns ?? null,
            volumeMinQty: input.volumeMinQty ?? null,
            freebie: input.freebie ?? null,
          },
          {
            negotiationEnabled: s.negotiationEnabled,
            negotiationAggressiveness: s.negotiationAggressiveness,
            negotiationMaxTurns: s.negotiationMaxTurns,
          },
        );
        if (resolved.misconfiguration) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Variant ${v.sku}: ${resolved.misconfiguration}`,
          });
        }
      }

      // `?? null` throughout, not `?? undefined`: clearing a rule must write NULL
      // (= inherit the store default), where undefined would leave the old
      // override in place and quietly ignore the seller's edit.
      const rules = {
        negotiationEnabled: input.negotiationEnabled ?? null,
        minMarginPct: input.minMarginPct ?? null,
        maxDiscountPct: input.maxDiscountPct ?? null,
        negotiationAggressiveness: input.negotiationAggressiveness ?? null,
        negotiationMaxTurns: input.negotiationMaxTurns ?? null,
        volumeMinQty: input.volumeMinQty ?? null,
        freebie: input.freebie?.trim() || null,
      };

      if (input.id) {
        const existing = await ctx.prisma.product.findUnique({ where: { id: input.id } });
        if (!existing || existing.sellerId !== s.id) throw new TRPCError({ code: 'FORBIDDEN' });

        await ctx.prisma.$transaction([
          ctx.prisma.productImage.deleteMany({ where: { productId: input.id } }),
          ctx.prisma.productVariant.deleteMany({ where: { productId: input.id } }),
          ctx.prisma.product.update({
            where: { id: input.id },
            data: {
              title: input.title,
              description: input.description,
              brand: input.brand,
              categoryId: input.categoryId ?? null,
              status: input.status,
              minListPrice,
              ...rules,
              images: { create: input.images.map((url, i) => ({ url, position: i })) },
              variants: { create: input.variants.map(({ id: _id, ...v }) => v) },
            },
          }),
        ]);
        // Re-embed so edits are reflected in semantic search. Fire-and-forget:
        // the seller shouldn't wait on OpenAI, and a failed embed must not fail
        // the save — it only leaves the product on its previous vector.
        void reembedProduct(input.id);
        return { id: input.id };
      }

      const created = await ctx.prisma.product.create({
        data: {
          sellerId: s.id,
          title: input.title,
          slug: `${slugBase}-${Date.now().toString(36)}`,
          description: input.description,
          brand: input.brand,
          categoryId: input.categoryId ?? null,
          status: input.status,
          minListPrice,
          ...rules,
          images: { create: input.images.map((url, i) => ({ url, position: i })) },
          variants: { create: input.variants.map(({ id: _id, ...v }) => v) },
        },
      });
      // Without this a new product is invisible to the assistant and to
      // relevance-sorted search until the next backfill run.
      void reembedProduct(created.id);
      return { id: created.id };
    }),

  deleteProduct: sellerProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const s = await ensureSeller(ctx);
    const p = await ctx.prisma.product.findUnique({ where: { id: input.id } });
    if (!p || p.sellerId !== s.id) throw new TRPCError({ code: 'FORBIDDEN' });
    await ctx.prisma.product.delete({ where: { id: input.id } });
    return { ok: true };
  }),

  orders: sellerProcedure.query(async ({ ctx }) => {
    const s = await ensureSeller(ctx);
    return ctx.prisma.orderItem.findMany({
      where: { sellerId: s.id },
      orderBy: { id: 'desc' },
      include: {
        order: { include: { address: true, buyer: { select: { name: true, email: true } } } },
        variant: { select: { sku: true, imageUrl: true, product: { select: { title: true } } } },
      },
    });
  }),

  updateOrderItem: sellerProcedure
    .input(
      z.object({
        itemId: z.string(),
        status: z.enum(['ACCEPTED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
        trackingId: z.string().optional(),
        trackingUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s = await ensureSeller(ctx);
      const item = await ctx.prisma.orderItem.findUnique({ where: { id: input.itemId } });
      if (!item || item.sellerId !== s.id) throw new TRPCError({ code: 'FORBIDDEN' });
      return ctx.prisma.orderItem.update({
        where: { id: input.itemId },
        data: {
          status: input.status,
          trackingId: input.trackingId,
          trackingUrl: input.trackingUrl,
          shippedAt: input.status === 'SHIPPED' ? new Date() : undefined,
          deliveredAt: input.status === 'DELIVERED' ? new Date() : undefined,
        },
      });
    }),

  analytics: sellerProcedure.query(async ({ ctx }) => {
    const s = await ensureSeller(ctx);
    const items = await ctx.prisma.orderItem.findMany({
      where: { sellerId: s.id, order: { status: { in: ['PAID', 'PARTIALLY_FULFILLED', 'FULFILLED'] } } },
      include: { order: { select: { createdAt: true } } },
    });
    const revenue = items.reduce((sum, i) => sum + Number(i.unitPrice) * i.qty, 0);
    const orders = new Set(items.map((i) => i.id.split('-')[0])).size;
    const unitsSold = items.reduce((s2, i) => s2 + i.qty, 0);

    const byDay = new Map<string, number>();
    for (const i of items) {
      const d = i.order.createdAt.toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + Number(i.unitPrice) * i.qty);
    }
    const series = [...byDay.entries()].sort().slice(-14).map(([date, value]) => ({ date, value }));
    return { revenue, orders, unitsSold, series };
  }),
});
