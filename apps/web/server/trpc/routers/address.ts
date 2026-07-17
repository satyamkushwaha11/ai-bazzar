import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

const addressInput = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(8),
  line1: z.string().min(2),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(4),
  country: z.string().default('IN'),
  isDefault: z.boolean().optional(),
});

export const addressRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.address.findMany({ where: { userId: ctx.userId }, orderBy: { isDefault: 'desc' } }),
  ),
  create: protectedProcedure.input(addressInput).mutation(async ({ ctx, input }) => {
    if (input.isDefault) {
      await ctx.prisma.address.updateMany({ where: { userId: ctx.userId }, data: { isDefault: false } });
    }
    return ctx.prisma.address.create({ data: { ...input, userId: ctx.userId } });
  }),
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(addressInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const a = await ctx.prisma.address.findUnique({ where: { id } });
      if (!a || a.userId !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND' });
      if (rest.isDefault) {
        await ctx.prisma.address.updateMany({ where: { userId: ctx.userId }, data: { isDefault: false } });
      }
      return ctx.prisma.address.update({ where: { id }, data: rest });
    }),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const a = await ctx.prisma.address.findUnique({ where: { id: input.id } });
    if (!a || a.userId !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND' });
    await ctx.prisma.address.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
