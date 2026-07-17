import { z } from 'zod';
import { router, adminProcedure } from '../trpc';

export const adminRouter = router({
  stats: adminProcedure.query(async ({ ctx }) => {
    const [users, sellers, products, orders, gmv] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.seller.count(),
      ctx.prisma.product.count(),
      ctx.prisma.order.count({ where: { status: { in: ['PAID', 'PARTIALLY_FULFILLED', 'FULFILLED'] } } }),
      ctx.prisma.order.aggregate({
        _sum: { total: true },
        where: { status: { in: ['PAID', 'PARTIALLY_FULFILLED', 'FULFILLED'] } },
      }),
    ]);
    return {
      users,
      sellers,
      products,
      orders,
      gmv: Number(gmv._sum.total ?? 0),
    };
  }),

  sellers: adminProcedure
    .input(z.object({ status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']).optional() }))
    .query(({ ctx, input }) =>
      ctx.prisma.seller.findMany({
        where: input.status ? { status: input.status } : undefined,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, name: true, image: true } } },
      }),
    ),

  setSellerStatus: adminProcedure
    .input(z.object({ id: z.string(), status: z.enum(['APPROVED', 'SUSPENDED', 'REJECTED', 'PENDING']) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.seller.update({ where: { id: input.id }, data: { status: input.status } });
    }),

  users: adminProcedure.query(({ ctx }) =>
    ctx.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
  ),

  orders: adminProcedure.query(({ ctx }) =>
    ctx.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        buyer: { select: { name: true, email: true } },
        items: { select: { id: true, qty: true, unitPrice: true } },
      },
    }),
  ),

  upsertCategory: adminProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(2),
        slug: z.string().min(2),
        parentId: z.string().optional(),
        imageUrl: z.string().url().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.prisma.category.upsert({
        where: { id: input.id ?? '__new__' },
        update: input,
        create: input,
      }),
    ),
});
