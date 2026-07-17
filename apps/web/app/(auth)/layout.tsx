import Link from 'next/link';
import { Logo } from '@/components/storefront/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden gradient-mesh md:flex md:flex-col md:justify-between md:p-10">
        <Logo />
        <div>
          <h2 className="font-display text-4xl leading-tight">
            Negotiate. <em>Save.</em>
          </h2>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            AI Bazaar lets you chat down the price on every product — powered by AI, settled in seconds.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} AI Bazaar</div>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-6 md:hidden">
          <Logo />
          <Link href="/" className="text-xs text-muted-foreground">← Back</Link>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
