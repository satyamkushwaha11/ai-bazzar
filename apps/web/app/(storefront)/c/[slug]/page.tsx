import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/server/db';
import { ProductCard } from '@/components/storefront/ProductCard';
import { FacetRail } from '@/components/storefront/FacetRail';
import { ListingToolbar } from '@/components/storefront/ListingToolbar';
import { fromSearchParams, type RawSearchParams } from '@/lib/listing';
import {
  buildOrderBy,
  buildWhere,
  getFacets,
  PRODUCT_CARD_SELECT,
} from '@/server/services/listing';

export const dynamic = 'force-dynamic';

const TAKE = 48;

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const cat = await prisma.category.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      parent: { select: { name: true, slug: true } },
      children: { select: { id: true, name: true, slug: true }, orderBy: { position: 'asc' } },
    },
  });
  if (!cat) notFound();

  // Products hang off subcategories, so a department page has to search its
  // children; a subcategory page searches only itself.
  const subtreeIds = cat.children.length ? cat.children.map((c) => c.id) : [cat.id];

  const listing = fromSearchParams(sp, { sort: 'relevance' });
  const opts = { categoryIds: subtreeIds };
  const where = buildWhere(listing, opts);

  const [products, total, facets] = await Promise.all([
    prisma.product.findMany({
      where: where as never,
      orderBy: buildOrderBy(listing.sort),
      take: TAKE,
      select: PRODUCT_CARD_SELECT,
    }),
    prisma.product.count({ where: where as never }),
    getFacets(listing, opts),
  ]);

  return (
    <div className="container-page py-5">
      <nav aria-label="Breadcrumb" className="pb-3 text-[12px] text-muted-foreground">
        <Link href="/" className="hover:text-fg">
          Home
        </Link>
        {cat.parent && (
          <>
            <span className="mx-1.5">/</span>
            <Link href={`/c/${cat.parent.slug}`} className="hover:text-fg">
              {cat.parent.name}
            </Link>
          </>
        )}
        <span className="mx-1.5">/</span>
        <span className="text-fg">{cat.name}</span>
      </nav>

      {/* Subcategory shortcuts — the department landing pattern. */}
      {cat.children.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5 border-b border-border pb-4">
          {cat.children.map((c) => (
            <Link
              key={c.id}
              href={`/c/${c.slug}`}
              className="rounded-full border border-border px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-fg/40 hover:text-fg"
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <FacetRail facets={facets} params={listing} />

        <div className="min-w-0 flex-1">
          <ListingToolbar
            total={total}
            shown={products.length}
            sort={listing.sort}
            heading={<span className="font-display text-base">{cat.name}</span>}
          />

          {products.length === 0 ? (
            <div className="mt-10 rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No products match these filters.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  p={{ ...p, minListPrice: p.minListPrice ? Number(p.minListPrice) : null }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
