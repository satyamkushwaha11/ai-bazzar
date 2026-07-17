'use client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';

export default function AdminSellersPage() {
  const utils = trpc.useUtils();
  const list = trpc.admin.sellers.useQuery({});
  const set = trpc.admin.setSellerStatus.useMutation({
    onSuccess: () => { utils.admin.sellers.invalidate(); toast.success('Updated'); },
  });

  return (
    <div>
      <PageHeader title="Sellers" description="Approve, suspend, and manage stores." />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="p-3">Store</th><th className="p-3">Owner</th><th className="p-3">Status</th><th className="p-3">Joined</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {list.data?.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-3">
                  <div className="font-medium">{s.storeName}</div>
                  <div className="text-xs text-muted-foreground">/{s.slug}</div>
                </td>
                <td className="p-3 text-sm">
                  <div>{s.user.name}</div>
                  <div className="text-xs text-muted-foreground">{s.user.email}</div>
                </td>
                <td className="p-3">
                  <Badge variant={s.status === 'APPROVED' ? 'success' : s.status === 'PENDING' ? 'warning' : 'destructive'}>
                    {s.status}
                  </Badge>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td className="p-3 text-right">
                  {s.status === 'PENDING' && (
                    <>
                      <Button size="sm" onClick={() => set.mutate({ id: s.id, status: 'APPROVED' })}>Approve</Button>
                      <Button size="sm" variant="ghost" className="ml-2 text-destructive" onClick={() => set.mutate({ id: s.id, status: 'REJECTED' })}>
                        Reject
                      </Button>
                    </>
                  )}
                  {s.status === 'APPROVED' && (
                    <Button size="sm" variant="outline" onClick={() => set.mutate({ id: s.id, status: 'SUSPENDED' })}>
                      Suspend
                    </Button>
                  )}
                  {s.status === 'SUSPENDED' && (
                    <Button size="sm" onClick={() => set.mutate({ id: s.id, status: 'APPROVED' })}>Re-approve</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
