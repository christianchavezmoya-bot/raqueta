'use client';

import { Bell, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

interface TopbarProps {
  title?: string;
}

export default function Topbar({ title }: TopbarProps) {
  const user = useAuthStore(s => s.user);

  return (
    <header className="flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200">
      <div className="flex items-center gap-4">
        {title && <h1 className="text-lg font-semibold text-gray-900">{title}</h1>}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="pl-9 pr-4 py-2 text-sm bg-gray-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-brand-500 w-56"
          />
        </div>
        <button className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center">
          <span className="text-sm font-semibold text-white">{user?.email?.[0]?.toUpperCase()}</span>
        </div>
      </div>
    </header>
  );
}
