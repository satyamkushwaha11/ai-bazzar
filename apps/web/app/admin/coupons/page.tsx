import { PageHeader } from '@/components/dashboard/Sidebar';

export default function AdminCouponsPage() {
  return (
    <div>
      <PageHeader title="Coupons" description="Coming soon — coupon management UI." />
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
        Use the seed coupon <code className="rounded bg-muted px-2 py-0.5">WELCOME10</code> in the meantime.
      </div>
    </div>
  );
}
