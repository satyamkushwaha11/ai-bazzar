import { prisma } from '@/server/db';
import type { Facets, ListingParams, ListingSort } from '@/lib/listing';
import { embedQuery, semanticSearch } from './embeddings';

/**
 * Prisma-backed query builders for /search and /c/[slug].
 *
 * Facet state lives entirely in the URL so listings stay shareable,
 * server-rendered and back-button correct. On /search the AI-parsed filter
 * seeds those params; any facet the user touches then overrides the AI.
 *
 * Types, constants and URL parsing live in `@/lib/listing` — they are imported
 * by client components and must not pull Prisma into the browser bundle.
 *
 * NOTE: every query here is buyer-facing. Never select ProductVariant.minPrice.
 */

interface WhereOptions {
  /**
   * Pin the listing to a category subtree (category pages).
   *
   * Products always attach to a SUBcategory, never a department, so a
   * department page must pass every child id here — passing the department's
   * own id alone would match nothing.
   */
  categoryIds?: string[];
  /** Omit a facet's own clause so its counts reflect the other filters only. */
  omit?: 'cats' | 'brands';
  /**
   * Candidate ids resolved by the vector index for `p.q`.
   *
   * When present these REPLACE the keyword clause entirely. That ordering is
   * the whole point: "something for my evening jog" appears in no title, so
   * filtering on `title contains` first would leave the vector nothing to rank.
   * The vector resolves the query; SQL only applies the facets on top.
   */
  semanticIds?: string[];
}

/**
 * Match a category slug at EITHER level.
 *
 * Products always attach to a subcategory, but the slugs arriving here are
 * usually departments — the AI query parser emits them, and the facet rail
 * rolls its counts up to them. Matching `slug` alone silently returns zero for
 * every department, which is not a filter returning nothing, it's a bug.
 */
const categoryFilter = (slugs: string[]) => ({
  OR: [{ slug: { in: slugs } }, { parent: { slug: { in: slugs } } }],
});

export function buildWhere(p: ListingParams, opts: WhereOptions = {}) {
  const where: Record<string, unknown> = { status: 'ACTIVE' };

  if (opts.categoryIds?.length) {
    // Within a pinned subtree the `cat` facet narrows to specific subcategories.
    if (p.cats.length && opts.omit !== 'cats') where.category = categoryFilter(p.cats);
    else where.categoryId = { in: opts.categoryIds };
  } else if (p.cats.length && opts.omit !== 'cats') {
    where.category = categoryFilter(p.cats);
  }

  if (p.brands.length && opts.omit !== 'brands') where.brand = { in: p.brands };

  if (p.min != null || p.max != null) {
    where.minListPrice = {
      ...(p.min != null ? { gte: p.min } : {}),
      ...(p.max != null ? { lte: p.max } : {}),
    };
  }

  if (p.rating != null) where.rating = { gte: p.rating };

  if (opts.semanticIds) {
    // The vector already answered "which products mean this?" — don't also
    // demand a literal substring match, which would undo it.
    where.id = { in: opts.semanticIds };
  } else if (p.q) {
    where.OR = [
      { title: { contains: p.q, mode: 'insensitive' } },
      { description: { contains: p.q, mode: 'insensitive' } },
      { brand: { contains: p.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export function buildOrderBy(sort: ListingSort) {
  switch (sort) {
    case 'price_asc':
      return { minListPrice: 'asc' as const };
    case 'price_desc':
      return { minListPrice: 'desc' as const };
    case 'rating':
      return [{ rating: 'desc' as const }, { reviewCount: 'desc' as const }];
    case 'newest':
      return { createdAt: 'desc' as const };
    default:
      // Fallback ordering for relevance when no semantic ranking is available
      // (no query, AI down, or nothing embedded) — popularity is the best proxy.
      return [{ reviewCount: 'desc' as const }, { rating: 'desc' as const }];
  }
}

export const PRODUCT_CARD_SELECT = {
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

/**
 * How many nearest neighbours the vector index returns as the candidate pool.
 *
 * This is the recall/precision dial. Too small and a narrow facet ("jog" +
 * under ₹1,000) can filter the pool down to nothing; too large and distant,
 * irrelevant matches leak in. 300 over a 50k catalogue is a reasonable middle.
 */
const SEMANTIC_POOL = 300;

/** Shape returned by PRODUCT_CARD_SELECT. `minListPrice` arrives as a Decimal. */
export interface ProductCardRow {
  id: string;
  title: string;
  slug: string;
  brand: string | null;
  rating: number;
  reviewCount: number;
  minListPrice: unknown;
  images: Array<{ url: string; alt: string | null }>;
  seller: { storeName: string };
}

export interface SearchResult {
  items: ProductCardRow[];
  total: number;
  /** True when ordering came from the vector index rather than SQL. */
  semantic: boolean;
}

/**
 * Resolve a natural-language query to a pool of candidate product ids.
 *
 * Returns null when semantic resolution isn't possible (no query, AI down,
 * nothing embedded) — callers then fall back to keyword matching.
 */
export async function resolveSemantic(q: string): Promise<string[] | null> {
  if (!q.trim()) return null;
  const vector = await embedQuery(q);
  if (!vector) return null;
  const hits = await semanticSearch(vector, { limit: SEMANTIC_POOL });
  return hits.length ? hits.map((h) => h.id) : null;
}

/**
 * Run a listing query.
 *
 * Order of operations matters and is the fix for a real bug: the vector index
 * resolves WHICH products the sentence means, and SQL then applies the facets
 * and the sort within that pool. Doing it the other way round — keyword filter
 * first, rank second — returns nothing for exactly the queries semantic search
 * exists to serve ("something for my evening jog" is in no product title).
 *
 * `semanticIds` must be resolved once by the caller and shared with getFacets,
 * so the facet counts describe the same candidate pool as the results.
 */
export async function runListing(
  p: ListingParams,
  opts: WhereOptions & { take?: number } = {},
): Promise<SearchResult> {
  const take = opts.take ?? 48;
  const where = buildWhere(p, opts);
  const semantic = Boolean(opts.semanticIds);

  const total = await prisma.product.count({ where: where as never });
  if (total === 0) return { items: [], total: 0, semantic };

  const items = await prisma.product.findMany({
    where: where as never,
    // In relevance mode the vector's ordering is the ranking, so let SQL return
    // the pool and re-sort below; any explicit sort is honoured in SQL as usual.
    ...(semantic && p.sort === 'relevance' ? {} : { orderBy: buildOrderBy(p.sort) }),
    take: semantic && p.sort === 'relevance' ? SEMANTIC_POOL : take,
    select: PRODUCT_CARD_SELECT,
  });

  if (semantic && p.sort === 'relevance') {
    // findMany does not preserve `IN` order — restore the vector's ranking.
    const rank = new Map(opts.semanticIds!.map((id, i) => [id, i]));
    items.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    return { items: items.slice(0, take), total, semantic: true };
  }

  return { items, total, semantic };
}

/**
 * Counts for each facet are computed with that facet's own clause removed, so
 * ticking "Footwear" doesn't collapse every other category to zero.
 *
 * On a department page the category facet lists that department's
 * subcategories; elsewhere it lists departments, rolled up from their children
 * — a flat list of 117 subcategories would be unusable as a filter.
 */
export async function getFacets(p: ListingParams, opts: WhereOptions = {}): Promise<Facets> {
  const [catGroups, brandGroups, categories] = await Promise.all([
    prisma.product.groupBy({
      by: ['categoryId'],
      where: buildWhere(p, { ...opts, omit: 'cats' }) as never,
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ['brand'],
      where: buildWhere(p, { ...opts, omit: 'brands' }) as never,
      _count: { _all: true },
      orderBy: { _count: { brand: 'desc' } },
      take: 15,
    }),
    prisma.category.findMany({ select: { id: true, name: true, slug: true, parentId: true } }),
  ]);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const pinned = new Set(opts.categoryIds ?? []);

  // Roll each match up to the level the rail should offer.
  const tally = new Map<string, { label: string; count: number }>();
  for (const g of catGroups) {
    const cat = g.categoryId ? byId.get(g.categoryId) : undefined;
    if (!cat) continue;
    // Inside a pinned subtree, offer the subcategory itself; otherwise its department.
    const target = pinned.size > 0 ? cat : cat.parentId ? byId.get(cat.parentId) : cat;
    if (!target) continue;
    const prev = tally.get(target.slug);
    tally.set(target.slug, {
      label: target.name,
      count: (prev?.count ?? 0) + g._count._all,
    });
  }

  return {
    categories: [...tally.entries()]
      .map(([value, { label, count }]) => ({ value, label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    brands: brandGroups.flatMap((g) =>
      g.brand ? [{ value: g.brand, label: g.brand, count: g._count._all }] : [],
    ),
  };
}
