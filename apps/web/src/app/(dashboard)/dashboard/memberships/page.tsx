'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Plus, UserCheck } from 'lucide-react';
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
  const { data: plans, isLoading } = useMembershipPlans(selectedClub?.id, { includeInactive: true });
  const { data: pendingRequests } = useQuery({
    queryKey: ['membership-requests', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/membership-requests?status=PENDING`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });
  const { data: roster } = useQuery({
    queryKey: ['club-roster', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/roster`);
      return data;
    },
    enabled: !!selectedClub?.id,
  });

  const [showPlanForm, setShowPlanForm] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    price: 0,
    billingPeriod: 'MONTHLY',
    benefits: '',
    paymentInstructions: '',
  });
  const [manualForm, setManualForm] = useState({
    planId: '',
    rosterId: '',
    firstName: '',
    lastName: '',
    rut: '',
    phone: '',
  });

  const filteredRoster = (() => {
    const rut = manualForm.rut.trim().toLowerCase();
    if (!rut) return roster ?? [];
    return (roster ?? []).filter((entry: any) =>
      entry.rut?.toLowerCase().includes(rut)
      || `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(rut),
    );
  })();

  const activePlans = plans?.filter((plan: any) => plan.active) ?? [];

  const invalidateMembershipData = () => {
    queryClient.invalidateQueries({ queryKey: ['membership-plans'] });
    queryClient.invalidateQueries({ queryKey: ['membership-requests', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['club-roster', selectedClub?.id] });
  };

  const createPlanMutation = useMutation({
    mutationFn: (data: any) => api.post(`/clubs/${selectedClub?.id}/membership-plans`, {
      ...data,
      benefits: data.benefits.split('\n').map((b: string) => b.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      invalidateMembershipData();
      toast.success('Plan creado');
      setShowPlanForm(false);
      setPlanForm({
        name: '',
        description: '',
        price: 0,
        billingPeriod: 'MONTHLY',
        benefits: '',
        paymentInstructions: '',
      });
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Error al crear plan'),
  });

  const togglePlanMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/membership-plans/${id}`, { active }),
    onSuccess: () => invalidateMembershipData(),
    onError: () => toast.error('No se pudo actualizar el plan'),
  });

  const manualAddMutation = useMutation({
    mutationFn: (payload: any) => api.post('/memberships', payload),
    onSuccess: () => {
      invalidateMembershipData();
      toast.success('Membresía asignada');
      setShowManualAdd(false);
      setManualForm({ planId: '', rosterId: '', firstName: '', lastName: '', rut: '', phone: '' });
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo asignar la membresía'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/membership-requests/${id}/approve`),
    onSuccess: () => {
      invalidateMembershipData();
      toast.success('Solicitud aprobada');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo aprobar la solicitud'),
  });

  const denyMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/membership-requests/${id}/deny`, { reason }),
    onSuccess: () => {
      invalidateMembershipData();
      toast.success('Solicitud rechazada');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo rechazar la solicitud'),
  });

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const submitManualAdd = () => {
    if (!selectedClub?.id || !manualForm.planId) {
      toast.error('Selecciona un plan');
      return;
    }

    if (!manualForm.rosterId && (!manualForm.firstName || !manualForm.lastName)) {
      toast.error('Completa nombre y apellido o selecciona un jugador del roster');
      return;
    }

    manualAddMutation.mutate({
      clubId: selectedClub.id,
      planId: manualForm.planId,
      rosterId: manualForm.rosterId || undefined,
      firstName: manualForm.rosterId ? undefined : manualForm.firstName,
      lastName: manualForm.rosterId ? undefined : manualForm.lastName,
      rut: manualForm.rut || undefined,
      phone: manualForm.phone || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Membresías</h1>
          <p className="text-sm text-gray-500">Gestiona solicitudes, planes y altas manuales ligadas al roster del club.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowManualAdd(true)}>Alta manual</button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowPlanForm(true)}>
            <Plus className="w-4 h-4" /> Nuevo plan
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Solicitudes pendientes</h2>
            <p className="text-sm text-gray-500">Aprobación o rechazo con notificación automática al jugador.</p>
          </div>
          <span className="badge-yellow">{pendingRequests?.length ?? 0} pendientes</span>
        </div>
        {!pendingRequests?.length ? (
          <p className="text-sm text-gray-400">No hay solicitudes pendientes.</p>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((request: any) => (
              <div key={request.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {request.requestedByUser?.playerProfile?.displayName ?? request.requestedByUser?.email}
                    </p>
                    <p className="text-sm text-gray-600">
                      {request.plan?.name} · {PERIOD_LABELS[request.plan?.billingPeriod] ?? request.plan?.billingPeriod}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {request.requestedByUser?.playerProfile?.rut ? `RUT ${request.requestedByUser.playerProfile.rut}` : 'Sin RUT vinculado'}
                    </p>
                    {request.resolvedPaymentInstructions && (
                      <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs text-gray-600 border border-gray-100">
                        Instrucciones: {request.resolvedPaymentInstructions}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-primary text-sm"
                      onClick={() => approveMutation.mutate(request.id)}
                      disabled={approveMutation.isPending}
                    >
                      Aprobar
                    </button>
                    <button
                      className="btn-secondary text-sm"
                      onClick={() => {
                        const reason = window.prompt('Motivo del rechazo');
                        if (!reason) return;
                        denyMutation.mutate({ id: request.id, reason });
                      }}
                      disabled={denyMutation.isPending}
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showManualAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Alta manual por roster</h2>
            <p className="mt-1 text-sm text-gray-500">
              Selecciona un jugador del roster existente por RUT o crea un registro nuevo para un socio sin app.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                <select
                  className="input-field"
                  value={manualForm.planId}
                  onChange={e => setManualForm(form => ({ ...form, planId: e.target.value }))}
                >
                  <option value="">Selecciona un plan</option>
                  {activePlans.map((plan: any) => (
                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar por RUT</label>
                <input
                  className="input-field"
                  value={manualForm.rut}
                  onChange={e => setManualForm(form => ({ ...form, rut: e.target.value, rosterId: '' }))}
                  placeholder="12.345.678-9"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  className="input-field"
                  value={manualForm.firstName}
                  onChange={e => setManualForm(form => ({ ...form, firstName: e.target.value, rosterId: '' }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
                <input
                  className="input-field"
                  value={manualForm.lastName}
                  onChange={e => setManualForm(form => ({ ...form, lastName: e.target.value, rosterId: '' }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input
                  className="input-field"
                  value={manualForm.phone}
                  onChange={e => setManualForm(form => ({ ...form, phone: e.target.value }))}
                />
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">Coincidencias de roster</p>
                <div className="mt-2 max-h-40 space-y-2 overflow-auto">
                  {!filteredRoster.length ? (
                    <p className="text-xs text-gray-400">Sin coincidencias. Se creará un roster nuevo con los datos del formulario.</p>
                  ) : filteredRoster.slice(0, 6).map((entry: any) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setManualForm(form => ({
                        ...form,
                        rosterId: entry.id,
                        firstName: entry.firstName,
                        lastName: entry.lastName,
                        rut: entry.rut ?? form.rut,
                        phone: entry.phone ?? '',
                      }))}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                        manualForm.rosterId === entry.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="font-medium text-gray-900">{entry.firstName} {entry.lastName}</div>
                      <div className="text-xs text-gray-500">
                        {entry.rut ?? 'Sin RUT'}{entry.linkedPlayerProfile ? ' · vinculado a app' : ' · sin cuenta'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button className="btn-primary flex-1" onClick={submitManualAdd} disabled={manualAddMutation.isPending}>
                {manualAddMutation.isPending ? 'Asignando...' : 'Asignar membresía'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowManualAdd(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showPlanForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuevo plan de membresía</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del plan</label>
                <input className="input-field" value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} placeholder="Socio Premium" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input className="input-field" value={planForm.description} onChange={e => setPlanForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio (CLP)</label>
                  <input type="number" className="input-field" value={planForm.price} onChange={e => setPlanForm(f => ({ ...f, price: +e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                  <select className="input-field" value={planForm.billingPeriod} onChange={e => setPlanForm(f => ({ ...f, billingPeriod: e.target.value }))}>
                    {Object.entries(PERIOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beneficios (uno por línea)</label>
                <textarea className="input-field" rows={4} value={planForm.benefits} onChange={e => setPlanForm(f => ({ ...f, benefits: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instrucciones de pago</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={planForm.paymentInstructions}
                  placeholder="Transferir a Cuenta Corriente..."
                  onChange={e => setPlanForm(f => ({ ...f, paymentInstructions: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button className="btn-primary flex-1" onClick={() => createPlanMutation.mutate(planForm)} disabled={!planForm.name || createPlanMutation.isPending}>
                {createPlanMutation.isPending ? 'Guardando...' : 'Crear plan'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowPlanForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-52 animate-pulse bg-gray-100" />)
          : plans?.map((plan: any) => (
              <div key={plan.id} className={`card transition-shadow hover:shadow-md ${!plan.active ? 'opacity-60' : ''}`}>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-xs text-gray-500">{PERIOD_LABELS[plan.billingPeriod]}</p>
                  </div>
                  <span className={plan.active ? 'badge-green' : 'badge-gray'}>
                    {plan.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {plan.description && <p className="mb-3 text-sm text-gray-600">{plan.description}</p>}

                <div className="mb-4 text-2xl font-bold text-brand-600">
                  {plan.price === 0 ? 'Gratis' : formatCLP(plan.price)}
                  <span className="text-sm font-normal text-gray-400">/{PERIOD_LABELS[plan.billingPeriod]?.toLowerCase()}</span>
                </div>

                {plan.benefits?.length > 0 && (
                  <ul className="mb-4 space-y-1.5">
                    {plan.benefits.map((benefit: string, index: number) => (
                      <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="h-4 w-4 flex-shrink-0 text-brand-500" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                  <p className="font-semibold text-gray-700">Pago</p>
                  <p className="mt-1 whitespace-pre-line">
                    {plan.resolvedPaymentInstructions ?? 'Usa la instrucción por defecto del club o completa este campo.'}
                  </p>
                </div>

                <div className="mt-4 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => togglePlanMutation.mutate({ id: plan.id, active: !plan.active })}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    {plan.active ? 'Desactivar plan' : 'Activar plan'}
                  </button>
                </div>
              </div>
            ))}
      </div>

      {!isLoading && (!plans || plans.length === 0) && (
        <div className="py-16 text-center text-gray-400">
          <UserCheck className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">No hay planes de membresía</p>
          <button className="btn-primary mt-4" onClick={() => setShowPlanForm(true)}>Crear primer plan</button>
        </div>
      )}
    </div>
  );
}
