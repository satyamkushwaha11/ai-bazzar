import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { hashPassword } from '../../services/password';
import { Role } from '@repo/db';

export const authRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80),
        email: z.string().email(),
        password: z.string().min(8).max(128),
        role: z.enum(['BUYER', 'SELLER']).default('BUYER'),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const exists = await ctx.prisma.user.findUnique({ where: { email: input.email } });
      if (exists) throw new TRPCError({ code: 'CONFLICT', message: 'Email already registered' });
      const user = await ctx.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: hashPassword(input.password),
          role: input.role === 'SELLER' ? Role.SELLER : Role.BUYER,
        },
      });
      if (input.role === 'SELLER') {
        const slug =
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') +
          '-' +
          user.id.slice(-5);
        await ctx.prisma.seller.create({
          data: { userId: user.id, storeName: input.name, slug, status: 'PENDING' },
        });
      }
      return { ok: true };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true, name: true, image: true, role: true, phone: true },
    });
  }),
});
