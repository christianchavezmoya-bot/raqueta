'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface AdminPlayer {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  playerProfile: {
    id: string;
    displayName: string;
    profilePhotoUrl: string | null;
    level: string;
    category: string | null;
    homeClub: { id: string; name: string } | null;
  } | null;
}

const levelBadge = (level: string) => {
  const map: Record<string, string> = {
    BEGINNER:     'bg-gray-100 text-gray-600',
    INTERMEDIATE: 'bg-blue-100 text-blue-600',
    ADVANCED:     'bg-purple-100 text-purple-600',
    COMPETITIVE:  'bg-orange-100 text-orange-600',
    PROFESSIONAL: 'bg-red-100 text-red-600',
  };
  return map[level] ?? 'bg-gray-100 text-gray-500';
};

export default function AdminPlayersPage() {
  const [players, setPlayers]   = useState<AdminPlayer[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      const { data } = await api.get(`/admin/players?${params}`);
      setPlayers(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Players</h1>

      <div className="flex gap-3 mb-6">
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by display name…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <span className="text-sm text-gray-400 self-center">{total} total</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Player', 'Email', 'Level', 'Home Club', 'Status', 'Joined'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : players.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No players found</td></tr>
            ) : players.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {p.playerProfile?.profilePhotoUrl
                      ? <img src={p.playerProfile.profilePhotoUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
                      : <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold">
                          {p.playerProfile?.displayName?.[0]?.toUpperCase() ?? '?'}
                        </div>
                    }
                    <span className="font-medium text-gray-800">{p.playerProfile?.displayName ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{p.email}</td>
                <td className="px-4 py-3">
                  {p.playerProfile?.level && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${levelBadge(p.playerProfile.level)}`}>
                      {p.playerProfile.level}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{p.playerProfile?.homeClub?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{total} players total</span>
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
