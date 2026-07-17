'use client';
import { PageHeader } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';
import { Card } from '@/components/ui/card';

export default function AdminCategoriesPage() {
  const list = trpc.catalog.categories.useQuery();
  return (
    <div>
      <PageHeader title="Categories" description="Manage the catalog tree (full CRUD coming soon)." />
      <div className="grid gap-2 md:grid-cols-3">
        {list.data?.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="font-medium">{c.name}</div>
            <div className="text-xs text-muted-foreground">/{c.slug}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
