'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc/client';

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const isSeller = params.get('role') === 'seller';
  const signup = trpc.auth.signup.useMutation();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await signup.mutateAsync({ name, email, password, role: isSeller ? 'SELLER' : 'BUYER' });
      const res = await signIn('credentials', { email, password, redirect: false });
      if (res?.error) throw new Error(res.error);
      toast.success(isSeller ? 'Seller account created — pending approval' : 'Account created');
      router.push(isSeller ? '/seller' : next);
    } catch (e) {
      toast.error((e as Error).message ?? 'Could not sign up');
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl">{isSeller ? 'Become a seller' : 'Create an account'}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isSeller
          ? 'Set up your store. We approve sellers within 24 hours.'
          : 'It only takes a minute.'}
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">{isSeller ? 'Store name' : 'Full name'}</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={signup.isPending}>
          {signup.isPending ? 'Creating…' : isSeller ? 'Create seller account' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-fg hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
