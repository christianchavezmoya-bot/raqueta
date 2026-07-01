'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Loader2, Minus, X } from 'lucide-react';
import api from '@/lib/api';
import PlayerTypeBadge from '../PlayerTypeBadge';
import { rosterDisplayName } from '../display-name';
import type { RosterLike } from '../player-type';

interface RankingEntry {
  id: string;
  rank: number;
  previousRank: number | null;
  totalPoints: number;
  gamesPlayed: number;
  division?: string | null;
  rosterId: string;
  rosterEntry?: {
    id: string;
    firstName?: string;
    lastName?: string;
    linkedPlayerProfile?: { displayName?: string } | null;
    memberships?: Array<{ id?: string; status?: string }>;
  };
  movement: number;
}

interface Props {
  clubId?: string;
}

export default function RankingTab({ clubId }: Props) {
  const [openRosterId, setOpenRosterId] = useState<string | null>(null);

  const { data: rankings, isLoading } = useQuery({
    queryKey: ['club-rankings-internal', clubId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/rankings/internal`);
      return data as RankingEntry[];
    },
    enabled: !!clubId,
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Ranking interno del club (temporada activa). Los jugadores con partidos en este
        torneo aparecen resaltados. Hacé click en una fila para ver el historial completo.
      </p>

      {isLoading ? (
        <div className="card h-48 animate-pulse bg-gray-100" />
      ) : !rankings || rankings.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">Aún no hay un ranking calculado para este club.</p>
          <p className="text-xs mt-1">Registra resultados desde la sección Match Results para empezar.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-12">#</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-20">Δ</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-20">Partidos</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-32">Puntos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rankings.map(entry => (
                <RankingRow
                  key={entry.id}
                  entry={entry}
                  isOpen={openRosterId === entry.rosterId}
                  onToggle={() => setOpenRosterId(openRosterId === entry.rosterId ? null : entry.rosterId)}
                  clubId={clubId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openRosterId && (
        <SidePanel
          rosterId={openRosterId}
          clubId={clubId}
          onClose={() => setOpenRosterId(null)}
        />
      )}
    </div>
  );
}

function RankingRow({
  entry,
  isOpen,
  onToggle,
  clubId: _clubId,
}: {
  entry: RankingEntry;
  isOpen: boolean;
  onToggle: () => void;
  clubId?: string;
}) {
  const roster: RosterLike = entry.rosterEntry ?? { id: entry.rosterId, memberships: [] };
  const name = rosterDisplayName(entry.rosterEntry as any);

  return (
    <>
      <tr
        onClick={onToggle}
        className={`hover:bg-gray-50 cursor-pointer ${isOpen ? 'bg-gray-50' : ''}`}
      >
        <td className="px-3 py-2.5 text-center font-bold text-gray-700">{entry.rank}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{name}</span>
            <PlayerTypeBadge roster={roster} />
            {entry.division && (
              <span className="badge-gray text-[10px]">{entry.division}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-center">
          <MovementIndicator movement={entry.movement} />
        </td>
        <td className="px-3 py-2.5 text-right text-gray-700">{entry.gamesPlayed}</td>
        <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{entry.totalPoints}</td>
      </tr>
    </>
  );
}

function MovementIndicator({ movement }: { movement: number }) {
  if (movement > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-green-700 text-xs font-semibold">
        <ArrowUp className="w-3 h-3" /> {movement}
      </span>
    );
  }
  if (movement < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-700 text-xs font-semibold">
        <ArrowDown className="w-3 h-3" /> {Math.abs(movement)}
      </span>
    );
  }
  return <Minus className="w-3 h-3 text-gray-400 inline" />;
}

function SidePanel({
  rosterId,
  clubId,
  onClose,
}: {
  rosterId: string;
  clubId?: string;
  onClose: () => void;
}) {
  const { data: breakdown, isLoading: loadingBreakdown } = useQuery({
    queryKey: ['ranking-breakdown', clubId, rosterId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/rankings/breakdown?rosterId=${rosterId}`);
      return data as { pr: number; pe3: number; desafios: number; penalizaciones: number; otherBonos: number; total: number };
    },
    enabled: !!clubId && !!rosterId,
  });

  const { data: matches, isLoading: loadingMatches } = useQuery({
    queryKey: ['ranking-matches', clubId, rosterId],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${clubId}/match-results?limit=50`);
      return data as Array<{
        id: string;
        player1Name: string;
        player2Name: string;
        winnerId: string;
        roundLabel: string;
        source?: string;
        playedAt: string;
        pointsAwarded: number;
      }>;
    },
    enabled: !!clubId && !!rosterId,
  });

  const myMatches = (matches ?? []).filter(
    m => m.winnerId === rosterId || (m.player1Name && m.player2Name),
  );

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-white shadow-2xl z-40 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Detalle del jugador</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Desglose de puntos</h4>
          {loadingBreakdown ? (
            <div className="h-20 bg-gray-100 animate-pulse rounded" />
          ) : breakdown ? (
            <div className="grid grid-cols-2 gap-2">
              <BreakdownRow label="PR (Partidos)" value={breakdown.pr} />
              <BreakdownRow label="PE3" value={breakdown.pe3} />
              <BreakdownRow label="Desafíos" value={breakdown.desafios} />
              <BreakdownRow label="Penalizaciones" value={breakdown.penalizaciones} />
              <BreakdownRow label="Otros bonos" value={breakdown.otherBonos} />
              <div className="rounded-lg bg-brand-50 ring-1 ring-brand-200 px-3 py-2">
                <p className="text-xs text-brand-700 font-semibold">TOTAL</p>
                <p className="text-2xl font-bold text-brand-700">{breakdown.total}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin datos</p>
          )}
        </section>

        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Historial reciente</h4>
          {loadingMatches ? (
            <div className="h-32 bg-gray-100 animate-pulse rounded" />
          ) : myMatches.length === 0 ? (
            <p className="text-sm text-gray-400">Sin partidos registrados</p>
          ) : (
            <div className="space-y-1.5">
              {myMatches.slice(0, 15).map(m => {
                const iWon = m.winnerId === rosterId;
                return (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={iWon ? 'badge-green text-xs' : 'badge-red text-xs'}>
                        {iWon ? 'G' : 'P'}
                      </span>
                      <span className="truncate">
                        vs <span className="font-medium">{iWon ? m.player2Name : m.player1Name}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="badge-gray text-[10px]">{m.roundLabel}</span>
                      <span className="font-mono text-xs text-gray-700">{m.pointsAwarded}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}