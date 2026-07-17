'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SORT_OPTIONS, type ListingSort } from '@/lib/listing';

export function ListingToolbar({
  total,
  shown,
  sort,
  heading,
}: {
  total: number;
  shown: number;
  sort: ListingSort;
  heading: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onSort = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('sort', value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
      <div className="min-w-0 text-[13px]">
        {heading}
        <span className="tabular ml-1 text-muted-foreground">
          {shown < total ? `${shown} of ${total.toLocaleString('en-IN')}` : total.toLocaleString('en-IN')}{' '}
          {total === 1 ? 'result' : 'results'}
        </span>
      </div>
      <label className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
        Sort by
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          className="h-8 rounded-md border border-input bg-bg px-2 text-[13px] text-fg transition-colors focus-visible:border-fg focus-visible:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
