'use client';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';

export default function AdminUsersPage() {
  const list = trpc.admin.users.useQuery();
  return (
    <div>
      <PageHeader title="Users" description="All platform users." />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Joined</th></tr>
          </thead>
          <tbody>
            {list.data?.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-3">{u.name ?? '—'}</td>
                <td className="p-3 text-muted-foreground">{u.email}</td>
                <td className="p-3"><Badge variant="outline">{u.role}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
