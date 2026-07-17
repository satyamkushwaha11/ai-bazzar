import { Suspense } from 'react';
import { ProductCard } from '@/components/storefront/ProductCard';
import { FacetRail } from '@/components/storefront/FacetRail';
import { ListingToolbar } from '@/components/storefront/ListingToolbar';
import { parseSearch } from '@/server/ai/search';
import { fromSearchParams, type RawSearchParams } from '@/lib/listing';
import { getFacets, resolveSemantic, runListing } from '@/server/services/listing';

export const dynamic = 'force-dynamic';

const TAKE = 48;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';

  if (!q.trim()) {
    return (
      <div className="container-page py-20 text-center text-sm text-muted-foreground">
        Search for anything above — try &ldquo;running shoes under 2k&rdquo; or &ldquo;noise cancelling
        earbuds&rdquo;.
      </div>
    );
  }

  return (
    <Suspense key={JSON.stringify(sp)} fallback={<ListingSkeleton />}>
      <Results sp={sp} q={q} />
    </Suspense>
  );
}

async function Results({ sp, q }: { sp: RawSearchParams; q: string }) {
  /*
   * Two readings of the query, resolved in parallel:
   *  - the vector says WHICH products the sentence means;
   *  - the parser extracts structured intent a vector can't express (a price
   *    cap, a sort preference).
   */
  const [ai, resolved] = await Promise.all([parseSearch(q), resolveSemantic(q)]);
  const semanticIds = resolved ?? undefined;

  const params = fromSearchParams(sp, {
    // Residual keyword only — verbatim, including ''. Used solely as the
    // fallback keyword filter when there is no vector to resolve the query.
    q: ai.query,
    /*
     * Deliberately NOT seeded from the AI when the vector answered.
     *
     * The model's department guess fights the embedding and loses: it labelled
     * "something for my evening jog" as `sports-fitness`, while the jogging
     * shoes the vector found live in `footwear` — intersecting the two gave
     * zero results for a query that has 41 good answers. The vector already
     * encodes the meaning, so the guess is redundant here and harmful.
     * A facet the USER ticked still arrives via `sp.cat` and still filters.
     */
    cats: semanticIds ? [] : ai.categorySlugs,
    brands: ai.brands,
    min: ai.minPrice,
    max: ai.maxPrice,
    sort: ai.sort,
  });

  // One pool, shared by the grid and the facet counts, so the sidebar always
  // describes the same set of products the buyer is looking at.
  const opts = { semanticIds };

  const [listing, facets] = await Promise.all([
    runListing(params, { ...opts, take: TAKE }),
    getFacets(params, opts),
  ]);
  const { items, total } = listing;

  return (
    <div className="container-page py-5">
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <FacetRail facets={facets} params={params} />

        <div className="min-w-0 flex-1">
          <ListingToolbar
            total={total}
            shown={items.length}
            sort={params.sort}
            heading={
              <span>
                Results for <span className="font-semibold">&ldquo;{q}&rdquo;</span>
              </span>
            }
          />

          {items.length === 0 ? (
            <div className="mt-10 rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No matches. Try removing a filter or broadening your search.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((p) => (
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

function ListingSkeleton() {
  return (
    <div className="container-page py-5">
      <div className="flex gap-8">
        <div className="hidden w-56 shrink-0 space-y-3 lg:block">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded bg-muted" />
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
