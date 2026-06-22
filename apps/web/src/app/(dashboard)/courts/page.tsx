'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, MapPin, Sun, Zap, Power } from 'lucide-react';
import { toast } from 'sonner';
import { useClubStore } from '@/stores/club.store';
import { useCourts } from '@/hooks/use-club';
import api from '@/lib/api';

const SURFACES: Record<string, string> = {
  CLAY: 'Arcilla',
  HARD: 'Dura',
  GRASS: 'Césped',
  SYNTHETIC: 'Sintética',
  CARPET: 'Alfombra',
  INDOOR_HARD: 'Dura interior',
};

export default function CourtsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const { data: courts, isLoading } = useCourts(selectedClub?.id);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    surfaceType: 'CLAY',
    indoor: false,
    lighting: false,
    description: '',
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(`/clubs/${selectedClub?.id}/courts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courts', selectedClub?.id] });
      toast.success('Cancha creada');
      setShowForm(false);
      setForm({ name: '', surfaceType: 'CLAY', indoor: false, lighting: false, description: '' });
    },
    onError: () => toast.error('Error al crear la cancha'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/courts/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['courts', selectedClub?.id] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Canchas</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Agregar cancha
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-semibold mb-4">Nueva cancha</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  className="input-field"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Cancha 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Superficie</label>
                <select
                  className="input-field"
                  value={form.surfaceType}
                  onChange={e => setForm(f => ({ ...f, surfaceType: e.target.value }))}
                >
                  {Object.entries(SURFACES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.indoor} onChange={e => setForm(f => ({ ...f, indoor: e.target.checked }))} className="rounded" />
                  Cubierta
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.lighting} onChange={e => setForm(f => ({ ...f, lighting: e.target.checked }))} className="rounded" />
                  Iluminación
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                className="btn-primary flex-1"
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || createMutation.isPending}
              >
                {createMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Courts list */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card h-48 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courts?.map((court: any) => (
            <div key={court.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{court.name}</h3>
                    <p className="text-xs text-gray-500">{SURFACES[court.surfaceType] ?? court.surfaceType}</p>
                  </div>
                </div>
                <span className={court.active ? 'badge-green' : 'badge-gray'}>
                  {court.active ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              <div className="flex items-center gap-3 mb-4 text-sm text-gray-500">
                {court.indoor && <span className="flex items-center gap-1"><Sun className="w-3.5 h-3.5" /> Cubierta</span>}
                {court.lighting && <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Iluminación</span>}
              </div>

              {court.pricing.length > 0 && (
                <div className="space-y-1 mb-4">
                  {court.pricing.map((p: any) => (
                    <div key={p.id} className="flex justify-between text-sm">
                      <span className="text-gray-500">{p.userType === 'MEMBER' ? 'Socio' : 'Casual'}</span>
                      <span className="font-medium">
                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(p.price)}/hr
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => toggleMutation.mutate({ id: court.id, active: !court.active })}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <Power className="w-3.5 h-3.5" />
                  {court.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {courts?.length === 0 && !isLoading && (
        <div className="text-center py-16 text-gray-400">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay canchas registradas.</p>
          <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Agregar primera cancha</button>
        </div>
      )}
    </div>
  );
}
