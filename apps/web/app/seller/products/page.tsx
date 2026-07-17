'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';

export default function SellerProductsPage() {
  const list = trpc.seller.products.useQuery();

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage your catalog. Set list & min price per variant — AI negotiates within your range."
        action={<Button asChild><Link href="/seller/products/new">+ New product</Link></Button>}
      />
      {list.isLoading ? (
        <div>Loading…</div>
      ) : list.data?.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No products yet.</p>
          <Button asChild className="mt-4"><Link href="/seller/products/new">Create your first product</Link></Button>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">Status</th>
                <th className="p-3">Variants</th>
                <th className="p-3">Price range</th>
                <th className="p-3">Stock</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((p) => {
                const minList = Math.min(...p.variants.map((v) => Number(v.listPrice)));
                const maxList = Math.max(...p.variants.map((v) => Number(v.listPrice)));
                const stock = p.variants.reduce((s, v) => s + v.stock, 0);
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {p.images[0]?.url && (
                          <div className="relative h-12 w-12 overflow-hidden rounded">
                            <Image src={p.images[0].url} alt={p.title} fill sizes="48px" className="object-cover" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{p.title}</div>
                          <div className="text-xs text-muted-foreground">{p.brand ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant={p.status === 'ACTIVE' ? 'success' : p.status === 'DRAFT' ? 'secondary' : 'outline'}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="p-3">{p.variants.length}</td>
                    <td className="p-3">
                      {minList === maxList ? formatINR(minList) : `${formatINR(minList)} – ${formatINR(maxList)}`}
                    </td>
                    <td className="p-3">{stock}</td>
                    <td className="p-3 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/seller/products/${p.id}`}>Edit</Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
