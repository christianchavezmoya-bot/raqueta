'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Activity, ArrowLeft, Calendar, History, Trophy, User } from 'lucide-react';
import api from '@/lib/api';
import { useClubStore } from '@/stores/club.store';

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

const HAND_LABELS: Record<string, string> = {
  RIGHT: 'Diestro',
  LEFT: 'Zurdo',
};

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const selectedClub = useClubStore(s => s.selectedClub);

  const { data: player, isLoading } = useQuery({
    queryKey: ['player', id],
    queryFn: async () => {
      const { data } = await api.get(`/players/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const { data: reservations } = useQuery({
    queryKey: ['player-reservations', id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}/reservations`);
      return data;
    },
    enabled: !!id,
  });

  const { data: memberships } = useQuery({
    queryKey: ['player-memberships', id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}/memberships`);
      return data;
    },
    enabled: !!id,
  });

  const rosterLink = player?.playerProfile?.rosterLinks?.find((link: any) => link.clubId === selectedClub?.id);

  const { data: playerHistory } = useQuery({
    queryKey: ['player-history', selectedClub?.id, rosterLink?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/history/players/${rosterLink?.id}`);
      return data;
    },
    enabled: !!selectedClub?.id && !!rosterLink?.id,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="card h-48 animate-pulse bg-gray-100" />
        <div className="card h-48 animate-pulse bg-gray-100" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="text-center py-16 text-gray-400">
        <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Jugador no encontrado</p>
        <button className="btn-secondary mt-4" onClick={() => router.back()}>Volver</button>
      </div>
    );
  }

  const profile = player.playerProfile;
  const stats = profile?.stats;
  const sharedStats = profile?.sharedStats;
  const clubCanSeeStats = profile?.statsVisibility?.shareStatsWithClub !== false;
  const winRate = stats?.matchesPlayed > 0
    ? Math.round((stats.wins / stats.matchesPlayed) * 100)
    : 0;
  const visibleMemberships = selectedClub?.id
    ? memberships?.filter((membership: any) => membership.clubId === selectedClub.id)
    : memberships;
  const activeMembership = visibleMemberships?.find((membership: any) => membership.status === 'ACTIVE');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Perfil del jugador</h1>
      </div>

      <div className="card">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-brand-700">
              {profile?.displayName?.[0] ?? player.email[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{profile?.displayName ?? 'Sin nombre'}</h2>
              {profile?.level && (
                <span className={LEVEL_COLORS[profile.level]}>{LEVEL_LABELS[profile.level]}</span>
              )}
              <span className={activeMembership ? 'badge-green' : 'badge-gray'}>
                {activeMembership ? 'Socio activo' : player.role === 'PLAYER' ? 'Jugador' : player.role}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{player.email}</p>
            {player.phone && <p className="text-sm text-gray-500">{player.phone}</p>}
          </div>

          <p className="text-xs text-gray-500">
            La membresía se administra desde el módulo <span className="font-medium">Membresías</span> usando planes y roster del club.
          </p>
        </div>

        {profile && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
            {profile.dateOfBirth && (
              <div>
                <p className="text-xs text-gray-500">Fecha de nacimiento</p>
                <p className="text-sm font-medium text-gray-900">
                  {format(new Date(profile.dateOfBirth), 'd MMM yyyy', { locale: es })}
                </p>
              </div>
            )}
            {profile.dominantHand && (
              <div>
                <p className="text-xs text-gray-500">Mano</p>
                <p className="text-sm font-medium text-gray-900">
                  {HAND_LABELS[profile.dominantHand] ?? profile.dominantHand}
                </p>
              </div>
            )}
            {profile.backhand && (
              <div>
                <p className="text-xs text-gray-500">Reves</p>
                <p className="text-sm font-medium text-gray-900">{profile.backhand}</p>
              </div>
            )}
            {profile.height && (
              <div>
                <p className="text-xs text-gray-500">Altura</p>
                <p className="text-sm font-medium text-gray-900">{profile.height} cm</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-gray-900">Estadisticas</h3>
          </div>
          {!clubCanSeeStats ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-sm text-gray-500">
              Este jugador no comparte estadísticas detalladas con el staff del club.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Partidos jugados', value: stats?.matchesPlayed ?? 0 },
                  { label: 'Victorias', value: stats?.wins ?? 0 },
                  { label: 'Derrotas', value: stats?.losses ?? 0 },
                  { label: '% de victorias', value: `${winRate}%` },
                  { label: 'Puntos ranking', value: stats?.rankingPoints ?? 0 },
                  { label: 'Torneos', value: stats?.tournamentsPlayed ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-900">{value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {sharedStats?.bySource?.length > 0 && (
                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-900">Rendimiento por fuente</p>
                  <div className="mt-3 space-y-2 text-sm text-gray-600">
                    {sharedStats.bySource.map((entry: any) => (
                      <div key={entry.source} className="flex items-center justify-between">
                        <span>{entry.source}</span>
                        <span>{entry.wins}W / {entry.losses}L · {entry.matchesPlayed} partidos</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-gray-900">Membresia</h3>
          </div>
          {activeMembership ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                <div>
                  <p className="font-semibold text-green-800">{activeMembership.plan?.name}</p>
                  <p className="text-xs text-green-700">
                    Valida hasta {format(new Date(activeMembership.endDate), 'd MMM yyyy', { locale: es })}
                  </p>
                </div>
                <span className="badge-green">Activa</span>
              </div>
              {visibleMemberships?.filter((membership: any) => membership.status !== 'ACTIVE').slice(0, 3).map((membership: any) => (
                <div key={membership.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                  <span className="text-gray-700">{membership.plan?.name}</span>
                  <span className="badge-gray">Expirada</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin membresia activa</p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-brand-600" />
          <h3 className="font-semibold text-gray-900">Reservas recientes</h3>
        </div>
        {!reservations?.data?.length ? (
          <p className="text-center py-6 text-gray-400 text-sm">Sin reservas</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Cancha</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Fecha y hora</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reservations.data.slice(0, 10).map((reservation: any) => (
                <tr key={reservation.id}>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{reservation.court?.name}</td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {format(new Date(reservation.startTime), 'd MMM HH:mm', { locale: es })}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={
                      reservation.status === 'CONFIRMED' ? 'badge-green' :
                      reservation.status === 'CANCELLED' ? 'badge-red' :
                      reservation.status === 'COMPLETED' ? 'badge-gray' : 'badge-yellow'
                    }>
                      {reservation.status === 'CONFIRMED' ? 'Confirmada' :
                        reservation.status === 'CANCELLED' ? 'Cancelada' :
                        reservation.status === 'COMPLETED' ? 'Completada' : reservation.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                    {reservation.price
                      ? new Intl.NumberFormat('es-CL', {
                          style: 'currency',
                          currency: 'CLP',
                          maximumFractionDigits: 0,
                        }).format(reservation.price)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-brand-600" />
          <h3 className="font-semibold text-gray-900">Historial del club</h3>
        </div>

        {!selectedClub ? (
          <p className="text-sm text-gray-400">Selecciona un club para ver el historial asociado.</p>
        ) : !rosterLink ? (
          <p className="text-sm text-gray-400">Este jugador no esta vinculado al roster del club seleccionado.</p>
        ) : !playerHistory ? (
          <p className="text-sm text-gray-400">Sin historial disponible todavia.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Internos', value: playerHistory.counts.ladderMatches },
                { label: 'Torneos', value: playerHistory.counts.tournamentMatches },
                { label: 'Reservas', value: playerHistory.counts.reservations },
                { label: 'Bonos', value: playerHistory.counts.bonusAwards },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-lg font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {(playerHistory.timeline ?? []).slice(0, 8).map((event: any) => (
                <div key={`${event.kind}-${event.occurredAt}`} className="border-l-2 border-brand-200 pl-3">
                  <p className="text-sm font-medium text-gray-900">{event.summary}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(event.occurredAt), 'd MMM yyyy, HH:mm', { locale: es })} · {event.kind}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
