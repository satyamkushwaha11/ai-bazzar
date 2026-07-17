import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { prisma } from '@/server/db';
import { ProductForm } from '../ProductForm';
import { PageHeader } from '@/components/dashboard/Sidebar';

/**
 * Server component so the seller's store defaults are available on first paint.
 * The rules preview compares against them ("blank = inherit your default"), and
 * a preview that pops in after hydration would show the wrong baseline first.
 */
export default async function NewProductPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const seller = await prisma.seller.findUnique({
    where: { userId: session.user.id },
    select: { negotiationEnabled: true, negotiationAggressiveness: true, negotiationMaxTurns: true },
  });

  return (
    <div>
      <PageHeader
        title="New product"
        description="Add a product, set your prices, and decide how hard the AI should haggle."
      />
      <ProductForm
        sellerDefaults={{
          negotiationEnabled: seller?.negotiationEnabled ?? true,
          negotiationAggressiveness: seller?.negotiationAggressiveness ?? 0.5,
          negotiationMaxTurns: seller?.negotiationMaxTurns ?? 4,
        }}
      />
    </div>
  );
}
