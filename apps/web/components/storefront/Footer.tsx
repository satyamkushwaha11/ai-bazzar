import Link from 'next/link';
import { auth } from '@/server/auth';
import { Logo } from './Logo';

export async function Footer() {
  const session = await auth();
  const alreadySells = session?.user?.role === 'SELLER';

  return (
    <footer className="mt-24 border-t border-border bg-muted/40">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-muted-foreground">
            India's first AI-powered marketplace where you can <em>haggle</em> with sellers — just like in a real bazaar.
          </p>
        </div>
        <FooterCol
          title="Shop"
          links={[
            ['Footwear', '/c/footwear'],
            ['Electronics', '/c/electronics'],
            ['Home & Kitchen', '/c/home-kitchen'],
            ['Fashion', '/c/fashion'],
          ]}
        />
        <FooterCol
          title="Sellers"
          links={[
            // Someone who already sells doesn't need a signup pitch.
            ...(alreadySells ? [] : ([['Become a seller', '/signup?role=seller']] as [string, string][])),
            ['Seller dashboard', '/seller'],
            ['Pricing & fees', '/sellers/pricing'],
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            ['About', '/about'],
            ['Contact', '/contact'],
            ['Privacy', '/privacy'],
            ['Terms', '/terms'],
          ]}
        />
      </div>
      <div className="border-t border-border/60">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} AI Bazaar. All rights reserved.</span>
          <span>Made in India · Built with Claude</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <ul className="text-sm">
        {links.map(([label, href]) => (
          <li key={href}>
            {/*
              inline-flex + min-height, not bare text: these were 18px tall,
              under the 24px WCAG 2.5.8 minimum and awkward to hit on a phone,
              where the footer is a primary nav rather than an afterthought.
            */}
            <Link
              href={href}
              className="inline-flex min-h-[32px] items-center text-muted-foreground transition-colors hover:text-fg"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
