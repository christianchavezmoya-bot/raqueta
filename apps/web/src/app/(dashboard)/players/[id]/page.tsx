'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, User, Trophy, Activity, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

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
  const queryClient = useQueryClient();

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
      const { data } = await api.get(`/players/${id}/memberships`);
      return data;
    },
    enabled: !!id,
  });

  const upgradeMutation = useMutation({
    mutationFn: (role: string) => api.patch(`/players/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player', id] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      toast.success('Rol actualizado');
    },
    onError: () => toast.error('Error al actualizar rol'),
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
  const winRate = stats?.matchesPlayed > 0
    ? Math.round((stats.wins / stats.matchesPlayed) * 100)
    : 0;

  const activeMembership = memberships?.find((m: any) => m.status === 'ACTIVE');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Perfil del jugador</h1>
      </div>

      {/* Profile card */}
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
              <span className={player.role === 'MEMBER' ? 'badge-green' : 'badge-gray'}>
                {player.role === 'MEMBER' ? 'Socio' : player.role === 'PLAYER' ? 'Jugador' : player.role}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{player.email}</p>
            {player.phone && <p className="text-sm text-gray-500">{player.phone}</p>}
          </div>

          {/* Role toggle */}
          <div className="flex gap-2">
            {player.role !== 'MEMBER' && (
              <button
                className="btn-primary text-sm"
                onClick={() => upgradeMutation.mutate('MEMBER')}
                disabled={upgradeMutation.isPending}
              >
                Hacer socio
              </button>
            )}
            {player.role === 'MEMBER' && (
              <button
                className="btn-secondary text-sm"
                onClick={() => upgradeMutation.mutate('PLAYER')}
                disabled={upgradeMutation.isPending}
              >
                Quitar membresía
              </button>
            )}
          </div>
        </div>

        {/* Extra profile info */}
        {profile && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
            {profile.birthDate && (
              <div>
                <p className="text-xs text-gray-500">Fecha de nacimiento</p>
                <p className="text-sm font-medium text-gray-900">
                  {format(new Date(profile.birthDate), 'd MMM yyyy', { locale: es })}
                </p>
              </div>
            )}
            {profile.hand && (
              <div>
                <p className="text-xs text-gray-500">Mano</p>
                <p className="text-sm font-medium text-gray-900">{HAND_LABELS[profile.hand] ?? profile.hand}</p>
              </div>
            )}
            {profile.backhand && (
              <div>
                <p className="text-xs text-gray-500">Revés</p>
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

      {/* Stats + Membership */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Stats */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-gray-900">Estadísticas</h3>
          </div>
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
        </div>

        {/* Membership */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-gray-900">Membresía</h3>
          </div>
          {activeMembership ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                <div>
                  <p className="font-semibold text-green-800">{activeMembership.plan?.name}</p>
                  <p className="text-xs text-green-700">
                    Válida hasta {format(new Date(activeMembership.endDate), 'd MMM yyyy', { locale: es })}
                  </p>
                </div>
                <span className="badge-green">Activa</span>
              </div>
              {memberships?.filter((m: any) => m.status !== 'ACTIVE').slice(0, 3).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                  <span className="text-gray-700">{m.plan?.name}</span>
                  <span className="badge-gray">Expirada</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin membresía activa</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent reservations */}
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
              {reservations.data.slice(0, 10).map((r: any) => (
                <tr key={r.id}>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{r.court?.name}</td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {format(new Date(r.startTime), 'd MMM HH:mm', { locale: es })}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={
                      r.status === 'CONFIRMED' ? 'badge-green' :
                      r.status === 'CANCELLED' ? 'badge-red' :
                      r.status === 'COMPLETED' ? 'badge-gray' : 'badge-yellow'
                    }>
                      {r.status === 'CONFIRMED' ? 'Confirmada' :
                       r.status === 'CANCELLED' ? 'Cancelada' :
                       r.status === 'COMPLETED' ? 'Completada' : r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                    {r.totalPrice ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(r.totalPrice) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
