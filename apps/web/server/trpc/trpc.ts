import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { auth } from '../auth';
import { prisma } from '../db';
import { Role } from '@repo/db';

export interface CreateContextOptions {
  req?: Request;
  headers: Headers;
}

export async function createTRPCContext({ headers }: CreateContextOptions) {
  const session = await auth();
  return { session, prisma, headers };
}
export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, session: ctx.session, userId: ctx.session.user.id } });
});

const enforceRole = (...roles: Role[]) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (!roles.includes(ctx.session.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
    return next({ ctx: { ...ctx, session: ctx.session, userId: ctx.session.user.id } });
  });

export const protectedProcedure = t.procedure.use(enforceAuth);
export const sellerProcedure = t.procedure.use(enforceRole(Role.SELLER, Role.ADMIN));
export const adminProcedure = t.procedure.use(enforceRole(Role.ADMIN));
