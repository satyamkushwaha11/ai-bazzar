'use client';
import { Card } from '@/components/ui/card';
import { PageHeader, StatCard } from '@/components/dashboard/Sidebar';
import { trpc } from '@/lib/trpc/client';
import { formatINR } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export default function SellerAnalyticsPage() {
  const a = trpc.seller.analytics.useQuery();
  return (
    <div>
      <PageHeader title="Analytics" description="Last 14 days." />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Revenue" value={a.data ? formatINR(a.data.revenue) : '—'} />
        <StatCard label="Units sold" value={a.data?.unitsSold ?? '—'} />
        <StatCard label="Order items" value={a.data?.orders ?? '—'} />
      </div>
      <Card className="mt-6 p-6">
        <h2 className="mb-4 text-base font-semibold">Daily revenue</h2>
        <div className="h-72 w-full">
          {a.data && a.data.series.length > 0 ? (
            <ResponsiveContainer>
              <LineChart data={a.data.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(85% 0 0)" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v: number) => formatINR(v)}
                  contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">No revenue data yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
