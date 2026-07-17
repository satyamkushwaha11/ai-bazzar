'use client';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';

export default function AccountPage() {
  const me = trpc.auth.me.useQuery();
  return (
    <div className="container-page py-8">
      <h1 className="font-display text-3xl">Account</h1>
      <Card className="mt-6 p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name" value={me.data?.name ?? '—'} />
          <Field label="Email" value={me.data?.email ?? '—'} />
          <Field label="Role" value={me.data?.role ?? '—'} />
          <Field label="Phone" value={me.data?.phone ?? '—'} />
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
