'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Trophy, Users, Calendar, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useClubStore } from '@/stores/club.store';
import { useTournaments } from '@/hooks/use-club';
import { classifyLabel, classifyRoster, type RosterLike } from '@/components/tournaments/player-type';
import api from '@/lib/api';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Borrador', color: 'badge-gray' },
  REGISTRATION_OPEN: { label: 'Inscripción abierta', color: 'badge-green' },
  REGISTRATION_CLOSED: { label: 'Inscripción cerrada', color: 'badge-yellow' },
  IN_PROGRESS: { label: 'En curso', color: 'badge-yellow' },
  COMPLETED: { label: 'Finalizado', color: 'badge-gray' },
  CANCELLED: { label: 'Cancelado', color: 'badge-red' },
};

const FORMAT_LABELS: Record<string, string> = {
  SINGLE_ELIMINATION: 'Eliminación directa',
  ROUND_ROBIN: 'Todos contra todos',
  DOUBLES: 'Dobles',
  MIXED: 'Mixto',
  LEAGUE: 'Liga',
};

const STATUS_FILTERS: Array<{ id: 'ALL' | 'REGISTRATION_OPEN' | 'IN_PROGRESS' | 'COMPLETED'; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'REGISTRATION_OPEN', label: 'Inscripción abierta' },
  { id: 'IN_PROGRESS', label: 'En curso' },
  { id: 'COMPLETED', label: 'Finalizados' },
];

export default function TournamentsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const { data: tournaments, isLoading } = useTournaments(selectedClub?.id);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REGISTRATION_OPEN' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [form, setForm] = useState({
    name: '', description: '', startDate: '', endDate: '',
    registrationOpenDate: '', registrationCloseDate: '',
    format: 'SINGLE_ELIMINATION', price: 0, maxPlayers: 16,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(`/clubs/${selectedClub?.id}/tournaments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      toast.success('Torneo creado');
      setShowForm(false);
    },
    onError: () => toast.error('Error al crear torneo'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/tournaments/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
  });

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const filtered = useMemo(() => {
    if (!tournaments) return [];
    if (statusFilter === 'ALL') return tournaments;
    return tournaments.filter((t: any) => t.status === statusFilter);
  }, [tournaments, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Torneos</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Crear torneo
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === f.id
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl my-4">
            <h2 className="text-lg font-semibold mb-4">Nuevo torneo</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inicio</label>
                  <input type="date" className="input-field" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fin</label>
                  <input type="date" className="input-field" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Apertura inscripción</label>
                  <input type="date" className="input-field" value={form.registrationOpenDate} onChange={e => setForm(f => ({ ...f, registrationOpenDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cierre inscripción</label>
                  <input type="date" className="input-field" value={form.registrationCloseDate} onChange={e => setForm(f => ({ ...f, registrationCloseDate: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Formato</label>
                  <select className="input-field" value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}>
                    {Object.entries(FORMAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio inscripción (CLP)</label>
                  <input type="number" className="input-field" value={form.price} onChange={e => setForm(f => ({ ...f, price: +e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-primary flex-1" onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending}>
                {createMutation.isPending ? 'Guardando...' : 'Crear torneo'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-48 animate-pulse bg-gray-100" />)
          : filtered.map((t: any) => <TournamentCard key={t.id} tournament={t} />)}
      </div>

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {statusFilter === 'ALL'
              ? 'No hay torneos registrados'
              : `No hay torneos con estado "${STATUS_FILTERS.find(f => f.id === statusFilter)?.label}"`}
          </p>
          {statusFilter === 'ALL' && (
            <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Crear primer torneo</button>
          )}
        </div>
      )}
    </div>
  );
}

function TournamentCard({ tournament: t }: { tournament: any }) {
  const queryClient = useQueryClient();
  const statusCfg = STATUS_LABELS[t.status] ?? { label: t.status, color: 'badge-gray' };
  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  // Fetch this tournament's detail to compute the SOCIO/CASUAL/EXTERNO counts
  // for the player-type chips. We don't have roster data in the list endpoint.
  const { data: detail } = useQuery({
    queryKey: ['tournament', t.id, 'typecounts'],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${t.id}`);
      return data;
    },
    staleTime: 60_000,
  });

  const counts = useMemo(() => {
    const c = { SOCIO: 0, CASUAL: 0, EXTERNO: 0, SIN_VINCULAR: 0 };
    if (!detail) return c;
    const regs = (detail.categories ?? []).flatMap((cat: any) => cat.registrations ?? []);
    for (const reg of regs) {
      if (reg.team) {
        c[classifyRoster(reg.team.player1Roster).type] += 1;
        c[classifyRoster(reg.team.player2Roster).type] += 1;
      } else if (reg.roster) {
        c[classifyRoster(reg.roster).type] += 1;
      }
    }
    return c;
  }, [detail]);

  const total = counts.SOCIO + counts.CASUAL + counts.EXTERNO + counts.SIN_VINCULAR;

  const updateStatus = (status: string) => {
    api.patch(`/tournaments/${t.id}`, { status }).then(() =>
      queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
    );
  };

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center">
            <Trophy className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{t.name}</h3>
            <p className="text-xs text-gray-500">{FORMAT_LABELS[t.format] ?? t.format}</p>
          </div>
        </div>
        <span className={statusCfg.color}>{statusCfg.label}</span>
      </div>

      <div className="space-y-1.5 text-sm text-gray-600 mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
          {format(new Date(t.startDate), 'd MMM', { locale: es })} – {format(new Date(t.endDate), 'd MMM yyyy', { locale: es })}
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-gray-400" />
          {t._count?.registrations ?? 0} inscriptos {t.maxPlayers ? `/ ${t.maxPlayers}` : ''}
        </div>
        {t.price > 0 && <p className="text-brand-600 font-medium">{formatCLP(t.price)} inscripción</p>}
      </div>

      {/* Player-type chips */}
      {total > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 pt-3 border-t border-gray-100">
          {counts.SOCIO > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 ring-1 ring-green-200">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {counts.SOCIO} socio{counts.SOCIO === 1 ? '' : 's'}
            </span>
          )}
          {counts.CASUAL > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-semibold text-yellow-700 ring-1 ring-yellow-200">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {counts.CASUAL} casual{counts.CASUAL === 1 ? '' : 's'}
            </span>
          )}
          {counts.EXTERNO > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {counts.EXTERNO} externo{counts.EXTERNO === 1 ? '' : 's'}
            </span>
          )}
          {counts.SIN_VINCULAR > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {counts.SIN_VINCULAR} sin vincular
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-gray-100">
        <Link href={`/dashboard/tournaments/${t.id}`} className="text-xs text-brand-600 hover:underline">
          Ver detalle →
        </Link>
        {t.status === 'IN_PROGRESS' && (
          <Link
            href={`/dashboard/tournaments/${t.id}?tab=cuadro`}
            className="text-xs text-purple-600 hover:underline inline-flex items-center gap-1"
          >
            <LayoutGrid className="w-3 h-3" /> Ver cuadro
          </Link>
        )}
        <div className="ml-auto flex gap-2">
          {t.status === 'DRAFT' && (
            <button
              onClick={() => updateStatus('REGISTRATION_OPEN')}
              className="text-xs text-green-600 hover:underline"
            >
              Abrir inscripciones
            </button>
          )}
          {t.status === 'REGISTRATION_OPEN' && (
            <button
              onClick={() => api.post(`/tournaments/${t.id}/generate-fixture`).then(() =>
                queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
              )}
              className="text-xs text-blue-600 hover:underline"
            >
              Generar fixture
            </button>
          )}
        </div>
      </div>
    </div>
  );
}