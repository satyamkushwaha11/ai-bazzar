import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { parseSearch, SearchFilterSchema } from '../../ai/search';

/**
 * Buyer-facing catalog router.
 *
 * IMPORTANT: NEVER select ProductVariant.minPrice in any procedure here.
 * minPrice is the seller's private floor used only by the negotiation engine.
 */
const PUBLIC_VARIANT_SELECT = {
  id: true,
  sku: true,
  attrs: true,
  stock: true,
  listPrice: true,
  imageUrl: true,
  // minPrice: NEVER
} as const;

export const catalogRouter = router({
  categories: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.category.findMany({
      orderBy: { position: 'asc' },
      select: { id: true, name: true, slug: true, parentId: true, imageUrl: true },
    });
  }),

  list: publicProcedure
    .input(
      z.object({
        categorySlug: z.string().optional(),
        q: z.string().optional(),
        sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest', 'rating']).default('relevance'),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(48).default(12),
        minPrice: z.number().nullable().optional(),
        maxPrice: z.number().nullable().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const where: Parameters<typeof ctx.prisma.product.findMany>[0] extends infer T ? Extract<T, object> : never = {
        status: 'ACTIVE',
      } as Record<string, unknown>;
      if (input.categorySlug) (where as Record<string, unknown>).category = { slug: input.categorySlug };
      if (input.q && input.q.trim()) {
        (where as Record<string, unknown>).OR = [
          { title: { contains: input.q, mode: 'insensitive' } },
          { description: { contains: input.q, mode: 'insensitive' } },
          { brand: { contains: input.q, mode: 'insensitive' } },
        ];
      }
      if (input.minPrice != null || input.maxPrice != null) {
        (where as Record<string, unknown>).minListPrice = {
          ...(input.minPrice != null ? { gte: input.minPrice } : {}),
          ...(input.maxPrice != null ? { lte: input.maxPrice } : {}),
        };
      }

      const orderBy = (() => {
        switch (input.sort) {
          case 'price_asc':
            return { minListPrice: 'asc' as const };
          case 'price_desc':
            return { minListPrice: 'desc' as const };
          case 'newest':
            return { createdAt: 'desc' as const };
          case 'rating':
            return { rating: 'desc' as const };
          default:
            return { createdAt: 'desc' as const };
        }
      })();

      const [items, total] = await Promise.all([
        ctx.prisma.product.findMany({
          where: where as never,
          orderBy,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          select: {
            id: true,
            title: true,
            slug: true,
            brand: true,
            rating: true,
            reviewCount: true,
            minListPrice: true,
            images: { take: 1, orderBy: { position: 'asc' }, select: { url: true, alt: true } },
            seller: { select: { storeName: true, slug: true } },
          },
        }),
        ctx.prisma.product.count({ where: where as never }),
      ]);

      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
        pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  bySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input, ctx }) => {
    const product = await ctx.prisma.product.findUnique({
      where: { slug: input.slug },
      select: {
        id: true,
        title: true,
        slug: true,
        brand: true,
        description: true,
        rating: true,
        reviewCount: true,
        attrs: true,
        category: { select: { name: true, slug: true } },
        images: { orderBy: { position: 'asc' }, select: { url: true, alt: true } },
        variants: { select: PUBLIC_VARIANT_SELECT, orderBy: { listPrice: 'asc' } },
        seller: {
          select: {
            id: true,
            storeName: true,
            slug: true,
            logoUrl: true,
            negotiationEnabled: true,
          },
        },
        reviews: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            rating: true,
            title: true,
            body: true,
            createdAt: true,
            user: { select: { name: true, image: true } },
          },
        },
      },
    });
    if (!product) throw new TRPCError({ code: 'NOT_FOUND' });
    return product;
  }),

  /** AI-powered natural-language search. Falls back to keyword search on AI failure. */
  smartSearch: publicProcedure
    .input(z.object({ q: z.string().min(1).max(200) }))
    .query(async ({ input, ctx }) => {
      const filter = await parseSearch(input.q);
      const where: Record<string, unknown> = { status: 'ACTIVE' };
      if (filter.categorySlugs.length) where.category = { slug: { in: filter.categorySlugs } };
      if (filter.brands.length) where.brand = { in: filter.brands };
      if (filter.minPrice != null || filter.maxPrice != null) {
        where.minListPrice = {
          ...(filter.minPrice != null ? { gte: filter.minPrice } : {}),
          ...(filter.maxPrice != null ? { lte: filter.maxPrice } : {}),
        };
      }
      if (filter.query) {
        where.OR = [
          { title: { contains: filter.query, mode: 'insensitive' } },
          { description: { contains: filter.query, mode: 'insensitive' } },
          { brand: { contains: filter.query, mode: 'insensitive' } },
        ];
      }
      const orderBy =
        filter.sort === 'price_asc'
          ? { minListPrice: 'asc' as const }
          : filter.sort === 'price_desc'
            ? { minListPrice: 'desc' as const }
            : filter.sort === 'rating'
              ? { rating: 'desc' as const }
              : { createdAt: 'desc' as const };

      const items = await ctx.prisma.product.findMany({
        where: where as never,
        orderBy,
        take: 24,
        select: {
          id: true,
          title: true,
          slug: true,
          brand: true,
          rating: true,
          reviewCount: true,
          minListPrice: true,
          images: { take: 1, orderBy: { position: 'asc' }, select: { url: true } },
          seller: { select: { storeName: true } },
        },
      });
      return { filter, items };
    }),

  toggleWishlist: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.prisma.wishlist.findUnique({
        where: { userId_productId: { userId: ctx.userId, productId: input.productId } },
      });
      if (exists) {
        await ctx.prisma.wishlist.delete({
          where: { userId_productId: { userId: ctx.userId, productId: input.productId } },
        });
        return { wishlisted: false };
      }
      await ctx.prisma.wishlist.create({
        data: { userId: ctx.userId, productId: input.productId },
      });
      return { wishlisted: true };
    }),

  myWishlist: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.wishlist.findMany({
      where: { userId: ctx.userId },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            minListPrice: true,
            images: { take: 1, orderBy: { position: 'asc' }, select: { url: true } },
          },
        },
      },
    }),
  ),
});

export type SearchFilterT = z.infer<typeof SearchFilterSchema>;
