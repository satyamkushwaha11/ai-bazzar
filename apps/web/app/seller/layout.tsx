import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { DashboardSidebar } from '@/components/dashboard/Sidebar';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login?next=/seller');
  if (session.user.role !== 'SELLER' && session.user.role !== 'ADMIN') redirect('/');
  return (
    <div className="flex">
      <DashboardSidebar kind="seller" />
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
