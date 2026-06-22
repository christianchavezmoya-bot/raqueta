'use client';

import { useState } from 'react';
import { Trophy, Medal, TrendingUp } from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import { useRankings } from '@/hooks/use-club';

export default function RankingsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const [category, setCategory] = useState('');
  const { data: rankings, isLoading } = useRankings(selectedClub?.id);

  const filtered = category ? rankings?.filter((r: any) => r.category === category) : rankings;
  const categories = [...new Set(rankings?.map((r: any) => r.category) ?? [])];

  const getMedalColor = (pos: number) => {
    if (pos === 1) return 'text-yellow-500';
    if (pos === 2) return 'text-gray-400';
    if (pos === 3) return 'text-amber-600';
    return 'text-gray-300';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Ranking</h1>
        <div className="flex gap-3">
          <select className="input-field w-auto" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categories.map((c: any) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-12">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Categoría</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Puntos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Partidos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Victorias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered?.map((r: any, idx: number) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          {idx < 3 ? (
                            <Medal className={`w-5 h-5 ${getMedalColor(idx + 1)}`} />
                          ) : (
                            <span className="text-gray-400 font-medium w-5 text-center">{idx + 1}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                            <span className="text-xs font-semibold text-brand-700">
                              {r.player?.playerProfile?.displayName?.[0] ?? r.player?.email?.[0]?.toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{r.player?.playerProfile?.displayName}</p>
                            <p className="text-xs text-gray-500">{r.player?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.category}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5 text-brand-500" />
                          <span className="font-semibold text-gray-900">{r.points}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.player?.playerProfile?.stats?.matchesPlayed ?? 0}</td>
                      <td className="px-4 py-3 text-gray-600">{r.player?.playerProfile?.stats?.wins ?? 0}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!isLoading && (!filtered || filtered.length === 0) && (
          <div className="text-center py-12 text-gray-400">
            <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay datos de ranking</p>
            <p className="text-xs mt-1">Los puntos se actualizan automáticamente al registrar resultados de partidos</p>
          </div>
        )}
      </div>
    </div>
  );
}
