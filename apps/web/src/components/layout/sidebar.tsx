'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Calendar, BookOpen, Users, CreditCard,
  Trophy, BarChart3, Settings, Building2, MapPin, UserCheck,
  Award, FileText, Bell, LogOut, ChevronRight, History, ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useClubStore } from '@/stores/club.store';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/calendar', label: 'Calendario', icon: Calendar },
  { href: '/dashboard/reservations', label: 'Reservas', icon: BookOpen },
  { href: '/dashboard/players', label: 'Jugadores', icon: Users },
  { href: '/dashboard/memberships', label: 'Membresías', icon: UserCheck },
  { href: '/dashboard/courts', label: 'Canchas', icon: MapPin },
  { href: '/dashboard/instructors', label: 'Instructores', icon: Award },
  { href: '/dashboard/tournaments', label: 'Torneos', icon: Trophy },
  { href: '/dashboard/payments', label: 'Pagos', icon: CreditCard },
  { href: '/dashboard/rankings', label: 'Ranking', icon: BarChart3 },
  { href: '/dashboard/history', label: 'History', icon: History },
  { href: '/dashboard/reports', label: 'Reportes', icon: FileText },
  { href: '/dashboard/announcements', label: 'Anuncios', icon: Bell },
  { href: '/dashboard/settings', label: 'Club & Config', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const logout = useAuthStore(s => s.logout);
  const user = useAuthStore(s => s.user);
  const selectedClub = useClubStore(s => s.selectedClub);

  return (
    <div className="flex h-screen w-64 flex-col bg-gray-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
        <span className="text-2xl">🎾</span>
        <div>
          <p className="font-bold text-white leading-tight">Raqueta</p>
          <p className="text-xs text-gray-400">Business App</p>
        </div>
      </div>

      {/* Club selector */}
      {selectedClub && (
        <div className="px-4 py-3 border-b border-gray-700">
          {user?.role === 'SUPER_ADMIN' ? (
            <Link href="/admin/clubs" title="Switch club via Admin Console">
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 hover:bg-gray-700 transition-colors cursor-pointer">
                <Building2 className="w-4 h-4 text-brand-400 flex-shrink-0" />
                <span className="text-sm text-gray-200 truncate">{selectedClub.name}</span>
                <ChevronRight className="w-3 h-3 text-gray-500 ml-auto" />
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <Building2 className="w-4 h-4 text-brand-400 flex-shrink-0" />
              <span className="text-sm text-gray-200 truncate">{selectedClub.name}</span>
              <ChevronRight className="w-3 h-3 text-gray-500 ml-auto" />
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Super Admin link */}
      {user?.role === 'SUPER_ADMIN' && (
        <div className="px-3 pb-2 border-t border-gray-700 pt-3">
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-amber-400 hover:bg-gray-800 hover:text-amber-300 transition-colors"
          >
            <ShieldCheck className="w-5 h-5 flex-shrink-0" />
            Admin Console
          </Link>
        </div>
      )}

      {/* User menu */}
      <div className="border-t border-gray-700 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold">{user?.email?.[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.email}</p>
            <p className="text-xs text-gray-400">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
