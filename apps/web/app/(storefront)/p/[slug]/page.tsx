import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/server/db';
import { SimilarProducts } from '@/components/storefront/SimilarProducts';
import { ProductView } from './ProductView';

export const revalidate = 60;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      seller: true,
      images: { orderBy: { position: 'asc' } },
      variants: {
        orderBy: { listPrice: 'asc' },
        select: {
          id: true,
          sku: true,
          attrs: true,
          stock: true,
          listPrice: true,
          imageUrl: true,
        },
      },
      reviews: {
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, image: true } } },
      },
      category: true,
    },
  });

  if (!product) notFound();

  return (
    <>
      <ProductView
        product={{
          id: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        brand: product.brand,
        rating: product.rating,
        reviewCount: product.reviewCount,
        category: product.category ? { name: product.category.name, slug: product.category.slug } : null,
        images: product.images.map((i) => ({ url: i.url, alt: i.alt ?? product.title })),
        variants: product.variants.map((v) => ({ ...v, listPrice: Number(v.listPrice) })),
        seller: {
          storeName: product.seller.storeName,
          slug: product.seller.slug,
          negotiationEnabled: product.seller.negotiationEnabled,
        },
          reviews: product.reviews.map((r) => ({
            id: r.id,
            rating: r.rating,
            title: r.title,
            body: r.body,
            createdAt: r.createdAt.toISOString(),
            user: { name: r.user.name, image: r.user.image },
          })),
        }}
      />

      {/* Streamed in: a vector lookup must not hold up the buy box. */}
      <Suspense fallback={null}>
        <SimilarProducts productId={product.id} />
      </Suspense>
    </>
  );
}
