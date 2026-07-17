import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ShieldCheck, Tag, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductCard, type ProductCardData } from '@/components/storefront/ProductCard';
import { auth } from '@/server/auth';
import { prisma } from '@/server/db';

/**
 * Department tiles. Images are pinned here rather than read from
 * Category.imageUrl so the homepage never renders a broken hero tile if a
 * category row is edited; every id below is verified to resolve.
 */
const DEPT_IMAGES: Record<string, string> = {
  footwear: 'photo-1542291026-7eec264c27ff',
  electronics: 'photo-1498049794561-7780e7231661',
  'home-kitchen': 'photo-1556909114-f6e7ad7d3136',
  fashion: 'photo-1495121605193-b116b5b9c5fe',
  beauty: 'photo-1596462502278-27bfdc403348',
  'sports-fitness': 'photo-1517836357463-d25dfeac3438',
  'books-stationery': 'photo-1512820790803-83ca734da794',
  'toys-games': 'photo-1558060370-d644479cb6f7',
  furniture: 'photo-1555041469-a586c61ea9bc',
  'grocery-gourmet': 'photo-1542838132-92c53300491e',
  'watches-accessories': 'photo-1524592094714-0f0654e20314',
  'pet-supplies': 'photo-1450778869180-41d0601e046e',
  appliances: 'photo-1585659722983-3a675dabf23d',
  'baby-kids': 'photo-1522771930-78848d9293e8',
  automotive: 'photo-1503376780353-7e6692767b70',
  'garden-outdoor': 'photo-1416879595882-3373a0480b5b',
  'musical-instruments': 'photo-1511671782779-c97d3d27a1d4',
  jewellery: 'photo-1515562141207-7a88fb7ce338',
};

const CARD_SELECT = {
  id: true,
  title: true,
  slug: true,
  brand: true,
  rating: true,
  reviewCount: true,
  minListPrice: true,
  images: { take: 1, orderBy: { position: 'asc' as const }, select: { url: true, alt: true } },
  seller: { select: { storeName: true } },
};

export default async function HomePage() {
  // Read server-side rather than via useSession: a client check would render
  // "Become a seller" first and then yank it away once the session resolves,
  // which is exactly the flash we want to avoid for people who already sell.
  const session = await auth();
  const alreadySells = session?.user?.role === 'SELLER';

  const [justIn, topRated, departments, productCount] = await Promise.all([
    prisma.product.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: CARD_SELECT,
    }),
    prisma.product.findMany({
      where: { status: 'ACTIVE', reviewCount: { gt: 0 } },
      orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
      take: 10,
      select: CARD_SELECT,
    }),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { position: 'asc' },
      select: { name: true, slug: true },
    }),
    prisma.product.count({ where: { status: 'ACTIVE' } }),
  ]);

  return (
    <div className="container-page pb-16">
      {/* Compact value band. A marketplace has to reach product within a screen. */}
      <section className="mt-4 grid overflow-hidden rounded-lg border border-border md:grid-cols-[1fr_auto]">
        <div className="flex flex-col justify-center gap-3 p-6 md:p-8">
          <h1 className="font-display text-3xl leading-tight md:text-4xl">
            Don&rsquo;t just shop. Haggle.
          </h1>
          <p className="max-w-lg text-sm text-muted-foreground">
            Ask our AI assistant to find anything across 50,000 products — then chat the price down
            with the shopkeeper before you buy. Sellers set a fair range, the AI finds the deal, and
            your price locks for 10 minutes.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/search">
                Start shopping <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {/* Pointless for someone who already has a store — send them to it. */}
            {alreadySells ? (
              <Button asChild variant="outline">
                <Link href="/seller">Seller dashboard</Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/signup?role=seller">Become a seller</Link>
              </Button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified sellers
            </span>
            <span className="flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Pan-India delivery
            </span>
            <span className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" /> Locked-price guarantee
            </span>
          </div>
        </div>

        {/* Worked example of a haggle — the one thing that explains the product. */}
        <div className="hidden w-[380px] border-l border-border bg-muted/40 p-6 md:block">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-fg text-[10px] font-bold text-bg">
              B
            </span>
            <div className="text-xs font-medium">AI Bazaar</div>
            <div className="text-xs text-muted-foreground">· Stride Footwear</div>
          </div>
          <div className="space-y-1.5 text-[13px]">
            <Bubble side="buyer">Can you do ₹3,500 for the AeroRun Pro?</Bubble>
            <Bubble side="seller">
              Best I can do is <strong>₹3,899</strong> — free shipping included, friend.
            </Bubble>
            <Bubble side="buyer">Deal!</Bubble>
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[12px]">
              Locked at <strong className="tabular">₹3,899</strong> — add to cart within 10 minutes.
            </div>
          </div>
        </div>
      </section>

      <Section
        title="Shop by department"
        subtitle={`${productCount.toLocaleString('en-IN')} products across ${departments.length} departments.`}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {departments.map((d) => (
            <Link
              key={d.slug}
              href={`/c/${d.slug}`}
              className="group relative aspect-[5/3] overflow-hidden rounded-lg border border-border transition-colors hover:border-fg/25"
            >
              {DEPT_IMAGES[d.slug] && (
                <Image
                  src={`https://images.unsplash.com/${DEPT_IMAGES[d.slug]}?w=600&q=80`}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, 17vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-2 left-2.5 right-2 text-[12px] font-medium leading-tight text-white">
                {d.name}
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Just in" subtitle="Fresh from independent sellers — every item negotiable.">
        <ProductGrid products={justIn} />
      </Section>

      {topRated.length > 0 && (
        <Section title="Top rated" subtitle="Highest-rated products across the marketplace.">
          <ProductGrid products={topRated} />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  href,
  linkLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="shrink-0 text-[13px] text-muted-foreground hover:text-fg">
            {linkLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Prisma hands back Decimal for minListPrice; ProductCard wants a plain number. */
type RawProduct = Omit<ProductCardData, 'minListPrice'> & { minListPrice: unknown };

function ProductGrid({ products }: { products: RawProduct[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          p={{ ...p, minListPrice: p.minListPrice ? Number(p.minListPrice) : null }}
        />
      ))}
    </div>
  );
}

function Bubble({ side, children }: { side: 'buyer' | 'seller'; children: React.ReactNode }) {
  const buyer = side === 'buyer';
  return (
    <div
      className={
        buyer
          ? 'ml-auto max-w-[85%] rounded-md rounded-tr-sm bg-fg px-3 py-1.5 text-bg'
          : 'max-w-[85%] rounded-md rounded-tl-sm border border-border bg-bg px-3 py-1.5'
      }
    >
      {children}
    </div>
  );
}
