'use client';
import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, MessageSquare, Heart, Star, ShieldCheck, Truck, Tag, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatINR, cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';
import { NegotiationChat } from '@/components/ai/NegotiationChat';

interface Variant {
  id: string;
  sku: string;
  attrs: Record<string, string> | unknown;
  stock: number;
  listPrice: number;
  imageUrl: string | null;
}

interface ProductInput {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string | null;
  rating: number;
  reviewCount: number;
  category: { name: string; slug: string } | null;
  images: { url: string; alt: string }[];
  variants: Variant[];
  seller: { storeName: string; slug: string; negotiationEnabled: boolean };
  reviews: {
    id: string;
    rating: number;
    title: string | null;
    body: string | null;
    createdAt: string;
    user: { name: string | null; image: string | null };
  }[];
}

const attrsOf = (v: Variant) => (v.attrs as Record<string, string>) ?? {};

export function ProductView({ product }: { product: ProductInput }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [variant, setVariant] = React.useState<Variant>(product.variants[0]!);
  const [imgIdx, setImgIdx] = React.useState(0);
  const [chatOpen, setChatOpen] = React.useState(false);
  /** A negotiated price is bound to one variant, never to the product. */
  const [locked, setLocked] = React.useState<{ offerId: string; price: number } | null>(null);
  const utils = trpc.useUtils();

  // Switching variant invalidates any lock — the offer was for the old SKU, and
  // carrying it over would show a price this variant was never negotiated to.
  const selectVariant = (v: Variant) => {
    setVariant(v);
    setLocked(null);
  };

  const addToCart = trpc.cart.add.useMutation({
    onSuccess: () => {
      utils.cart.get.invalidate();
      toast.success('Added to cart');
    },
    onError: (e) => toast.error(e.message),
  });

  const wishlist = trpc.catalog.toggleWishlist.useMutation({
    onSuccess: (r) => toast.success(r.wishlisted ? 'Added to wishlist' : 'Removed from wishlist'),
    onError: (e) => toast.error(e.message),
  });

  const requireAuth = (then: () => void) => {
    if (!session) {
      router.push(`/login?next=/p/${product.slug}`);
      return;
    }
    then();
  };

  const specs = Object.entries(attrsOf(variant));
  const inStock = variant.stock > 0;

  return (
    <div className="container-page py-5">
      <nav aria-label="Breadcrumb" className="pb-4 text-[12px] text-muted-foreground">
        <Link href="/" className="hover:text-fg">
          Home
        </Link>
        {product.category && (
          <>
            <span className="mx-1.5">/</span>
            <Link href={`/c/${product.category.slug}`} className="hover:text-fg">
              {product.category.name}
            </Link>
          </>
        )}
        <span className="mx-1.5">/</span>
        <span className="text-fg">{product.title}</span>
      </nav>

      {/* Gallery · details · buy box — the three-column marketplace layout. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)_290px] lg:gap-8">
        <Gallery product={product} imgIdx={imgIdx} setImgIdx={setImgIdx} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
            {product.brand && (
              <span className="font-medium uppercase tracking-wide text-muted-foreground">
                {product.brand}
              </span>
            )}
            <span className="text-muted-foreground">·</span>
            <Link href={`/store/${product.seller.slug}`} className="text-muted-foreground hover:text-fg">
              Sold by <span className="font-medium text-fg">{product.seller.storeName}</span>
            </Link>
          </div>

          <h1 className="mt-1.5 font-display text-2xl leading-tight">{product.title}</h1>

          {product.reviewCount > 0 && (
            <a href="#reviews" className="mt-2 flex w-max items-center gap-1.5 text-[13px]">
              <Stars value={product.rating} />
              <span className="tabular font-medium">{product.rating.toFixed(1)}</span>
              <span className="text-muted-foreground hover:text-fg">
                ({product.reviewCount.toLocaleString('en-IN')} reviews)
              </span>
            </a>
          )}

          {product.variants.length > 1 && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Variant
              </div>
              <div className="flex flex-wrap gap-1.5">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => selectVariant(v)}
                    disabled={v.stock === 0}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-[13px] transition-colors',
                      v.id === variant.id
                        ? 'border-fg bg-fg text-bg'
                        : 'border-border hover:border-fg/40',
                      v.stock === 0 && 'cursor-not-allowed text-muted-foreground line-through opacity-50',
                    )}
                  >
                    {Object.values(attrsOf(v)).join(' · ') || v.sku}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <h2 className="pb-1.5 text-[13px] font-semibold">About this product</h2>
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          </div>

          {specs.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <h2 className="pb-2 text-[13px] font-semibold">Specifications</h2>
              <table className="w-full text-[13px]">
                <tbody>
                  {specs.map(([k, v]) => (
                    <tr key={k} className="border-b border-border last:border-0">
                      <th
                        scope="row"
                        className="w-40 py-1.5 pr-4 text-left font-normal capitalize text-muted-foreground"
                      >
                        {k}
                      </th>
                      <td className="py-1.5">{v}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-border last:border-0">
                    <th scope="row" className="w-40 py-1.5 pr-4 text-left font-normal text-muted-foreground">
                      SKU
                    </th>
                    <td className="break-all py-1.5 font-mono text-[12px]">{variant.sku}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Buy box — follows the reader down the page, as on every marketplace. */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-lg border border-border p-4">
            {locked ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="tabular text-2xl font-semibold tracking-tight text-success">
                    {formatINR(locked.price)}
                  </span>
                  <span className="tabular text-[13px] text-muted-foreground line-through">
                    {formatINR(variant.listPrice)}
                  </span>
                </div>
                <div className="mt-0.5 text-[12px] text-success">
                  Your negotiated price — you saved {formatINR(variant.listPrice - locked.price)}
                </div>
              </>
            ) : (
              <>
                <div className="tabular text-2xl font-semibold tracking-tight">
                  {formatINR(variant.listPrice)}
                </div>
                <div className="mt-0.5 text-[12px] text-muted-foreground">Inclusive of all taxes</div>
              </>
            )}

            <div className="mt-3 text-[13px]">
              {inStock ? (
                <span className="font-medium text-success">In stock</span>
              ) : (
                <span className="font-medium text-destructive">Out of stock</span>
              )}
              {inStock && variant.stock <= 5 && (
                <span className="text-muted-foreground"> — only {variant.stock} left</span>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={() =>
                  requireAuth(() =>
                    addToCart.mutate({
                      variantId: variant.id,
                      qty: 1,
                      // Carry the lock through so the cart charges what was agreed.
                      ...(locked ? { lockedOfferId: locked.offerId } : {}),
                    }),
                  )
                }
                disabled={addToCart.isPending || !inStock}
              >
                <ShoppingBag className="h-4 w-4" />
                {!inStock
                  ? 'Out of stock'
                  : locked
                    ? `Add to cart at ${formatINR(locked.price)}`
                    : 'Add to cart'}
              </Button>

              {product.seller.negotiationEnabled && inStock && !locked && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => requireAuth(() => setChatOpen(true))}
                >
                  <MessageSquare className="h-4 w-4" /> Negotiate price
                </Button>
              )}

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => requireAuth(() => wishlist.mutate({ productId: product.id }))}
              >
                <Heart className="h-4 w-4" /> Save for later
              </Button>
            </div>

            {product.seller.negotiationEnabled && !locked && (
              <p className="mt-3 border-t border-border pt-3 text-[12px] text-muted-foreground">
                <span className="font-medium text-fg">This price is negotiable.</span> Haggle with the
                AI shopkeeper before you buy — agree a price and it locks for 10 minutes.
              </p>
            )}
          </div>

          <ul className="mt-3 space-y-1.5 text-[12px] text-muted-foreground">
            <Perk icon={<Truck className="h-3.5 w-3.5" />}>Free delivery on orders over ₹999</Perk>
            <Perk icon={<ShieldCheck className="h-3.5 w-3.5" />}>AI Bazaar-verified seller</Perk>
            <Perk icon={<Tag className="h-3.5 w-3.5" />}>
              Locked-price guarantee — what you negotiate is what you pay
            </Perk>
          </ul>
        </div>
      </div>

      {product.reviews.length > 0 && (
        <section id="reviews" className="mt-10 border-t border-border pt-6">
          <h2 className="font-display text-lg">Customer reviews</h2>
          <div className="mt-3 grid gap-x-8 gap-y-5 md:grid-cols-2">
            {product.reviews.map((r) => (
              <article key={r.id} className="border-b border-border pb-4 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[10px] font-medium">
                    {r.user.name?.[0] ?? 'U'}
                  </div>
                  <span className="text-[13px] font-medium">{r.user.name ?? 'Anonymous'}</span>
                  <span className="flex items-center gap-1 text-[11px] text-success">
                    <Check className="h-3 w-3" /> Verified
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Stars value={r.rating} />
                  {r.title && <span className="text-[13px] font-medium">{r.title}</span>}
                </div>
                {r.body && (
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{r.body}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <NegotiationChat
        open={chatOpen}
        onOpenChange={setChatOpen}
        variantId={variant.id}
        productTitle={product.title}
        storeName={product.seller.storeName}
        listPrice={variant.listPrice}
        onLocked={(offerId, price) => setLocked({ offerId, price })}
      />
    </div>
  );
}

function Gallery({
  product,
  imgIdx,
  setImgIdx,
}: {
  product: ProductInput;
  imgIdx: number;
  setImgIdx: (i: number) => void;
}) {
  const src = product.images[imgIdx]?.url ?? product.images[0]?.url;
  return (
    <div className="flex gap-3">
      {product.images.length > 1 && (
        <div className="hidden w-14 shrink-0 flex-col gap-2 sm:flex">
          {product.images.map((img, i) => (
            <button
              key={i}
              onMouseEnter={() => setImgIdx(i)}
              onFocus={() => setImgIdx(i)}
              onClick={() => setImgIdx(i)}
              aria-label={`View image ${i + 1}`}
              className={cn(
                'relative aspect-square overflow-hidden rounded-md border transition-colors',
                i === imgIdx ? 'border-fg' : 'border-border hover:border-fg/40',
              )}
            >
              <Image src={img.url} alt="" fill sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="relative aspect-square min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted">
        {src ? (
          <Image
            src={src}
            alt={product.title}
            fill
            priority
            sizes="(max-width:1024px) 100vw, 420px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex" aria-label={`${value.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn('h-3.5 w-3.5', i < Math.round(value) ? 'fill-fg stroke-none' : 'fill-border stroke-none')}
        />
      ))}
    </span>
  );
}

function Perk({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  );
}
