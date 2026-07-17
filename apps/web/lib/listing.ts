/**
 * Listing types, constants and URL parsing — shared by server pages and client
 * facet components.
 *
 * This module must stay free of server-only imports (Prisma in particular):
 * FacetRail and ListingToolbar are client components and import from here. The
 * Prisma-backed query builders live in `@/server/services/listing`.
 */

export type ListingSort = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest';

export interface ListingParams {
  /**
   * The keyword actually matched against the catalogue — NOT the raw sentence
   * the user typed. On /search the AI strips filter words out of the query
   * ("cheap running shoes under 2k" -> "running") and the leftover is what can
   * meaningfully match a title. Matching the raw sentence finds nothing.
   */
  q: string;
  cats: string[];
  brands: string[];
  min: number | null;
  max: number | null;
  /** Minimum average rating, e.g. 4 for "4 stars & up". */
  rating: number | null;
  sort: ListingSort;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface Facets {
  categories: FacetOption[];
  brands: FacetOption[];
}

export const PRICE_BUCKETS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: 'Under ₹1,000', min: null, max: 1000 },
  { label: '₹1,000 – ₹5,000', min: 1000, max: 5000 },
  { label: '₹5,000 – ₹10,000', min: 5000, max: 10000 },
  { label: '₹10,000 – ₹20,000', min: 10000, max: 20000 },
  { label: 'Over ₹20,000', min: 20000, max: null },
];

export const SORT_OPTIONS: Array<{ value: ListingSort; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Avg. customer review' },
  { value: 'newest', label: 'Newest arrivals' },
];

const SORTS = new Set<ListingSort>(['relevance', 'price_asc', 'price_desc', 'rating', 'newest']);

export type RawSearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const csv = (v: string | undefined): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

const num = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Read listing state out of the URL, falling back to an AI-parsed seed.
 *
 * A facet param that is *present* overrides the seed even when empty — that is
 * how unticking the AI's guessed category sticks instead of being reapplied.
 *
 * `q` is the exception and must not follow that rule: `sp.q` holds the raw
 * sentence, which exists purely to display and to feed the parser, while
 * `seed.q` holds the parser's residual keyword. The residual always wins —
 * letting the raw sentence through means matching `title contains "cheap
 * running shoes under 2k"`, which returns nothing.
 */
export function fromSearchParams(sp: RawSearchParams, seed?: Partial<ListingParams>): ListingParams {
  const sortRaw = one(sp.sort) as ListingSort | undefined;
  return {
    q: seed?.q ?? one(sp.q) ?? '',
    cats: sp.cat !== undefined ? csv(one(sp.cat)) : (seed?.cats ?? []),
    brands: sp.brand !== undefined ? csv(one(sp.brand)) : (seed?.brands ?? []),
    min: sp.min !== undefined ? num(one(sp.min)) : (seed?.min ?? null),
    max: sp.max !== undefined ? num(one(sp.max)) : (seed?.max ?? null),
    rating: num(one(sp.rating)),
    sort: sortRaw && SORTS.has(sortRaw) ? sortRaw : (seed?.sort ?? 'relevance'),
  };
}
