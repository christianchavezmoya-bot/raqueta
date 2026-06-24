'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Trophy, Users, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useClubStore } from '@/stores/club.store';
import { useTournaments } from '@/hooks/use-club';
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

export default function TournamentsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const { data: tournaments, isLoading } = useTournaments(selectedClub?.id);
  const [showForm, setShowForm] = useState(false);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Torneos</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Crear torneo
        </button>
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
          : tournaments?.map((t: any) => {
              const statusCfg = STATUS_LABELS[t.status] ?? { label: t.status, color: 'badge-gray' };
              return (
                <div key={t.id} className="card hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{t.name}</h3>
                        <p className="text-xs text-gray-500">{FORMAT_LABELS[t.format]}</p>
                      </div>
                    </div>
                    <span className={statusCfg.color}>{statusCfg.label}</span>
                  </div>

                  <div className="space-y-1.5 text-sm text-gray-600 mb-4">
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

                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    <Link href={`/dashboard/tournaments/${t.id}`} className="text-xs text-brand-600 hover:underline">
                      Ver detalle →
                    </Link>
                    {t.status === 'DRAFT' && (
                      <button
                        onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'REGISTRATION_OPEN' })}
                        className="text-xs text-green-600 hover:underline ml-auto"
                      >
                        Abrir inscripciones
                      </button>
                    )}
                    {t.status === 'REGISTRATION_OPEN' && (
                      <button
                        onClick={() => api.post(`/tournaments/${t.id}/generate-fixture`).then(() => queryClient.invalidateQueries({ queryKey: ['tournaments'] }))}
                        className="text-xs text-blue-600 hover:underline ml-auto"
                      >
                        Generar fixture
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
      </div>

      {!isLoading && (!tournaments || tournaments.length === 0) && (
        <div className="text-center py-16 text-gray-400">
          <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay torneos registrados</p>
          <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Crear primer torneo</button>
        </div>
      )}
    </div>
  );
}
