'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Trophy, Users, Calendar, ChevronDown, Play, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Borrador', color: 'badge-gray' },
  REGISTRATION_OPEN: { label: 'Inscripción abierta', color: 'badge-green' },
  REGISTRATION_CLOSED: { label: 'Inscripción cerrada', color: 'badge-yellow' },
  IN_PROGRESS: { label: 'En curso', color: 'badge-yellow' },
  COMPLETED: { label: 'Finalizado', color: 'badge-gray' },
  CANCELLED: { label: 'Cancelado', color: 'badge-red' },
};

const MATCH_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Programado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
  WALKOVER: 'Walkover',
};

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'registrations' | 'matches'>('overview');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<{ matchId: string; winnerId: string; score: string } | null>(null);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/tournaments/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      toast.success('Estado actualizado');
    },
    onError: () => toast.error('Error al actualizar estado'),
  });

  const generateFixtureMutation = useMutation({
    mutationFn: () => api.post(`/tournaments/${id}/generate-fixture`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      toast.success('Fixture generado exitosamente');
    },
    onError: () => toast.error('Error al generar fixture'),
  });

  const recordResultMutation = useMutation({
    mutationFn: (data: { matchId: string; winnerId: string; score: string }) =>
      api.post(`/matches/${data.matchId}/result`, { winnerId: data.winnerId, score: data.score }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      setMatchResult(null);
      toast.success('Resultado registrado');
    },
    onError: () => toast.error('Error al registrar resultado'),
  });

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="card h-48 animate-pulse bg-gray-100" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Torneo no encontrado</p>
        <button className="btn-secondary mt-4" onClick={() => router.back()}>Volver</button>
      </div>
    );
  }

  const statusCfg = STATUS_LABELS[tournament.status] ?? { label: tournament.status, color: 'badge-gray' };
  const totalRegistrations = tournament.categories?.reduce(
    (sum: number, cat: any) => sum + (cat.registrations?.length ?? 0), 0,
  ) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{tournament.name}</h1>
            <span className={statusCfg.color}>{statusCfg.label}</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(new Date(tournament.startDate), 'd MMM', { locale: es })} –{' '}
            {format(new Date(tournament.endDate), 'd MMM yyyy', { locale: es })}
          </p>
        </div>

        {/* Status actions */}
        <div className="flex gap-2">
          {tournament.status === 'DRAFT' && (
            <button className="btn-primary flex items-center gap-2" onClick={() => updateStatusMutation.mutate('REGISTRATION_OPEN')}>
              Abrir inscripciones
            </button>
          )}
          {tournament.status === 'REGISTRATION_OPEN' && (
            <>
              <button className="btn-secondary" onClick={() => updateStatusMutation.mutate('REGISTRATION_CLOSED')}>
                Cerrar inscripciones
              </button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => generateFixtureMutation.mutate()}
                disabled={generateFixtureMutation.isPending}
              >
                <Play className="w-4 h-4" />
                {generateFixtureMutation.isPending ? 'Generando...' : 'Generar fixture'}
              </button>
            </>
          )}
          {tournament.status === 'IN_PROGRESS' && (
            <button className="btn-primary flex items-center gap-2" onClick={() => updateStatusMutation.mutate('COMPLETED')}>
              <CheckCircle className="w-4 h-4" /> Finalizar torneo
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Inscriptos', value: totalRegistrations, icon: Users },
          { label: 'Categorías', value: tournament.categories?.length ?? 0, icon: Trophy },
          { label: 'Precio', value: tournament.price > 0 ? formatCLP(tournament.price) : 'Gratis', icon: Calendar },
          { label: 'Máx. jugadores', value: tournament.maxPlayers ?? '∞', icon: Users },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="card text-center py-5">
            <Icon className="w-5 h-5 text-brand-600 mx-auto mb-1.5" />
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {(['overview', 'registrations', 'matches'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'overview' ? 'Resumen' : tab === 'registrations' ? 'Inscripciones' : 'Partidos'}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Información general</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Formato</dt><dd className="font-medium">{tournament.format}</dd></div>
              {tournament.description && (
                <div><dt className="text-gray-500 mb-1">Descripción</dt><dd className="text-gray-700">{tournament.description}</dd></div>
              )}
              {tournament.registrationOpenDate && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Apertura inscripción</dt>
                  <dd className="font-medium">{format(new Date(tournament.registrationOpenDate), 'd MMM yyyy', { locale: es })}</dd>
                </div>
              )}
              {tournament.registrationCloseDate && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Cierre inscripción</dt>
                  <dd className="font-medium">{format(new Date(tournament.registrationCloseDate), 'd MMM yyyy', { locale: es })}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Categorías</h3>
            <div className="space-y-2">
              {tournament.categories?.map((cat: any) => (
                <div key={cat.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{cat.name}</p>
                    <p className="text-xs text-gray-500">
                      {cat.gender === 'MALE' ? 'Masculino' : cat.gender === 'FEMALE' ? 'Femenino' : 'Mixto'}
                      {cat.ageMin || cat.ageMax ? ` · ${cat.ageMin ?? ''}–${cat.ageMax ?? ''}` : ''}
                    </p>
                  </div>
                  <span className="badge-gray text-xs">{cat.registrations?.length ?? 0} inscriptos</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Registrations */}
      {activeTab === 'registrations' && (
        <div className="space-y-4">
          {tournament.categories?.map((cat: any) => (
            <div key={cat.id} className="card p-0 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50"
                onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
              >
                <div className="flex items-center gap-3">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  <span className="font-semibold text-gray-900">{cat.name}</span>
                  <span className="badge-gray text-xs">{cat.registrations?.length ?? 0} jugadores</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedCategory === cat.id ? 'rotate-180' : ''}`} />
              </button>

              {expandedCategory === cat.id && (
                <div className="border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
                        <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Fecha inscripción</th>
                        <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {cat.registrations?.map((reg: any) => (
                        <tr key={reg.id}>
                          <td className="px-5 py-2.5">
                            <p className="font-medium text-gray-900">
                              {reg.player?.playerProfile?.displayName ?? reg.player?.email}
                            </p>
                            <p className="text-xs text-gray-500">{reg.player?.email}</p>
                          </td>
                          <td className="px-5 py-2.5 text-gray-600">
                            {format(new Date(reg.registeredAt), 'd MMM yyyy', { locale: es })}
                          </td>
                          <td className="px-5 py-2.5">
                            <span className={reg.paymentStatus === 'PAID' ? 'badge-green' : 'badge-yellow'}>
                              {reg.paymentStatus === 'PAID' ? 'Pagado' : 'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(!cat.registrations || cat.registrations.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-5 py-6 text-center text-gray-400 text-sm">
                            Sin inscripciones aún
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Matches */}
      {activeTab === 'matches' && (
        <div className="space-y-3">
          {tournament.matches?.length === 0 || !tournament.matches ? (
            <div className="text-center py-16 text-gray-400">
              <Play className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay partidos generados. Genera el fixture primero.</p>
            </div>
          ) : (
            tournament.matches.map((match: any) => (
              <div key={match.id} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[100px]">
                      <p className="font-semibold text-gray-900">
                        {match.player1?.playerProfile?.displayName ?? match.player1?.email ?? 'TBD'}
                      </p>
                      <p className="text-xs text-gray-500">Jugador 1</p>
                    </div>
                    <span className="text-gray-400 font-bold">vs</span>
                    <div className="text-center min-w-[100px]">
                      <p className="font-semibold text-gray-900">
                        {match.player2?.playerProfile?.displayName ?? match.player2?.email ?? 'TBD'}
                      </p>
                      <p className="text-xs text-gray-500">Jugador 2</p>
                    </div>
                    {match.score && (
                      <span className="text-sm font-mono font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {match.score}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {match.scheduledTime && (
                      <span className="text-xs text-gray-500">
                        {format(new Date(match.scheduledTime), 'd MMM HH:mm', { locale: es })}
                      </span>
                    )}
                    <span className={
                      match.status === 'COMPLETED' ? 'badge-green' :
                      match.status === 'IN_PROGRESS' ? 'badge-yellow' :
                      'badge-gray'
                    }>
                      {MATCH_STATUS_LABELS[match.status] ?? match.status}
                    </span>
                    {match.status === 'SCHEDULED' && match.player1 && match.player2 && (
                      <button
                        className="btn-primary text-xs py-1 px-3"
                        onClick={() => setMatchResult({ matchId: match.id, winnerId: '', score: '' })}
                      >
                        Registrar resultado
                      </button>
                    )}
                  </div>
                </div>

                {matchResult?.matchId === match.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
                    <select
                      className="input-field flex-1"
                      value={matchResult.winnerId}
                      onChange={e => setMatchResult(r => r ? { ...r, winnerId: e.target.value } : r)}
                    >
                      <option value="">Seleccionar ganador</option>
                      <option value={match.player1Id}>
                        {match.player1?.playerProfile?.displayName ?? match.player1?.email}
                      </option>
                      <option value={match.player2Id}>
                        {match.player2?.playerProfile?.displayName ?? match.player2?.email}
                      </option>
                    </select>
                    <input
                      className="input-field flex-1"
                      placeholder="Marcador (ej: 6-4 7-5)"
                      value={matchResult.score}
                      onChange={e => setMatchResult(r => r ? { ...r, score: e.target.value } : r)}
                    />
                    <button
                      className="btn-primary whitespace-nowrap"
                      onClick={() => recordResultMutation.mutate(matchResult!)}
                      disabled={!matchResult.winnerId || recordResultMutation.isPending}
                    >
                      Guardar
                    </button>
                    <button className="btn-secondary" onClick={() => setMatchResult(null)}>Cancelar</button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
