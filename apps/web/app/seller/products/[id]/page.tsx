import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { prisma } from '@/server/db';
import { ProductForm } from '../ProductForm';
import { PageHeader } from '@/components/dashboard/Sidebar';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');
  const seller = await prisma.seller.findUnique({ where: { userId: session.user.id } });
  const p = await prisma.product.findUnique({
    where: { id },
    include: { images: true, variants: true },
  });
  if (!p || (seller && p.sellerId !== seller.id && session.user.role !== 'ADMIN')) redirect('/seller/products');

  return (
    <div>
      <PageHeader title="Edit product" description={p.title} />
      <ProductForm
        sellerDefaults={{
          negotiationEnabled: seller?.negotiationEnabled ?? true,
          negotiationAggressiveness: seller?.negotiationAggressiveness ?? 0.5,
          negotiationMaxTurns: seller?.negotiationMaxTurns ?? 4,
        }}
        initial={{
          id: p.id,
          title: p.title,
          description: p.description,
          brand: p.brand,
          categoryId: p.categoryId,
          status: p.status,
          images: p.images.map((i) => i.url),
          variants: p.variants.map((v) => ({
            sku: v.sku,
            attrsRaw: Object.entries((v.attrs as Record<string, string>) ?? {}).map(([k, val]) => `${k}:${val}`).join(', '),
            stock: v.stock,
            listPrice: Number(v.listPrice),
            minPrice: Number(v.minPrice),
            costPrice: v.costPrice == null ? null : Number(v.costPrice),
          })),
          // Load the saved rules, or the form would post nulls back on save and
          // silently wipe them.
          negotiationEnabled: p.negotiationEnabled,
          minMarginPct: p.minMarginPct,
          maxDiscountPct: p.maxDiscountPct,
          negotiationAggressiveness: p.negotiationAggressiveness,
          negotiationMaxTurns: p.negotiationMaxTurns,
          volumeMinQty: p.volumeMinQty,
          freebie: p.freebie,
        }}
      />
    </div>
  );
}
