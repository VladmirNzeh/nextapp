// app/dashboard/layout.tsx
import SideNav from '@/app/ui/dashboard/sidenav';
import { auth } from '@/auth'; // import from your NextAuth setup
import { redirect } from 'next/navigation';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth(); //  NextAuth v5 helper

  if (!session) {
    redirect('/login'); // block direct access
  }

  return (
    <div className="flex h-screen flex-col md:flex-row md:overflow-hidden">
      <div className="w-full flex-none md:w-64">
        <SideNav />
      </div>
      <div className="grow p-6 md:overflow-y-auto md:p-12">{children}</div>
    </div>
  );
}
