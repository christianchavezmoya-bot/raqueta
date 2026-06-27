'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useClubStore } from '@/stores/club.store';
import { CheckCircle, XCircle, Clock, Users } from 'lucide-react';

interface ParentChildLink {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  approvedAt: string | null;
  parent: { id: string; email: string };
  child: {
    id: string;
    email: string;
    playerProfile: { displayName: string; profilePhotoUrl: string | null } | null;
  };
  approvedBy: { id: string; email: string } | null;
}

const statusBadge = (s: string) => {
  if (s === 'PENDING')  return 'bg-amber-100 text-amber-700';
  if (s === 'APPROVED') return 'bg-green-100 text-green-700';
  return 'bg-red-100 text-red-700';
};

export default function ParentChildLinksPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const [links, setLinks]       = useState<ParentChildLink[]>([]);
  const [status, setStatus]     = useState('PENDING');
  const [loading, setLoading]   = useState(true);
  const [acting, setActing]     = useState<string | null>(null);
  const [msg, setMsg]           = useState('');

  const load = useCallback(async () => {
    if (!selectedClub) return;
    setLoading(true);
    try {
      const { data } = await api.get(
        `/clubs/${selectedClub.id}/parent-child-links?status=${status}`,
      );
      setLinks(data);
    } finally {
      setLoading(false);
    }
  }, [selectedClub, status]);

  useEffect(() => { load(); }, [load]);

  const act = async (linkId: string, action: 'approve' | 'reject') => {
    setActing(linkId); setMsg('');
    try {
      await api.post(`/parent-child-links/${linkId}/${action}`);
      setMsg(`Link ${action === 'approve' ? 'approved' : 'rejected'}.`);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Action failed');
    } finally {
      setActing(null);
    }
  };

  if (!selectedClub) {
    return <p className="text-gray-400 text-sm">No club selected.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">Parent-Child Links</h1>
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {msg && (
        <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          {msg}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Child', 'Parent', 'Status', 'Requested', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : links.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No {status.toLowerCase()} requests</td></tr>
            ) : links.map(link => (
              <tr key={link.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {link.child.playerProfile?.profilePhotoUrl
                      ? <img src={link.child.playerProfile.profilePhotoUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
                      : <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold">
                          {(link.child.playerProfile?.displayName ?? link.child.email)[0].toUpperCase()}
                        </div>
                    }
                    <div>
                      <p className="font-medium text-gray-800">
                        {link.child.playerProfile?.displayName ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400">{link.child.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{link.parent.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(link.status)}`}>
                    {link.status === 'PENDING'  && <Clock className="w-3 h-3" />}
                    {link.status === 'APPROVED' && <CheckCircle className="w-3 h-3" />}
                    {link.status === 'REJECTED' && <XCircle className="w-3 h-3" />}
                    {link.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(link.requestedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {link.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => act(link.id, 'approve')}
                        disabled={acting === link.id}
                        className="flex items-center gap-1 text-xs bg-green-600 text-white px-2.5 py-1 rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Approve
                      </button>
                      <button
                        onClick={() => act(link.id, 'reject')}
                        disabled={acting === link.id}
                        className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-lg hover:bg-red-200 disabled:opacity-50"
                      >
                        <XCircle className="w-3 h-3" />
                        Reject
                      </button>
                    </div>
                  )}
                  {link.status !== 'PENDING' && (
                    <span className="text-xs text-gray-400">
                      {link.approvedBy ? `by ${link.approvedBy.email}` : '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
