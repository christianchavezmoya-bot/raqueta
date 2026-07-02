'use client';

import { useMemo, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowUpDown,
  Building2,
  Download,
  FileSpreadsheet,
  Filter,
  Link as LinkIcon,
  RefreshCcw,
  Save,
  Search,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/api';

type ImportedContact = {
  phone: string | null;
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  city: string | null;
};

type LiveProfile = {
  playerProfileId: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  profilePhotoUrl: string | null;
} | null;

type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED' | 'PENDING' | null;
type BillingPeriod = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'LIFETIME' | null;

type MembershipSnapshot = {
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

type PendingMembershipRequest = {
  id: string;
  status: 'PENDING';
  requestedAt: string;
  planId: string | null;
  planName: string | null;
  billingPeriod: BillingPeriod;
} | null;

type RosterEntry = {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string | null;
  rut: string | null;
  phone: string | null;
  division: string | null;
  deletedAt: string | null;
  archived: boolean;
  membershipStatus: MembershipStatus;
  currentMembership: MembershipSnapshot;
  pendingMembershipRequest: PendingMembershipRequest;
  imported: ImportedContact;
  live: LiveProfile;
  linked: boolean;
};

type EditDraft = {
  firstName: string;
  lastName: string;
  rut: string;
  division: string;
  dateOfBirth: string;
  phone: string;
};

type ImportSummary = {
  created: number;
  updated: number;
  errors: Array<{ row: number; reason: string }>;
};

type SortKey = 'name' | 'rut' | 'dateOfBirth' | 'division';
type SortDirection = 'asc' | 'desc';
type MembershipFilter = 'all' | 'ACTIVE' | 'SUSPENDED' | 'NONE' | 'PENDING';

const STAFF_ROLES = new Set(['SUPER_ADMIN', 'CLUB_ADMIN', 'MANAGER']);
const ARCHIVE_LINKED_WARNING =
  'Este jugador tiene cuenta en la app. Será archivado del club pero mantendrá su cuenta.';

const canManage = (role: string | undefined) => !!role && STAFF_ROLES.has(role);

export default function PlayersPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [linkedFilter, setLinkedFilter] = useState<'all' | 'linked' | 'paper'>('all');
  const [membershipFilter, setMembershipFilter] = useState<MembershipFilter>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showImportSummary, setShowImportSummary] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditDraft>({
    firstName: '',
    lastName: '',
    rut: '',
    division: '',
    dateOfBirth: '',
    phone: '',
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    firstName: '',
    lastName: '',
    rut: '',
    division: '',
    dateOfBirth: '',
    phone: '',
  });

  const rosterQuery = useQuery({
    queryKey: ['club-roster', selectedClub?.id, showArchived],
    queryFn: async () => {
      const query = showArchived ? '?includeArchived=true' : '';
      const { data } = await api.get(`/clubs/${selectedClub?.id}/roster${query}`);
      return data as RosterEntry[];
    },
    enabled: !!selectedClub?.id,
  });

  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);

  const filteredRoster = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = roster.filter(entry => {
      if (needle) {
        const haystack = [
          entry.firstName,
          entry.lastName,
          entry.fullName,
          entry.rut ?? '',
          entry.live?.email ?? '',
          entry.live?.displayName ?? '',
          entry.currentMembership?.planName ?? '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (divisionFilter && (entry.division ?? '') !== divisionFilter) return false;
      if (linkedFilter === 'linked' && !entry.linked) return false;
      if (linkedFilter === 'paper' && entry.linked) return false;
      if (membershipFilter === 'ACTIVE' && entry.membershipStatus !== 'ACTIVE') return false;
      if (membershipFilter === 'SUSPENDED' && entry.membershipStatus !== 'SUSPENDED') return false;
      if (membershipFilter === 'PENDING' && entry.membershipStatus !== 'PENDING') return false;
      if (
        membershipFilter === 'NONE'
        && entry.membershipStatus !== null
        && entry.membershipStatus !== 'CANCELLED'
        && entry.membershipStatus !== 'EXPIRED'
      ) {
        return false;
      }
      return true;
    });

    return filtered.sort((left, right) => compareRoster(left, right, sortKey, sortDirection));
  }, [divisionFilter, linkedFilter, membershipFilter, roster, search, sortDirection, sortKey]);

  const divisions = useMemo(() => {
    const values = new Set<string>();
    roster.forEach(entry => {
      if (entry.division) values.add(entry.division);
    });
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'es'));
  }, [roster]);

  const stats = useMemo(() => {
    const total = roster.filter(entry => !entry.archived).length;
    const linked = roster.filter(entry => entry.linked && !entry.archived).length;
    const archived = roster.filter(entry => entry.archived).length;
    return { total, linked, paper: total - linked, archived };
  }, [roster]);

  const allowed = canManage(user?.role);
  const isClubAdmin = user?.role === 'CLUB_ADMIN' || user?.role === 'SUPER_ADMIN';

  const invalidateRoster = () => {
    queryClient.invalidateQueries({ queryKey: ['club-roster', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['membership-requests', selectedClub?.id] });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(`/clubs/${selectedClub?.id}/roster/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data as ImportSummary;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['club-roster', selectedClub?.id] });
      queryClient.invalidateQueries({ queryKey: ['ranking-players', selectedClub?.id] });
      queryClient.invalidateQueries({ queryKey: ['internal-rankings', selectedClub?.id] });
      setShowImportSummary(true);
      const errCount = data?.errors?.length ?? 0;
      if (errCount === 0) {
        toast.success(`${data.created} jugadores nuevos, ${data.updated} actualizados`);
      } else {
        toast.warning(`${data.created} creados, ${errCount} filas rechazadas — revisa el detalle`);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'No se pudo procesar el archivo');
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) =>
      api.patch(`/clubs/${selectedClub?.id}/roster/${id}`, patch),
    onSuccess: () => {
      invalidateRoster();
      setEditingId(null);
      toast.success('Jugador actualizado');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message ?? 'No se pudo guardar el cambio'),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const lines = [
        'firstName,lastName,dateOfBirth,rut,phone,address,suburb,division',
        [
          addForm.firstName,
          addForm.lastName,
          addForm.dateOfBirth,
          addForm.rut,
          addForm.phone,
          '',
          '',
          addForm.division,
        ].map(v => csvCell(v)).join(','),
      ];
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const file = new File([blob], 'jugador.csv', { type: 'text/csv' });
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(`/clubs/${selectedClub?.id}/roster/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data as ImportSummary;
    },
    onSuccess: data => {
      invalidateRoster();
      setShowAddForm(false);
      setAddForm({ firstName: '', lastName: '', rut: '', division: '', dateOfBirth: '', phone: '' });
      if (data.errors?.length) {
        toast.warning(`Creado. Algunos datos pudieron no persistir: ${data.errors[0].reason}`);
      } else {
        toast.success('Jugador agregado al roster del club');
      }
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message ?? 'No se pudo agregar al jugador'),
  });

  const templateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.get(`/clubs/${selectedClub?.id}/import-template`, {
        responseType: 'blob',
      });
      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `raqueta-plantilla-${selectedClub?.slug ?? selectedClub?.id}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message ?? 'No se pudo descargar la plantilla'),
  });

  const archiveMutation = useMutation({
    mutationFn: (rosterId: string) => api.patch(`/clubs/${selectedClub?.id}/roster/${rosterId}/archive`),
    onSuccess: (response: any) => {
      invalidateRoster();
      const warning = response?.data?.warning;
      if (warning) {
        toast.warning(warning);
      } else {
        toast.success('Jugador archivado');
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo archivar al jugador'),
  });

  const restoreMutation = useMutation({
    mutationFn: (rosterId: string) => api.patch(`/clubs/${selectedClub?.id}/roster/${rosterId}/restore`),
    onSuccess: () => {
      invalidateRoster();
      toast.success('Jugador restaurado');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo restaurar al jugador'),
  });

  const membershipMutation = useMutation({
    mutationFn: ({ membershipId, payload }: { membershipId: string; payload: Record<string, unknown> }) =>
      api.patch(`/memberships/${membershipId}`, payload),
    onSuccess: () => {
      invalidateRoster();
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo actualizar la membresía'),
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortDirection(defaultDirectionFor(key));
  };

  const updateMembershipStatus = (entry: RosterEntry, nextStatus: 'SUSPENDED' | 'ACTIVE' | 'CANCELLED') => {
    const membership = entry.currentMembership;
    if (!membership) {
      toast.error('Este jugador no tiene una membresía editable');
      return;
    }

    if (nextStatus === 'SUSPENDED') {
      const reason = window.prompt('Motivo de la suspensión');
      if (!reason?.trim()) return;
      membershipMutation.mutate(
        {
          membershipId: membership.id,
          payload: {
            status: 'SUSPENDED',
            statusReason: reason.trim(),
          },
        },
        {
          onSuccess: () => {
            toast.success('Membresía suspendida');
          },
        },
      );
      return;
    }

    if (nextStatus === 'CANCELLED') {
      const confirmed = window.confirm('¿Cancelar esta membresía de forma permanente?');
      if (!confirmed) return;
      membershipMutation.mutate(
        {
          membershipId: membership.id,
          payload: { status: 'CANCELLED' },
        },
        {
          onSuccess: () => {
            toast.success('Membresía cancelada');
          },
        },
      );
      return;
    }

    membershipMutation.mutate(
      {
        membershipId: membership.id,
        payload: { status: 'ACTIVE' },
      },
      {
        onSuccess: () => {
          toast.success('Membresía reactivada');
        },
      },
    );
  };

  if (!selectedClub) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
        <Building2 className="h-12 w-12 text-gray-300" />
        <p className="text-gray-500">Selecciona un club desde el menú lateral para ver sus jugadores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jugadores</h1>
          <p className="text-sm text-gray-500">
            Roster del club · <span className="font-medium text-gray-700">{selectedClub.name}</span>
            {' · '}
            {allowed
              ? <span className="text-brand-600">puedes crear y editar</span>
              : <span className="text-gray-400">solo lectura</span>}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => templateMutation.mutate()}
            disabled={templateMutation.isPending || !selectedClub.id}
          >
            <Download className="h-4 w-4" />
            Plantilla
          </button>
          <label
            className={`btn-secondary flex items-center gap-2 ${allowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
            title={allowed ? 'Subir CSV/XLSX de jugadores' : 'Tu rol no permite modificar el roster'}
          >
            <Upload className="h-4 w-4" />
            Importar lista
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              disabled={!allowed}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                event.target.value = '';
              }}
            />
          </label>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => setShowAddForm(true)}
            disabled={!allowed}
          >
            <UserPlus className="h-4 w-4" />
            Agregar jugador
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Total roster" value={stats.total} icon={Users} color="brand" />
        <StatCard label="Con cuenta en la app" value={stats.linked} icon={LinkIcon} color="green" />
        <StatCard label="Solo en roster" value={stats.paper} icon={UserPlus} color="yellow" />
        <StatCard label="Archivados" value={stats.archived} icon={FileSpreadsheet} color="gray" />
      </div>

      <div className="card flex flex-col gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field pl-9"
            placeholder="Buscar por nombre, RUT, email o plan..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Filter className="h-3.5 w-3.5" />
            <select
              className="input-field !py-1.5 text-xs"
              value={divisionFilter}
              onChange={event => setDivisionFilter(event.target.value)}
            >
              <option value="">Todas las divisiones</option>
              {divisions.map(division => (
                <option key={division} value={division}>{division}</option>
              ))}
            </select>
          </div>
          <select
            className="input-field !py-1.5 text-xs"
            value={membershipFilter}
            onChange={event => setMembershipFilter(event.target.value as MembershipFilter)}
          >
            <option value="all">Todas las membresías</option>
            <option value="ACTIVE">Socio activo</option>
            <option value="SUSPENDED">Suspendido</option>
            <option value="NONE">Sin membresía</option>
            <option value="PENDING">Pendiente</option>
          </select>
          <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs">
            {(['all', 'linked', 'paper'] as const).map(value => (
              <button
                key={value}
                onClick={() => setLinkedFilter(value)}
                className={`px-3 py-1.5 ${
                  linkedFilter === value
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {value === 'all' ? 'Todos' : value === 'linked' ? 'Con cuenta' : 'Sin cuenta'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={event => setShowArchived(event.target.checked)}
            />
            Mostrar archivados
          </label>
          <button
            className="btn-secondary flex items-center gap-1 text-xs"
            onClick={() => {
              setSearch('');
              setDivisionFilter('');
              setLinkedFilter('all');
              setMembershipFilter('all');
            }}
          >
            <X className="h-3 w-3" />
            Limpiar filtros
          </button>
          <button
            className="btn-secondary flex items-center gap-1 text-xs"
            onClick={() => rosterQuery.refetch()}
            disabled={rosterQuery.isFetching}
          >
            <RefreshCcw className={`h-3 w-3 ${rosterQuery.isFetching ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <SortableHeader
                  label="Jugador"
                  active={sortKey === 'name'}
                  direction={sortDirection}
                  onClick={() => toggleSort('name')}
                />
                <SortableHeader
                  label="RUT"
                  active={sortKey === 'rut'}
                  direction={sortDirection}
                  onClick={() => toggleSort('rut')}
                />
                <SortableHeader
                  label="Fecha nacimiento"
                  active={sortKey === 'dateOfBirth'}
                  direction={sortDirection}
                  onClick={() => toggleSort('dateOfBirth')}
                />
                <SortableHeader
                  label="División"
                  active={sortKey === 'division'}
                  direction={sortDirection}
                  onClick={() => toggleSort('division')}
                />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Membresía</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Cuenta app</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Contacto</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rosterQuery.isLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 8 }).map((__, column) => (
                        <td key={column} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-gray-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filteredRoster.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400">
                        <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 opacity-30" />
                        <p className="text-sm">
                          {search || divisionFilter || linkedFilter !== 'all' || membershipFilter !== 'all'
                            ? 'Ningún jugador coincide con los filtros.'
                            : 'Aún no hay jugadores en el roster de este club.'}
                        </p>
                      </td>
                    </tr>
                  )
                  : filteredRoster.map(entry => {
                      const membership = entry.currentMembership;
                      const membershipStatus = entry.membershipStatus;
                      const rowMuted = entry.archived ? 'bg-gray-50/70 text-gray-500' : 'hover:bg-gray-50';
                      return (
                        <tr key={entry.id} className={rowMuted}>
                          {editingId === entry.id ? (
                            <td colSpan={8} className="px-4 py-3">
                              <EditRow
                                entry={entry}
                                form={editForm}
                                setForm={setEditForm}
                                onCancel={() => setEditingId(null)}
                                onSave={() => {
                                  const patch: Record<string, unknown> = {
                                    firstName: editForm.firstName || entry.firstName,
                                    lastName: editForm.lastName || entry.lastName,
                                    rut: editForm.rut || entry.rut,
                                    division: editForm.division || entry.division,
                                    dateOfBirth: editForm.dateOfBirth
                                      ? new Date(editForm.dateOfBirth).toISOString()
                                      : entry.dateOfBirth,
                                    phone: editForm.phone || entry.imported.phone,
                                  };
                                  editMutation.mutate({ id: entry.id, patch });
                                }}
                                saving={editMutation.isPending}
                              />
                            </td>
                          ) : (
                            <>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-100">
                                    <span className="text-xs font-semibold text-brand-700">
                                      {entry.firstName?.[0]?.toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <p className={`font-medium ${entry.archived ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                      {entry.fullName}
                                    </p>
                                    {entry.live?.displayName && entry.live.displayName !== entry.fullName && (
                                      <p className="text-xs text-gray-500">App: {entry.live.displayName}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {entry.rut ?? <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {entry.dateOfBirth
                                  ? new Date(entry.dateOfBirth).toLocaleDateString('es-CL')
                                  : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                {entry.division
                                  ? <span className="badge-gray">{entry.division}</span>
                                  : <span className="text-xs text-gray-400">sin asignar</span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <span className={membershipBadgeClass(membershipStatus)}>
                                    {membershipStatusLabel(membershipStatus)}
                                  </span>
                                  {membership?.planName && (
                                    <p className="text-xs text-gray-500">{membership.planName}</p>
                                  )}
                                  {entry.pendingMembershipRequest?.planName && !membership && (
                                    <p className="text-xs text-gray-500">Solicitud: {entry.pendingMembershipRequest.planName}</p>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {entry.linked
                                  ? (
                                    <span className="badge-green flex w-fit items-center gap-1">
                                      <LinkIcon className="h-3 w-3" />
                                      Vinculado
                                    </span>
                                  )
                                  : (
                                    <span className="badge-yellow flex w-fit items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      Sin cuenta
                                    </span>
                                  )}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600">
                                {entry.live?.email || entry.live?.phone || entry.imported.phone || entry.phone || (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex flex-col items-end gap-2">
                                  <div className="flex flex-wrap justify-end gap-2">
                                    {allowed && !entry.archived && (
                                      <button
                                        className="text-xs font-medium text-brand-600 hover:underline"
                                        onClick={() => {
                                          setEditingId(entry.id);
                                          setEditForm({
                                            firstName: entry.firstName,
                                            lastName: entry.lastName,
                                            rut: entry.rut ?? '',
                                            division: entry.division ?? '',
                                            dateOfBirth: entry.dateOfBirth
                                              ? new Date(entry.dateOfBirth).toISOString().slice(0, 10)
                                              : '',
                                            phone: entry.imported.phone ?? entry.phone ?? '',
                                          });
                                        }}
                                      >
                                        Editar
                                      </button>
                                    )}
                                    {allowed && membership?.id && membership.status === 'ACTIVE' && !entry.archived && (
                                      <>
                                        <button
                                          className="text-xs font-medium text-amber-700 hover:underline"
                                          onClick={() => updateMembershipStatus(entry, 'SUSPENDED')}
                                        >
                                          Suspender
                                        </button>
                                        <button
                                          className="text-xs font-medium text-red-600 hover:underline"
                                          onClick={() => updateMembershipStatus(entry, 'CANCELLED')}
                                        >
                                          Cancelar membresía
                                        </button>
                                      </>
                                    )}
                                    {allowed && membership?.id && membership.status === 'SUSPENDED' && !entry.archived && (
                                      <>
                                        <button
                                          className="text-xs font-medium text-green-700 hover:underline"
                                          onClick={() => updateMembershipStatus(entry, 'ACTIVE')}
                                        >
                                          Reactivar
                                        </button>
                                        <button
                                          className="text-xs font-medium text-red-600 hover:underline"
                                          onClick={() => updateMembershipStatus(entry, 'CANCELLED')}
                                        >
                                          Cancelar membresía
                                        </button>
                                      </>
                                    )}
                                    {allowed && membership?.id && membership.status === 'CANCELLED' && !entry.archived && isClubAdmin && (
                                      <button
                                        className="text-xs font-medium text-green-700 hover:underline"
                                        onClick={() => updateMembershipStatus(entry, 'ACTIVE')}
                                      >
                                        Reactivar
                                      </button>
                                    )}
                                    {allowed && !entry.archived && (
                                      <button
                                        className="text-xs font-medium text-gray-600 hover:underline"
                                        onClick={() => {
                                          const message = entry.linked
                                            ? `${ARCHIVE_LINKED_WARNING}\n\n¿Deseas continuar?`
                                            : `¿Archivar a ${entry.fullName}?`;
                                          if (!window.confirm(message)) return;
                                          archiveMutation.mutate(entry.id);
                                        }}
                                      >
                                        Archivar
                                      </button>
                                    )}
                                    {allowed && entry.archived && (
                                      <button
                                        className="text-xs font-medium text-brand-600 hover:underline"
                                        onClick={() => restoreMutation.mutate(entry.id)}
                                      >
                                        Restaurar
                                      </button>
                                    )}
                                  </div>
                                  {!entry.linked && membership && (
                                    <p className="max-w-[240px] text-right text-[11px] text-amber-700">
                                      Este jugador no tiene cuenta en la app — notificación manual requerida: {entry.fullName}
                                    </p>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
          <span>
            {filteredRoster.length === roster.length
              ? `${roster.length} jugadores`
              : `${filteredRoster.length} de ${roster.length} mostrados`}
          </span>
          <span>
            El roster del club sigue siendo la fuente de identidad para resultados y torneos.
          </span>
        </div>
      </div>

      {showImportSummary && uploadMutation.data && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowImportSummary(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Resultado de la importación</h3>
              <button onClick={() => setShowImportSummary(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-4">
              <div className="grid grid-cols-2 gap-3">
                <SummaryStat label="Creados" value={uploadMutation.data.created} tone="green" />
                <SummaryStat label="Actualizados" value={uploadMutation.data.updated} tone="blue" />
              </div>
              {uploadMutation.data.errors?.length
                ? (
                  <div>
                    <p className="text-sm font-medium text-red-700">
                      Filas rechazadas ({uploadMutation.data.errors.length})
                    </p>
                    <ul className="mt-2 max-h-48 space-y-1 overflow-auto rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
                      {uploadMutation.data.errors.map((error, index) => (
                        <li key={index}>
                          <span className="font-mono">fila {error.row}</span>: {error.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
                : (
                  <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                    Todo el archivo se importó sin errores.
                  </div>
                )}
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-right">
              <button className="btn-primary" onClick={() => setShowImportSummary(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <Modal title="Agregar jugador al roster" onClose={() => setShowAddForm(false)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre *">
              <input
                className="input-field"
                value={addForm.firstName}
                onChange={event => setAddForm(form => ({ ...form, firstName: event.target.value }))}
              />
            </Field>
            <Field label="Apellido *">
              <input
                className="input-field"
                value={addForm.lastName}
                onChange={event => setAddForm(form => ({ ...form, lastName: event.target.value }))}
              />
            </Field>
            <Field label="RUT">
              <input
                className="input-field"
                value={addForm.rut}
                onChange={event => setAddForm(form => ({ ...form, rut: event.target.value }))}
                placeholder="12.345.678-9"
              />
            </Field>
            <Field label="Fecha de nacimiento">
              <input
                className="input-field"
                type="date"
                value={addForm.dateOfBirth}
                onChange={event => setAddForm(form => ({ ...form, dateOfBirth: event.target.value }))}
              />
            </Field>
            <Field label="Teléfono">
              <input
                className="input-field"
                value={addForm.phone}
                onChange={event => setAddForm(form => ({ ...form, phone: event.target.value }))}
                placeholder="+56 9 ..."
              />
            </Field>
            <Field label="División">
              <input
                className="input-field"
                value={addForm.division}
                onChange={event => setAddForm(form => ({ ...form, division: event.target.value }))}
                placeholder="A · B · C · Senior · Junior"
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            El jugador se creará en el roster del club aunque no tenga cuenta en la app.
          </p>
          <ModalActions
            onCancel={() => setShowAddForm(false)}
            onConfirm={() => {
              if (!addForm.firstName.trim() || !addForm.lastName.trim()) {
                toast.error('Nombre y apellido son obligatorios');
                return;
              }
              addMutation.mutate();
            }}
            confirmLabel={addMutation.isPending ? 'Agregando...' : 'Agregar'}
            disabled={addMutation.isPending}
          />
        </Modal>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${active ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
      >
        {label}
        {active
          ? <span className="text-[11px]">{direction === 'asc' ? '↑' : '↓'}</span>
          : <ArrowUpDown className="h-3 w-3" />}
      </button>
    </th>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: any;
  color: 'brand' | 'green' | 'yellow' | 'gray';
}) {
  const palette: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-green-50 text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    gray: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="card flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${palette[color]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: 'green' | 'blue' }) {
  const colors = {
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
  };

  return (
    <div className={`rounded-xl px-4 py-3 ${colors[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function EditRow({
  entry,
  form,
  setForm,
  onCancel,
  onSave,
  saving,
}: {
  entry: RosterEntry;
  form: EditDraft;
  setForm: React.Dispatch<React.SetStateAction<EditDraft>>;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Nombre">
          <input
            className="input-field"
            value={form.firstName}
            onChange={event => setForm(current => ({ ...current, firstName: event.target.value }))}
          />
        </Field>
        <Field label="Apellido">
          <input
            className="input-field"
            value={form.lastName}
            onChange={event => setForm(current => ({ ...current, lastName: event.target.value }))}
          />
        </Field>
        <Field label="RUT">
          <input
            className="input-field"
            value={form.rut}
            onChange={event => setForm(current => ({ ...current, rut: event.target.value }))}
            placeholder="12.345.678-9"
          />
        </Field>
        <Field label="División">
          <input
            className="input-field"
            value={form.division}
            onChange={event => setForm(current => ({ ...current, division: event.target.value }))}
          />
        </Field>
        <Field label="Fecha de nacimiento">
          <input
            type="date"
            className="input-field"
            value={form.dateOfBirth}
            onChange={event => setForm(current => ({ ...current, dateOfBirth: event.target.value }))}
          />
        </Field>
        <Field label="Teléfono">
          <input
            className="input-field"
            value={form.phone}
            onChange={event => setForm(current => ({ ...current, phone: event.target.value }))}
          />
        </Field>
      </div>
      <p className="text-xs text-gray-500">
        Editando a <span className="font-medium">{entry.fullName}</span>.
      </p>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary flex items-center gap-2" onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancelar
        </button>
        <button className="btn-primary flex items-center gap-2" disabled={saving} onClick={onSave}>
          <Save className="h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
  disabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
      <button className="btn-primary" onClick={onConfirm} disabled={disabled}>{confirmLabel}</button>
    </div>
  );
}

function defaultDirectionFor(key: SortKey): SortDirection {
  return key === 'dateOfBirth' ? 'desc' : 'asc';
}

function compareRoster(left: RosterEntry, right: RosterEntry, key: SortKey, direction: SortDirection) {
  const modifier = direction === 'asc' ? 1 : -1;
  let value = 0;

  if (key === 'name') {
    value = `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`, 'es');
  } else if (key === 'rut') {
    value = rutSortValue(left.rut) - rutSortValue(right.rut);
  } else if (key === 'dateOfBirth') {
    value = dateSortValue(left.dateOfBirth) - dateSortValue(right.dateOfBirth);
  } else {
    value = (left.division ?? '').localeCompare(right.division ?? '', 'es');
  }

  if (value !== 0) return value * modifier;
  return `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`, 'es');
}

function rutSortValue(rut: string | null) {
  if (!rut) return Number.MAX_SAFE_INTEGER;
  const digits = rut.replace(/\D/g, '');
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
}

function dateSortValue(value: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function membershipBadgeClass(status: MembershipStatus) {
  if (status === 'ACTIVE') return 'badge-green';
  if (status === 'SUSPENDED') return 'badge-red';
  if (status === 'PENDING') return 'badge-yellow';
  return 'badge-gray';
}

function membershipStatusLabel(status: MembershipStatus) {
  if (status === 'ACTIVE') return 'Socio activo';
  if (status === 'SUSPENDED') return 'Suspendido';
  if (status === 'CANCELLED') return 'Cancelado';
  if (status === 'EXPIRED') return 'Expirada';
  if (status === 'PENDING') return 'Pendiente';
  return 'Sin membresía';
}

function csvCell(value: string): string {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
