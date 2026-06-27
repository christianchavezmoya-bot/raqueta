'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useClubStore } from '@/stores/club.store';
import { ArrowLeft, Building2, Users, Unlock, CalendarClock, ExternalLink } from 'lucide-react';

interface ClubDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  trialEndsAt: string | null;
  trialStatus: { expired: boolean; daysRemaining: number | null; endsAt?: string };
  staffCount: number;
  _count: { rosterEntries: number; reservations: number; memberships: number; tournaments: number };
  profile: any;
}

export default function AdminClubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const setSelectedClub = useClubStore(s => s.setSelectedClub);

  const [club, setClub]       = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [extendDays, setExtendDays] = useState(14);
  const [msg, setMsg]         = useState('');

  useEffect(() => {
    api.get(`/admin/clubs/${id}`)
      .then(r => setClub(r.data))
      .catch(() => router.push('/admin/clubs'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const extend = async () => {
    setSaving(true); setMsg('');
    try {
      await api.patch(`/clubs/${id}/extend-trial`, { days: extendDays });
      const r = await api.get(`/admin/clubs/${id}`);
      setClub(r.data);
      setMsg(`Trial extended by ${extendDays} days.`);
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed');
    } finally { setSaving(false); }
  };

  const unlock = async () => {
    if (!confirm(`Promote ${club?.name} to ACTIVE?`)) return;
    setSaving(true); setMsg('');
    try {
      await api.patch(`/clubs/${id}/unlock`);
      const r = await api.get(`/admin/clubs/${id}`);
      setClub(r.data);
      setMsg('Club promoted to ACTIVE.');
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed');
    } finally { setSaving(false); }
  };

  const viewAsDashboard = () => {
    if (!club) return;
    setSelectedClub({ id: club.id, name: club.name, slug: club.slug });
    router.push('/dashboard');
  };

  if (loading) return <div className="text-gray-400">Loading…</div>;
  if (!club)   return null;

  const isTrial  = club.status === 'TRIAL';
  const isLocked = club.status === 'LOCKED' || club.status === 'INACTIVE';

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/clubs" className="text-gray-400 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{club.name}</h1>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
          club.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
          club.status === 'TRIAL'  ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700'}`}>
          {club.status}
        </span>
      </div>

      {msg && <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Stats */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Roster players', value: club._count.rosterEntries, icon: <Users className="w-4 h-4 text-blue-500" /> },
            { label: 'Staff',          value: club.staffCount,          icon: <Building2 className="w-4 h-4 text-gray-500" /> },
            { label: 'Reservations',   value: club._count.reservations, icon: <CalendarClock className="w-4 h-4 text-purple-500" /> },
            { label: 'Members',        value: club._count.memberships,  icon: <Users className="w-4 h-4 text-green-500" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-gray-400">{label}</span></div>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Actions panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm">Actions</h2>

          {/* Jump to dashboard */}
          <button onClick={viewAsDashboard}
            className="flex items-center gap-2 w-full text-left text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ExternalLink className="w-4 h-4 text-gray-500" />
            View club dashboard
          </button>

          {/* Extend trial */}
          {(isTrial || club.trialEndsAt) && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Trial ends: {club.trialStatus.endsAt ? new Date(club.trialStatus.endsAt).toLocaleDateString() : '—'}
                {club.trialStatus.daysRemaining !== null && ` (${club.trialStatus.daysRemaining}d remaining)`}
              </p>
              <div className="flex gap-2">
                <input
                  type="number" min={1} max={365} value={extendDays}
                  onChange={e => setExtendDays(+e.target.value)}
                  className="w-20 text-sm border border-gray-300 rounded px-2 py-1.5"
                />
                <button onClick={extend} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-amber-600 text-white rounded-lg px-3 py-1.5 hover:bg-amber-700 disabled:opacity-50">
                  <CalendarClock className="w-4 h-4" />
                  Extend trial
                </button>
              </div>
            </div>
          )}

          {/* Unlock / promote */}
          {(isTrial || isLocked) && (
            <button onClick={unlock} disabled={saving}
              className="flex items-center justify-center gap-2 w-full text-sm bg-green-600 text-white rounded-lg px-3 py-2 hover:bg-green-700 disabled:opacity-50">
              <Unlock className="w-4 h-4" />
              Promote to ACTIVE
            </button>
          )}
        </div>
      </div>

      {/* Club info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Info</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><dt className="text-gray-400">Slug</dt><dd className="text-gray-800">{club.slug}</dd></div>
          <div><dt className="text-gray-400">ID</dt><dd className="text-gray-500 font-mono text-xs">{club.id}</dd></div>
          {club.profile?.address && <div><dt className="text-gray-400">Address</dt><dd className="text-gray-800">{club.profile.address}</dd></div>}
          {club.profile?.city && <div><dt className="text-gray-400">City</dt><dd className="text-gray-800">{club.profile.city}</dd></div>}
        </dl>
      </div>
    </div>
  );
}
