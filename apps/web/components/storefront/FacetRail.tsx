'use client';
import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRICE_BUCKETS, type Facets, type ListingParams } from '@/lib/listing';

interface Props {
  facets: Facets;
  params: ListingParams;
  /** Category pages pin the category, so the category facet is hidden there. */
  hideCategories?: boolean;
}

export function FacetRail({ facets, params, hideCategories }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  /*
   * The inputs are controlled by server-rendered props, so without this a tick
   * would not register until the RSC round-trip lands and the rail would feel
   * dead. `useOptimistic` paints the new state immediately and is reconciled
   * (or reverted) when the real params arrive.
   */
  const [shown, setShown] = React.useOptimistic(params);

  /**
   * Every facet edit is a URL write — one code path, always shareable.
   *
   * `''` and `null` differ, and the difference matters. On /search an absent
   * param means "fall back to whatever the AI parsed out of the query", so
   * clearing a facet by deleting its param would let the AI's guess reapply
   * instantly. `''` is the explicit "user cleared this" marker; `null` means
   * "hand this facet back to the AI".
   */
  const commit = React.useCallback(
    (next: ListingParams, patch: Record<string, string | null>) => {
      const qp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) qp.delete(k);
        else qp.set(k, v);
      }
      const qs = qp.toString();
      startTransition(() => {
        setShown(next);
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams, setShown],
  );

  const toggleList = (key: 'cat' | 'brand', field: 'cats' | 'brands', value: string) => {
    const current = shown[field];
    const list = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    commit({ ...shown, [field]: list }, { [key]: list.join(',') });
  };

  const setPrice = (min: number | null, max: number | null) =>
    commit(
      { ...shown, min, max },
      { min: min?.toString() ?? '', max: max?.toString() ?? '' },
    );

  const activePrice = PRICE_BUCKETS.findIndex((b) => b.min === shown.min && b.max === shown.max);

  const hasFilters =
    shown.cats.length > 0 ||
    shown.brands.length > 0 ||
    shown.min != null ||
    shown.max != null ||
    shown.rating != null;

  return (
    <aside
      className={cn(
        'w-full shrink-0 transition-opacity lg:w-56',
        isPending && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-[13px] font-semibold">Filters</h2>
        {hasFilters && (
          <button
            onClick={() =>
              /* Back to the query's baseline interpretation — hence null, not ''. */
              commit(
                { ...shown, cats: [], brands: [], min: null, max: null, rating: null },
                { cat: null, brand: null, min: null, max: null, rating: null },
              )
            }
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-fg"
          >
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      {!hideCategories && facets.categories.length > 0 && (
        <FacetGroup title="Category">
          {facets.categories.map((c) => (
            <CheckRow
              key={c.value}
              label={c.label}
              count={c.count}
              checked={shown.cats.includes(c.value)}
              onChange={() => toggleList('cat', 'cats', c.value)}
            />
          ))}
        </FacetGroup>
      )}

      <FacetGroup title="Price">
        {PRICE_BUCKETS.map((b, i) => (
          <RadioRow
            key={b.label}
            label={b.label}
            checked={activePrice === i}
            onChange={() => (activePrice === i ? setPrice(null, null) : setPrice(b.min, b.max))}
          />
        ))}
        <PriceRange
          min={shown.min}
          max={shown.max}
          onApply={(min, max) => setPrice(min, max)}
        />
      </FacetGroup>

      <FacetGroup title="Customer rating">
        {[4, 3, 2].map((r) => (
          <RadioRow
            key={r}
            checked={shown.rating === r}
            onChange={() => {
              const next = shown.rating === r ? null : r;
              commit({ ...shown, rating: next }, { rating: next?.toString() ?? '' });
            }}
            label={
              <span className="flex items-center gap-1">
                <span className="flex" aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={cn('h-3 w-3', i < r ? 'fill-fg stroke-none' : 'fill-border stroke-none')}
                    />
                  ))}
                </span>
                <span className="text-muted-foreground">&amp; up</span>
              </span>
            }
          />
        ))}
      </FacetGroup>

      {facets.brands.length > 0 && (
        <FacetGroup title="Brand">
          {facets.brands.map((b) => (
            <CheckRow
              key={b.value}
              label={b.label}
              count={b.count}
              checked={shown.brands.includes(b.value)}
              onChange={() => toggleList('brand', 'brands', b.value)}
            />
          ))}
        </FacetGroup>
      )}
    </aside>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-3">
      <h3 className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[13px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-fg"
      />
      <span className={cn('flex-1 truncate', checked ? 'font-medium text-fg' : 'text-muted-foreground')}>
        {label}
      </span>
      <span className="tabular shrink-0 text-[11px] text-muted-foreground">{count}</span>
    </label>
  );
}

function RadioRow({
  label,
  checked,
  onChange,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[13px]">
      {/* type=checkbox, not radio: clicking the active row clears it. */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 rounded-full accent-fg"
      />
      <span className={cn('flex-1', checked ? 'font-medium text-fg' : 'text-muted-foreground')}>
        {label}
      </span>
    </label>
  );
}

function PriceRange({
  min,
  max,
  onApply,
}: {
  min: number | null;
  max: number | null;
  onApply: (min: number | null, max: number | null) => void;
}) {
  const [lo, setLo] = React.useState(min?.toString() ?? '');
  const [hi, setHi] = React.useState(max?.toString() ?? '');

  React.useEffect(() => setLo(min?.toString() ?? ''), [min]);
  React.useEffect(() => setHi(max?.toString() ?? ''), [max]);

  return (
    <form
      className="flex items-center gap-1 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(lo ? Number(lo) : null, hi ? Number(hi) : null);
      }}
    >
      <input
        value={lo}
        onChange={(e) => setLo(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="Min"
        aria-label="Minimum price"
        className="tabular h-7 w-full min-w-0 rounded border border-input bg-bg px-1.5 text-[12px] focus-visible:border-fg focus-visible:outline-none"
      />
      <span className="text-muted-foreground">–</span>
      <input
        value={hi}
        onChange={(e) => setHi(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="Max"
        aria-label="Maximum price"
        className="tabular h-7 w-full min-w-0 rounded border border-input bg-bg px-1.5 text-[12px] focus-visible:border-fg focus-visible:outline-none"
      />
      <button
        type="submit"
        className="h-7 shrink-0 rounded border border-border px-2 text-[12px] transition-colors hover:bg-muted"
      >
        Go
      </button>
    </form>
  );
}
