'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface ProductCardData {
  id: string;
  title: string;
  slug: string;
  brand: string | null;
  rating: number;
  reviewCount: number;
  minListPrice: number | string | null;
  images: { url: string; alt?: string | null }[];
  seller: { storeName: string };
}

export function ProductCard({ p }: { p: ProductCardData }) {
  const img = p.images[0]?.url;
  const price = p.minListPrice ? Number(p.minListPrice) : 0;

  return (
    <Link
      href={`/p/${p.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-fg/25"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {img ? (
          <Image
            src={img}
            alt={p.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        <Badge variant="ai" className="absolute left-2 top-2">
          Negotiable
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {p.brand && (
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{p.brand}</div>
        )}

        <h3 className="line-clamp-2 text-[13px] leading-snug text-fg">{p.title}</h3>

        {p.reviewCount > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Star className="h-3 w-3 fill-fg stroke-none" />
            <span className="tabular font-medium text-fg">{p.rating.toFixed(1)}</span>
            <span className="tabular">({p.reviewCount.toLocaleString('en-IN')})</span>
          </div>
        )}

        {/* Price anchors the bottom edge so it aligns across a ragged grid row. */}
        <div className="mt-auto pt-2">
          <div className="tabular text-[15px] font-semibold tracking-tight">{formatINR(price)}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{p.seller.storeName}</div>
        </div>
      </div>
    </Link>
  );
}
