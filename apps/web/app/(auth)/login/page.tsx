import { Suspense } from 'react';
import { googleAuthEnabled } from '@/server/auth-config';
import { LoginForm } from './LoginForm';

/**
 * Imports auth-config, NOT server/auth: this page is prerendered, and
 * server/auth builds NextAuth with PrismaAdapter — which would instantiate
 * Prisma at build time just to read two env vars.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm googleEnabled={googleAuthEnabled} />
    </Suspense>
  );
}
