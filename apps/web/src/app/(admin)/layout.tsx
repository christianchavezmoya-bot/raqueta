'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Building2, Users, BarChart3, LogOut, ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

const adminNav = [
  { href: '/admin',         label: 'Overview',  icon: LayoutDashboard, exact: true },
  { href: '/admin/clubs',   label: 'Clubs',     icon: Building2 },
  { href: '/admin/players', label: 'Jugadores', icon: Users },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const logout = useAuthStore(s => s.logout);
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    if (user?.role !== 'SUPER_ADMIN') router.push('/dashboard');
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || user?.role !== 'SUPER_ADMIN') return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Admin sidebar */}
      <div className="flex h-screen w-60 flex-col bg-gray-950 text-white">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
          <ShieldCheck className="w-6 h-6 text-brand-400" />
          <div>
            <p className="font-bold text-white leading-tight text-sm">Super Admin</p>
            <p className="text-xs text-gray-500">Raqueta Platform</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {adminNav.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-brand-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}

          <div className="pt-4 border-t border-gray-800 mt-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Club Dashboard
            </Link>
          </div>
        </nav>

        <div className="border-t border-gray-800 p-4">
          <p className="text-xs text-gray-500 truncate mb-2">{user?.email}</p>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
