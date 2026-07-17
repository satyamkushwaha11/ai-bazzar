import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { z } from 'zod';
import { prisma } from './db';
import { Role } from '@repo/db';
import { verifyPassword } from './services/password';
import { googleAuthEnabled } from './auth-config';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession['user'];
  }
  interface User {
    role?: Role;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * Google is only registered when it is actually configured.
 *
 * Auth.js validates provider config at construction, so an unconditional
 * Google() with an undefined clientId throws and takes ALL sign-in down with it
 * — including email/password, which needs no Google keys at all. That makes
 * AUTH_GOOGLE_ID a hidden hard requirement for every deploy.
 *
 * Matches how the rest of the app treats optional integrations (see
 * ai/client.ts, redis.ts, services/razorpay.ts): degrade, don't crash.
 *
 * The flag lives in auth-config.ts so pages can read it without importing this
 * module — which would pull Prisma into their bundle. Single source of truth.
 */
const googleConfigured = googleAuthEnabled;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  trustHost: true,
  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash) return null;
        const ok = verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role ?? Role.BUYER;
      }
      if (trigger === 'update' && token.id) {
        const fresh = await prisma.user.findUnique({ where: { id: token.id as string } });
        if (fresh) token.role = fresh.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      if (token.role) session.user.role = token.role as Role;
      return session;
    },
  },
});
