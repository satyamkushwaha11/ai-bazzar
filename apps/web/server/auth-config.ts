/**
 * Auth facts that are pure env reads — no NextAuth, no Prisma, no adapter.
 *
 * Kept apart from server/auth.ts deliberately. That module constructs NextAuth
 * with PrismaAdapter(prisma), so importing it just to ask "is Google
 * configured?" drags a `new PrismaClient()` in with it. On a PRERENDERED page
 * (/login is static) that runs at BUILD time, and Prisma throws when
 * DATABASE_URL is absent — turning a two-env-var question into a build-time
 * database dependency.
 *
 * SERVER ONLY. These are unprefixed env vars, so they are undefined in the
 * browser: a client component importing this would silently see `false` and
 * hide the Google button even when it is configured. Read it in a server
 * component and pass the result down as a prop, as app/(auth)/login does.
 */
export const googleAuthEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);
