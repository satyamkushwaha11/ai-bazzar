import { prisma } from '@/server/db';
import { similarProducts } from '@/server/services/embeddings';
import { PRODUCT_CARD_SELECT } from '@/server/services/listing';
import { ProductCard } from './ProductCard';

/**
 * "Similar products" — nearest neighbours of this product's own embedding.
 *
 * Semantic rather than same-category: a buyer looking at jogging shoes is better
 * served by other running shoes than by whatever else happens to sit in
 * Footwear. Renders nothing when the product is unembedded or has no close
 * neighbour — an empty section beats an irrelevant one.
 */
export async function SimilarProducts({ productId }: { productId: string }) {
  const ids = await similarProducts(productId, { limit: 3 });
  if (ids.length === 0) return null;

  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: PRODUCT_CARD_SELECT,
  });
  if (rows.length === 0) return null;

  // findMany does not preserve `IN` order — keep the nearest first.
  const rank = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

  return (
    <section className="container-page border-t border-border py-6">
      <h2 className="font-display text-lg">Similar products</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Matched by what they are, not just which category they sit in.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rows.map((p) => (
          <ProductCard
            key={p.id}
            p={{ ...p, minListPrice: p.minListPrice ? Number(p.minListPrice) : null }}
          />
        ))}
      </div>
    </section>
  );
}
