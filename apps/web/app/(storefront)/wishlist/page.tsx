'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Heart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';

export default function WishlistPage() {
  const utils = trpc.useUtils();
  const list = trpc.catalog.myWishlist.useQuery();
  const toggle = trpc.catalog.toggleWishlist.useMutation({
    onSuccess: () => utils.catalog.myWishlist.invalidate(),
  });

  if (list.isLoading) return <div className="container-page py-12">Loading…</div>;

  return (
    <div className="container-page py-8">
      <h1 className="font-display text-3xl">Wishlist</h1>
      {list.data?.length === 0 ? (
        <div className="mt-12 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          Tap the <Heart className="inline h-3.5 w-3.5" /> icon on any product to save it.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {list.data?.map((w) => (
            <Card key={w.productId} className="overflow-hidden">
              <Link href={`/p/${w.product.slug}`} className="relative block aspect-square bg-muted">
                {w.product.images[0]?.url && (
                  <Image src={w.product.images[0].url} alt={w.product.title} fill sizes="(max-width:768px) 50vw, 25vw" className="object-cover" />
                )}
              </Link>
              <div className="p-3">
                <Link href={`/p/${w.product.slug}`} className="line-clamp-2 text-sm font-medium hover:underline">
                  {w.product.title}
                </Link>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-sm font-semibold">{formatINR(Number(w.product.minListPrice ?? 0))}</div>
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ productId: w.productId })}>
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
