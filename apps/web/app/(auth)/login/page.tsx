import { Suspense } from 'react';
import { googleAuthEnabled } from '@/server/auth';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  // Server component: whether Google is configured is an env fact, so resolve it
  // here rather than shipping a button that may have no provider behind it.
  return (
    <Suspense>
      <LoginForm googleEnabled={googleAuthEnabled} />
    </Suspense>
  );
}
