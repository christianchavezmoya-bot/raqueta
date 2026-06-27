'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Building2, Users, TrendingUp, AlertTriangle } from 'lucide-react';

interface PlatformStats {
  clubs: {
    total: number;
    byStatus: Record<string, number>;
    newLast30d: number;
    conversionRate: number;
    trialExpiringSoon: Array<{ id: string; name: string; trialEndsAt: string; daysRemaining: number }>;
  };
  players: { total: number; newLast30d: number };
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats').then(r => setStats(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500">Loading…</div>;
  if (!stats)  return <div className="text-red-500">Failed to load stats</div>;

  const { clubs, players } = stats;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Platform Overview</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Building2 className="w-5 h-5 text-blue-600" />} label="Total Clubs" value={clubs.total} sub={`+${clubs.newLast30d} last 30 days`} />
        <StatCard icon={<TrendingUp className="w-5 h-5 text-green-600" />} label="Trial → Active" value={`${clubs.conversionRate}%`} sub="conversion rate" />
        <StatCard icon={<Users className="w-5 h-5 text-purple-600" />} label="Total Players" value={players.total} sub={`+${players.newLast30d} last 30 days`} />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
          label="Trials Expiring"
          value={clubs.trialExpiringSoon.length}
          sub="within 7 days"
        />
      </div>

      {/* Club status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Clubs by Status</h2>
          <div className="space-y-2">
            {Object.entries(clubs.byStatus).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{status}</span>
                <span className="font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trials expiring soon */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Trials Expiring Soon</h2>
          {clubs.trialExpiringSoon.length === 0 ? (
            <p className="text-sm text-gray-400">No trials expiring in 7 days</p>
          ) : (
            <div className="space-y-2">
              {clubs.trialExpiringSoon.map(c => (
                <div key={c.id} className="flex justify-between items-center">
                  <Link href={`/admin/clubs/${c.id}`} className="text-sm text-blue-600 hover:underline">
                    {c.name}
                  </Link>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.daysRemaining <= 1 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {c.daysRemaining}d left
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="flex gap-3">
        <Link href="/admin/clubs" className="btn-secondary text-sm px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
          View all clubs →
        </Link>
        <Link href="/admin/players" className="btn-secondary text-sm px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
          View all players →
        </Link>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-sm text-gray-500">{label}</span></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
