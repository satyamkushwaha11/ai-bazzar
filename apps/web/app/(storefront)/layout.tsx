import { unstable_cache } from 'next/cache';
import { Header, type Department } from '@/components/storefront/Header';
import { Footer } from '@/components/storefront/Footer';
import { ShopAssistant } from '@/components/ai/ShopAssistant';
import { prisma } from '@/server/db';

/**
 * No `export const revalidate` here: the Footer reads the session to decide
 * whether to pitch "Become a seller", so this layout must render per-request.
 *
 * The taxonomy is cached on its own instead. Dropping the page-level revalidate
 * without this would put a Neon round-trip (~110ms from here) on every single
 * page load, to fetch 18 rows that change about never.
 *
 * It is server-rendered rather than fetched client-side because a nav that pops
 * in after hydration looks broken.
 */
const getDepartments = unstable_cache(
  async (): Promise<Department[]> =>
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { position: 'asc' },
      select: {
        name: true,
        slug: true,
        children: { orderBy: { position: 'asc' }, select: { name: true, slug: true } },
      },
    }),
  ['storefront-departments'],
  { revalidate: 300, tags: ['departments'] },
);

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const departments = await getDepartments();

  return (
    <div className="flex min-h-screen flex-col">
      <Header departments={departments} />
      <main className="flex-1">{children}</main>
      <Footer />
      <ShopAssistant />
    </div>
  );
}
