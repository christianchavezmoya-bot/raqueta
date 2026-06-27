'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface AdminClub {
  id: string;
  name: string;
  slug: string;
  status: string;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  playerCount: number;
  staffCount: number;
  createdAt: string;
}

const STATUS_OPTIONS = ['', 'ACTIVE', 'TRIAL', 'LOCKED', 'INACTIVE', 'SUSPENDED'];

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    ACTIVE:    'bg-green-100 text-green-700',
    TRIAL:     'bg-amber-100 text-amber-700',
    LOCKED:    'bg-red-100 text-red-700',
    INACTIVE:  'bg-gray-100 text-gray-500',
    SUSPENDED: 'bg-orange-100 text-orange-700',
    PENDING:   'bg-blue-100 text-blue-700',
  };
  return map[status] ?? 'bg-gray-100 text-gray-500';
};

export default function AdminClubsPage() {
  const [clubs, setClubs] = useState<AdminClub[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const { data } = await api.get(`/admin/clubs?${params}`);
      setClubs(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Clubs</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search clubs…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s || 'All statuses'}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Club', 'Status', 'Trial ends', 'Players', 'Staff', 'Created'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : clubs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No clubs found</td></tr>
            ) : clubs.map(club => (
              <tr key={club.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/clubs/${club.id}`} className="font-medium text-blue-600 hover:underline">
                    {club.name}
                  </Link>
                  <div className="text-xs text-gray-400">{club.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(club.status)}`}>
                    {club.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {club.trialEndsAt
                    ? <><span>{new Date(club.trialEndsAt).toLocaleDateString()}</span>{' '}
                        <span className={`text-xs font-medium ${(club.trialDaysRemaining ?? 0) <= 3 ? 'text-red-600' : 'text-amber-600'}`}>
                          ({club.trialDaysRemaining}d)
                        </span>
                      </>
                    : <span className="text-gray-300">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-gray-700">{club.playerCount}</td>
                <td className="px-4 py-3 text-gray-700">{club.staffCount}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(club.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{total} clubs total</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
