'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  CreditCard,
  Plus,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useClubStore } from '@/stores/club.store';
import { useAuthStore } from '@/stores/auth.store';
import { useMembershipPlans } from '@/hooks/use-club';
import api from '@/lib/api';

const PERIOD_LABELS: Record<string, string> = {
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  ANNUAL: 'Anual',
  LIFETIME: 'Vitalicia',
};

type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED' | 'PENDING' | null;
type BillingPeriod = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'LIFETIME' | null;

type CurrentMembership = {
  id: string;
  planId: string;
  planName: string | null;
  billingPeriod: BillingPeriod;
  status: Exclude<MembershipStatus, null>;
  startDate: string;
  endDate: string | null;
  lastPaymentDate: string | null;
  nextPaymentDue: string | null;
  paymentNotes: string | null;
} | null;

type RosterEntry = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  rut: string | null;
  phone: string | null;
  linked: boolean;
  live: {
    email: string | null;
    phone: string | null;
    displayName: string | null;
  } | null;
  membershipStatus: MembershipStatus;
  currentMembership: CurrentMembership;
  pendingMembershipRequest: {
    id: string;
    planName: string | null;
  } | null;
};

export default function MembershipsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const { data: plans, isLoading } = useMembershipPlans(selectedClub?.id, { includeInactive: true });

  const { data: pendingRequests } = useQuery({
    queryKey: ['membership-requests', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/membership-requests?status=PENDING`);
      return data as any[];
    },
    enabled: !!selectedClub?.id,
  });

  const { data: roster } = useQuery({
    queryKey: ['club-roster', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/roster`);
      return data as RosterEntry[];
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

  const filteredRoster = useMemo(() => {
    const needle = manualForm.rut.trim().toLowerCase();
    if (!needle) return roster ?? [];
    return (roster ?? []).filter(entry =>
      entry.rut?.toLowerCase().includes(needle)
      || `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(needle),
    );
  }, [manualForm.rut, roster]);

  const activePlans = plans?.filter((plan: any) => plan.active) ?? [];
  const membersWithMembership = useMemo(
    () => (roster ?? []).filter(entry => entry.currentMembership),
    [roster],
  );

  const paymentRows = useMemo(
    () => membersWithMembership
      .filter(entry => {
        const status = entry.currentMembership?.status;
        return status === 'ACTIVE' || status === 'SUSPENDED';
      })
      .sort((left, right) => dueDateSort(left.currentMembership?.nextPaymentDue, right.currentMembership?.nextPaymentDue)),
    [membersWithMembership],
  );

  const statusRows = useMemo(
    () => membersWithMembership.sort((left, right) => {
      const leftStatus = membershipPriority(left.currentMembership?.status ?? null);
      const rightStatus = membershipPriority(right.currentMembership?.status ?? null);
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      return left.fullName.localeCompare(right.fullName, 'es');
    }),
    [membersWithMembership],
  );

  const invalidateMembershipData = () => {
    queryClient.invalidateQueries({ queryKey: ['membership-plans'] });
    queryClient.invalidateQueries({ queryKey: ['membership-requests', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['club-roster', selectedClub?.id] });
  };

  const createPlanMutation = useMutation({
    mutationFn: (data: any) => api.post(`/clubs/${selectedClub?.id}/membership-plans`, {
      ...data,
      benefits: data.benefits.split('\n').map((benefit: string) => benefit.trim()).filter(Boolean),
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

  const membershipMutation = useMutation({
    mutationFn: ({ membershipId, payload }: { membershipId: string; payload: Record<string, unknown> }) =>
      api.patch(`/memberships/${membershipId}`, payload),
    onSuccess: () => invalidateMembershipData(),
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo actualizar la membresía'),
  });

  const formatCLP = (value: number) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(value);

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

  const updateMembershipStatus = (
    entry: RosterEntry,
    nextStatus: 'SUSPENDED' | 'ACTIVE' | 'CANCELLED',
    options?: { reason?: string },
  ) => {
    const membership = entry.currentMembership;
    if (!membership) {
      toast.error('Este jugador no tiene una membresía editable');
      return;
    }

    if (nextStatus === 'SUSPENDED') {
      const reason = options?.reason ?? window.prompt('Motivo de la suspensión');
      if (!reason?.trim()) return;
      membershipMutation.mutate(
        {
          membershipId: membership.id,
          payload: {
            status: 'SUSPENDED',
            statusReason: reason.trim(),
          },
        },
        { onSuccess: () => toast.success('Membresía suspendida') },
      );
      return;
    }

    if (nextStatus === 'CANCELLED') {
      if (!window.confirm('¿Cancelar esta membresía de forma permanente?')) return;
      membershipMutation.mutate(
        {
          membershipId: membership.id,
          payload: { status: 'CANCELLED' },
        },
        { onSuccess: () => toast.success('Membresía cancelada') },
      );
      return;
    }

    membershipMutation.mutate(
      {
        membershipId: membership.id,
        payload: { status: 'ACTIVE' },
      },
      { onSuccess: () => toast.success('Membresía reactivada') },
    );
  };

  const markAsPaid = (entry: RosterEntry) => {
    const membership = entry.currentMembership;
    if (!membership) return;
    membershipMutation.mutate(
      {
        membershipId: membership.id,
        payload: { markPaid: true },
      },
      { onSuccess: () => toast.success('Pago registrado') },
    );
  };

  const isClubAdmin = user?.role === 'CLUB_ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Membresías</h1>
          <p className="text-sm text-gray-500">Gestiona solicitudes, estado de pago y altas manuales ligadas al roster del club.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowManualAdd(true)}>Alta manual</button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowPlanForm(true)}>
            <Plus className="h-4 w-4" />
            Nuevo plan
          </button>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
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
            {pendingRequests.map(request => (
              <div key={request.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {request.requestedByUser?.playerProfile?.displayName ?? request.requestedByUser?.email}
                    </p>
                    <p className="text-sm text-gray-600">
                      {request.plan?.name} · {PERIOD_LABELS[request.plan?.billingPeriod] ?? request.plan?.billingPeriod}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {request.requestedByUser?.playerProfile?.rut
                        ? `RUT ${request.requestedByUser.playerProfile.rut}`
                        : 'Sin RUT vinculado'}
                    </p>
                    {request.resolvedPaymentInstructions && (
                      <p className="mt-2 rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs text-gray-600">
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

      <section className="card">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <CreditCard className="h-5 w-5 text-brand-600" />
              Estado de pago
            </h2>
            <p className="text-sm text-gray-500">Socios activos ordenados por próximo vencimiento.</p>
          </div>
          <div className="flex gap-2 text-xs text-gray-500">
            <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">Al día</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Vence pronto</span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">En mora</span>
          </div>
        </div>
        {!paymentRows.length ? (
          <p className="text-sm text-gray-400">No hay miembros activos para seguimiento de pagos.</p>
        ) : (
          <div className="space-y-3">
            {paymentRows.map(entry => {
              const membership = entry.currentMembership!;
              const tone = paymentTone(membership);
              return (
                <div key={membership.id} className={`rounded-2xl border p-4 ${tone.card}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{entry.fullName}</p>
                        <span className={tone.badge}>{tone.label}</span>
                        <span className="badge-gray">{membership.planName ?? 'Plan sin nombre'}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        Último pago: {formatDateOrDash(membership.lastPaymentDate)}
                        {' · '}
                        Próximo vencimiento: {formatDateOrDash(membership.nextPaymentDue)}
                      </p>
                      {membership.paymentNotes && (
                        <p className="mt-2 text-xs text-gray-600">Notas: {membership.paymentNotes}</p>
                      )}
                      {!entry.linked && (
                        <p className="mt-2 text-xs text-amber-700">
                          Este jugador no tiene cuenta en la app — notificación manual requerida: {entry.fullName}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary text-sm" onClick={() => markAsPaid(entry)}>
                        Marcar como pagado
                      </button>
                      {tone.label === 'En mora' && membership.status === 'ACTIVE' && (
                        <button
                          className="btn-primary text-sm"
                          onClick={() => updateMembershipStatus(entry, 'SUSPENDED', { reason: 'Morosidad — cuota impaga' })}
                        >
                          Suspender por mora
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <ShieldAlert className="h-5 w-5 text-brand-600" />
            Control de membresías
          </h2>
          <p className="text-sm text-gray-500">Suspender, reactivar o cancelar según el estado actual.</p>
        </div>
        {!statusRows.length ? (
          <p className="text-sm text-gray-400">Aún no hay membresías asignadas.</p>
        ) : (
          <div className="space-y-3">
            {statusRows.map(entry => {
              const membership = entry.currentMembership!;
              return (
                <div key={membership.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{entry.fullName}</p>
                        <span className={statusBadgeClass(membership.status)}>{statusLabel(membership.status)}</span>
                        <span className="badge-gray">{membership.planName ?? 'Plan sin nombre'}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        Inicio: {formatDateOrDash(membership.startDate)}
                        {' · '}
                        Próximo pago: {formatDateOrDash(membership.nextPaymentDue)}
                      </p>
                      {membership.paymentNotes && (
                        <p className="mt-2 text-xs text-gray-600">Notas: {membership.paymentNotes}</p>
                      )}
                      {!entry.linked && (
                        <p className="mt-2 text-xs text-amber-700">
                          Este jugador no tiene cuenta en la app — notificación manual requerida: {entry.fullName}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {membership.status === 'ACTIVE' && (
                        <>
                          <button className="btn-secondary text-sm" onClick={() => updateMembershipStatus(entry, 'SUSPENDED')}>
                            Suspender
                          </button>
                          <button className="btn-secondary text-sm" onClick={() => updateMembershipStatus(entry, 'CANCELLED')}>
                            Cancelar membresía
                          </button>
                        </>
                      )}
                      {membership.status === 'SUSPENDED' && (
                        <>
                          <button className="btn-primary text-sm" onClick={() => updateMembershipStatus(entry, 'ACTIVE')}>
                            Reactivar
                          </button>
                          <button className="btn-secondary text-sm" onClick={() => updateMembershipStatus(entry, 'CANCELLED')}>
                            Cancelar membresía
                          </button>
                        </>
                      )}
                      {membership.status === 'CANCELLED' && isClubAdmin && (
                        <button className="btn-primary text-sm" onClick={() => updateMembershipStatus(entry, 'ACTIVE')}>
                          Reactivar
                        </button>
                      )}
                      {membership.status === 'CANCELLED' && !isClubAdmin && (
                        <p className="text-xs text-gray-500">Solo un CLUB_ADMIN puede reactivar una cancelación.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showManualAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Alta manual por roster</h2>
            <p className="mt-1 text-sm text-gray-500">
              Selecciona un jugador del roster existente por RUT o crea un registro nuevo para un socio sin app.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Plan</label>
                <select
                  className="input-field"
                  value={manualForm.planId}
                  onChange={event => setManualForm(form => ({ ...form, planId: event.target.value }))}
                >
                  <option value="">Selecciona un plan</option>
                  {activePlans.map((plan: any) => (
                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar por RUT</label>
                <input
                  className="input-field"
                  value={manualForm.rut}
                  onChange={event => setManualForm(form => ({ ...form, rut: event.target.value, rosterId: '' }))}
                  placeholder="12.345.678-9"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nombre</label>
                <input
                  className="input-field"
                  value={manualForm.firstName}
                  onChange={event => setManualForm(form => ({ ...form, firstName: event.target.value, rosterId: '' }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Apellido</label>
                <input
                  className="input-field"
                  value={manualForm.lastName}
                  onChange={event => setManualForm(form => ({ ...form, lastName: event.target.value, rosterId: '' }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
                <input
                  className="input-field"
                  value={manualForm.phone}
                  onChange={event => setManualForm(form => ({ ...form, phone: event.target.value }))}
                />
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-900">Coincidencias de roster</p>
                <div className="mt-2 max-h-40 space-y-2 overflow-auto">
                  {!filteredRoster.length ? (
                    <p className="text-xs text-gray-400">Sin coincidencias. Se creará un roster nuevo con los datos del formulario.</p>
                  ) : filteredRoster.slice(0, 6).map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setManualForm(form => ({
                        ...form,
                        rosterId: entry.id,
                        firstName: entry.firstName,
                        lastName: entry.lastName,
                        rut: entry.rut ?? form.rut,
                        phone: entry.live?.phone ?? entry.phone ?? '',
                      }))}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                        manualForm.rosterId === entry.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="font-medium text-gray-900">{entry.firstName} {entry.lastName}</div>
                      <div className="text-xs text-gray-500">
                        {entry.rut ?? 'Sin RUT'}{entry.linked ? ' · vinculado a app' : ' · sin cuenta'}
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
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Nuevo plan de membresía</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nombre del plan</label>
                <input className="input-field" value={planForm.name} onChange={event => setPlanForm(form => ({ ...form, name: event.target.value }))} placeholder="Socio Premium" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
                <input className="input-field" value={planForm.description} onChange={event => setPlanForm(form => ({ ...form, description: event.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Precio (CLP)</label>
                  <input type="number" className="input-field" value={planForm.price} onChange={event => setPlanForm(form => ({ ...form, price: +event.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Período</label>
                  <select className="input-field" value={planForm.billingPeriod} onChange={event => setPlanForm(form => ({ ...form, billingPeriod: event.target.value }))}>
                    {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Beneficios (uno por línea)</label>
                <textarea className="input-field" rows={4} value={planForm.benefits} onChange={event => setPlanForm(form => ({ ...form, benefits: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Instrucciones de pago</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={planForm.paymentInstructions}
                  placeholder="Transferir a Cuenta Corriente..."
                  onChange={event => setPlanForm(form => ({ ...form, paymentInstructions: event.target.value }))}
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
          ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="card h-52 animate-pulse bg-gray-100" />)
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

function formatDateOrDash(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CL');
}

function dueDateSort(left: string | null | undefined, right: string | null | undefined) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return new Date(left).getTime() - new Date(right).getTime();
}

function membershipPriority(status: MembershipStatus) {
  if (status === 'ACTIVE') return 0;
  if (status === 'SUSPENDED') return 1;
  if (status === 'PENDING') return 2;
  if (status === 'EXPIRED') return 3;
  if (status === 'CANCELLED') return 4;
  return 5;
}

function statusBadgeClass(status: MembershipStatus) {
  if (status === 'ACTIVE') return 'badge-green';
  if (status === 'SUSPENDED') return 'badge-red';
  if (status === 'PENDING') return 'badge-yellow';
  return 'badge-gray';
}

function statusLabel(status: MembershipStatus) {
  if (status === 'ACTIVE') return 'Activa';
  if (status === 'SUSPENDED') return 'Suspendida';
  if (status === 'PENDING') return 'Pendiente';
  if (status === 'EXPIRED') return 'Expirada';
  if (status === 'CANCELLED') return 'Cancelada';
  return 'Sin membresía';
}

function paymentTone(membership: NonNullable<CurrentMembership>) {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const inSevenDays = new Date(today);
  inSevenDays.setDate(today.getDate() + 7);

  const lastPayment = membership.lastPaymentDate ? new Date(membership.lastPaymentDate) : null;
  const nextDue = membership.nextPaymentDue ? new Date(membership.nextPaymentDue) : null;
  const paidRecently = !!lastPayment && lastPayment >= sevenDaysAgo;
  const overdue = !!nextDue && nextDue < today && !paidRecently;
  const dueSoon = !!nextDue && nextDue >= today && nextDue <= inSevenDays;

  if (overdue) {
    return {
      label: 'En mora',
      card: 'border-red-200 bg-red-50/70',
      badge: 'rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700',
    };
  }
  if (dueSoon) {
    return {
      label: 'Vence pronto',
      card: 'border-amber-200 bg-amber-50/70',
      badge: 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700',
    };
  }
  return {
    label: paidRecently ? 'Pagado reciente' : 'Al día',
    card: 'border-green-200 bg-green-50/70',
    badge: 'rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700',
  };
}
