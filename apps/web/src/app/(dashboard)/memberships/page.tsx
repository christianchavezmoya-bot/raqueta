'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCheck, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useClubStore } from '@/stores/club.store';
import { useMembershipPlans } from '@/hooks/use-club';
import api from '@/lib/api';

const PERIOD_LABELS: Record<string, string> = {
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  ANNUAL: 'Anual',
  LIFETIME: 'Vitalicia',
};

export default function MembershipsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const { data: plans, isLoading } = useMembershipPlans(selectedClub?.id);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', price: 0,
    billingPeriod: 'MONTHLY', benefits: '',
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(`/clubs/${selectedClub?.id}/membership-plans`, {
      ...data,
      benefits: data.benefits.split('\n').map((b: string) => b.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-plans'] });
      toast.success('Plan creado');
      setShowForm(false);
    },
    onError: () => toast.error('Error al crear plan'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/membership-plans/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['membership-plans'] }),
  });

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Membresías</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Nuevo plan
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-semibold mb-4">Nuevo plan de membresía</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del plan</label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Socio Premium" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio (CLP)</label>
                  <input type="number" className="input-field" value={form.price} onChange={e => setForm(f => ({ ...f, price: +e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                  <select className="input-field" value={form.billingPeriod} onChange={e => setForm(f => ({ ...f, billingPeriod: e.target.value }))}>
                    {Object.entries(PERIOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beneficios (uno por línea)</label>
                <textarea className="input-field" rows={4} value={form.benefits}
                  placeholder="Tarifa de socio en canchas&#10;2 clases grupales por mes&#10;Acceso a torneos"
                  onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-primary flex-1" onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending}>
                {createMutation.isPending ? 'Guardando...' : 'Crear plan'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-52 animate-pulse bg-gray-100" />)
          : plans?.map((plan: any) => (
              <div key={plan.id} className={`card hover:shadow-md transition-shadow ${!plan.active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{plan.name}</h3>
                    <p className="text-xs text-gray-500">{PERIOD_LABELS[plan.billingPeriod]}</p>
                  </div>
                  <span className={plan.active ? 'badge-green' : 'badge-gray'}>
                    {plan.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {plan.description && <p className="text-sm text-gray-600 mb-3">{plan.description}</p>}

                <div className="text-2xl font-bold text-brand-600 mb-4">
                  {plan.price === 0 ? 'Gratis' : formatCLP(plan.price)}
                  <span className="text-sm font-normal text-gray-400">/{PERIOD_LABELS[plan.billingPeriod]?.toLowerCase()}</span>
                </div>

                {plan.benefits?.length > 0 && (
                  <ul className="space-y-1.5 mb-4">
                    {plan.benefits.map((b: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-brand-500 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="pt-3 border-t border-gray-100">
                  <button
                    onClick={() => toggleMutation.mutate({ id: plan.id, active: !plan.active })}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    {plan.active ? 'Desactivar plan' : 'Activar plan'}
                  </button>
                </div>
              </div>
            ))}
      </div>

      {!isLoading && (!plans || plans.length === 0) && (
        <div className="text-center py-16 text-gray-400">
          <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay planes de membresía</p>
          <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Crear primer plan</button>
        </div>
      )}
    </div>
  );
}
