'use client';

import { useState } from 'react';
import { Search, Users, Star } from 'lucide-react';
import { usePlayers } from '@/hooks/use-club';
import Link from 'next/link';

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Principiante',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
  COMPETITIVE: 'Competitivo',
  PROFESSIONAL: 'Profesional',
};

const LEVEL_COLORS: Record<string, string> = {
  BEGINNER: 'badge-gray',
  INTERMEDIATE: 'badge-green',
  ADVANCED: 'badge-yellow',
  COMPETITIVE: 'badge-red',
  PROFESSIONAL: 'badge-red',
};

export default function PlayersPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = usePlayers();

  const players = data?.data ?? [];
  const filtered = players.filter((p: any) =>
    !search ||
    p.playerProfile?.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Jugadores</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-field pl-9"
            placeholder="Buscar jugador..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nivel</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rol</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Partidos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Victorias</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((player: any) => (
                    <tr key={player.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-brand-700">
                              {player.playerProfile?.displayName?.[0] ?? player.email[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{player.playerProfile?.displayName}</p>
                            <p className="text-xs text-gray-500">{player.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={LEVEL_COLORS[player.playerProfile?.level] ?? 'badge-gray'}>
                          {LEVEL_LABELS[player.playerProfile?.level] ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={player.role === 'MEMBER' ? 'badge-green' : 'badge-gray'}>
                          {player.role === 'MEMBER' ? 'Socio' : 'Casual'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{player.playerProfile?.stats?.matchesPlayed ?? 0}</td>
                      <td className="px-4 py-3 text-gray-600">{player.playerProfile?.stats?.wins ?? 0}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/players/${player.id}`}
                          className="text-xs text-brand-600 hover:underline font-medium"
                        >
                          Ver perfil →
                        </Link>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No se encontraron jugadores</p>
          </div>
        )}
      </div>
    </div>
  );
}
