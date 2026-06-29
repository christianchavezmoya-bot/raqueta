'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search, Upload, Download, Plus, Save, X, Trash2,
  UserPlus, Building2, Link as LinkIcon, AlertCircle, RefreshCcw,
  Users, FileSpreadsheet, Filter,
} from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────────
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

type RosterEntry = {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string | null;
  rut: string | null;
  division: string | null;
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

// ── Role helpers ─────────────────────────────────────────────────────────────
// Staff roles allowed to modify the club's roster (per server RolesGuard
// @Roles(SUPER_ADMIN, CLUB_ADMIN, MANAGER) on roster endpoints).
// SUPER_ADMIN is included even though the page lives under the club area.
const STAFF_ROLES = new Set(['SUPER_ADMIN', 'CLUB_ADMIN', 'MANAGER']);

const canManage = (role: string | undefined) => {
  if (!role) return false;
  if (STAFF_ROLES.has(role)) return true;
  // Player / member / parent accounts can read but not mutate.
  return false;
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PlayersPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Filters / search ───────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [linkedFilter, setLinkedFilter] = useState<'all' | 'linked' | 'paper'>('all');
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

  // ── Roster query (entire club roster) ──────────────────────────────────────
  const rosterQuery = useQuery({
    queryKey: ['club-roster', selectedClub?.id],
    queryFn: async () => {
      const { data } = await api.get(`/clubs/${selectedClub?.id}/roster`);
      return data as RosterEntry[];
    },
    enabled: !!selectedClub?.id,
  });

  const roster: RosterEntry[] = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);

  // ── Filtered + summarised view ─────────────────────────────────────────────
  const filteredRoster = useMemo(() => {
    const s = search.trim().toLowerCase();
    return roster.filter(entry => {
      if (s) {
        const hay = [
          entry.firstName, entry.lastName, entry.fullName,
          entry.rut ?? '',
          entry.live?.email ?? '',
          entry.live?.displayName ?? '',
        ].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (divisionFilter && (entry.division ?? '') !== divisionFilter) return false;
      if (linkedFilter === 'linked' && !entry.linked) return false;
      if (linkedFilter === 'paper' && entry.linked) return false;
      return true;
    });
  }, [roster, search, divisionFilter, linkedFilter]);

  const divisions = useMemo(() => {
    const set = new Set<string>();
    roster.forEach(r => { if (r.division) set.add(r.division); });
    return Array.from(set).sort();
  }, [roster]);

  const stats = useMemo(() => {
    const total = roster.length;
    const linked = roster.filter(r => r.linked).length;
    return { total, linked, paper: total - linked };
  }, [roster]);

  // ── Bulk upload ─────────────────────────────────────────────────────────────
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

  // ── Edit existing entry ────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) =>
      api.patch(`/clubs/${selectedClub?.id}/roster/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-roster', selectedClub?.id] });
      setEditingId(null);
      toast.success('Jugador actualizado');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message ?? 'No se pudo guardar el cambio'),
  });

  // ── Add single entry ───────────────────────────────────────────────────────
  // We re-use the bulk import endpoint with a synthetic CSV for parity. That
  // way the same upsert logic, RUT validation and CSV tolerance applies.
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
      queryClient.invalidateQueries({ queryKey: ['club-roster', selectedClub?.id] });
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

  // ── Download import template ───────────────────────────────────────────────
  const templateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.get(`/clubs/${selectedClub?.id}/import-template`, {
        responseType: 'blob',
      });
      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raqueta-plantilla-${selectedClub?.slug ?? selectedClub?.id}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message ?? 'No se pudo descargar la plantilla'),
  });

  // ── Permissions + empty-state ──────────────────────────────────────────────
  const role = user?.role;
  const allowed = canManage(role);

  if (!selectedClub) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <Building2 className="w-12 h-12 text-gray-300" />
        <p className="text-gray-500">Selecciona un club desde el menú lateral para ver sus jugadores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => templateMutation.mutate()}
            disabled={templateMutation.isPending || !selectedClub.id}
          >
            <Download className="w-4 h-4" />
            Plantilla
          </button>
          <label
            className={`btn-secondary flex items-center gap-2 ${allowed ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            title={allowed ? 'Subir CSV/XLSX de jugadores' : 'Tu rol no permite modificar el roster'}
          >
            <Upload className="w-4 h-4" />
            Importar lista
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              disabled={!allowed}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                e.target.value = '';
              }}
            />
          </label>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => setShowAddForm(true)}
            disabled={!allowed}
          >
            <UserPlus className="w-4 h-4" />
            Agregar jugador
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total roster" value={stats.total} icon={Users} color="brand" />
        <StatCard label="Con cuenta en la app" value={stats.linked} icon={LinkIcon} color="green" />
        <StatCard label="Solo en roster (sin app)" value={stats.paper} icon={UserPlus} color="yellow" />
      </div>

      {/* Filters */}
      <div className="card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-field pl-9"
            placeholder="Buscar por nombre, RUT o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Filter className="w-3.5 h-3.5" />
            <select
              className="input-field !py-1.5 text-xs"
              value={divisionFilter}
              onChange={e => setDivisionFilter(e.target.value)}
            >
              <option value="">Todas las divisiones</option>
              {divisions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {(['all', 'linked', 'paper'] as const).map(k => (
              <button
                key={k}
                onClick={() => setLinkedFilter(k)}
                className={`px-3 py-1.5 ${linkedFilter === k
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {k === 'all' ? 'Todos' : k === 'linked' ? 'Con cuenta' : 'Sin cuenta'}
              </button>
            ))}
          </div>
          <button
            className="btn-secondary text-xs flex items-center gap-1"
            onClick={() => {
              setSearch('');
              setDivisionFilter('');
              setLinkedFilter('all');
            }}
          >
            <X className="w-3 h-3" /> Limpiar filtros
          </button>
          <button
            className="btn-secondary text-xs flex items-center gap-1"
            onClick={() => rosterQuery.refetch()}
            disabled={rosterQuery.isFetching}
          >
            <RefreshCcw className={`w-3 h-3 ${rosterQuery.isFetching ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Jugador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">RUT</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">División</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cuenta app</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Contacto</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rosterQuery.isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : filteredRoster.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-400">
                        <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">
                          {search || divisionFilter || linkedFilter !== 'all'
                            ? 'Ningún jugador coincide con los filtros.'
                            : 'Aún no hay jugadores en el roster de este club.'}
                        </p>
                      </td>
                    </tr>
                  )
                  : filteredRoster.map(entry => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        {editingId === entry.id ? (
                          <td colSpan={6} className="px-4 py-3">
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
                                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-semibold text-brand-700">
                                    {entry.firstName?.[0]?.toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">{entry.fullName}</p>
                                  {entry.live?.displayName && entry.live.displayName !== entry.fullName && (
                                    <p className="text-xs text-gray-500">App: {entry.live.displayName}</p>
                                  )}
                                  {entry.dateOfBirth && (
                                    <p className="text-xs text-gray-400">
                      Nac. {new Date(entry.dateOfBirth).toLocaleDateString('es-CL')}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {entry.rut ?? <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {entry.division
                                ? <span className="badge-gray">{entry.division}</span>
                                : <span className="text-gray-400 text-xs">sin asignar</span>}
                            </td>
                            <td className="px-4 py-3">
                              {entry.linked
                                ? (
                                  <span className="badge-green flex items-center gap-1 w-fit">
                                    <LinkIcon className="w-3 h-3" /> Vinculado
                                  </span>
                                )
                                : (
                                  <span className="badge-yellow flex items-center gap-1 w-fit">
                                    <AlertCircle className="w-3 h-3" /> Sin cuenta
                                  </span>
                                )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {entry.live?.email || entry.imported.phone || entry.live?.phone || (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {allowed && (
                                <button
                                  className="text-xs text-brand-600 hover:underline font-medium"
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
                                      phone: entry.imported.phone ?? '',
                                    });
                                  }}
                                >
                                  Editar
                                </button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500 flex items-center justify-between">
          <span>
            {filteredRoster.length === roster.length
              ? `${roster.length} jugadores`
              : `${filteredRoster.length} de ${roster.length} mostrados`}
          </span>
          <span>
            Importante: el roster del club es la fuente de identidad para resultados,
            torneos y dobles. <strong>Matching con la app por nombre + apellido + fecha de nacimiento</strong>
            {' · '}RUT es opcional y nunca se usa como clave de emparejamiento.
          </span>
        </div>
      </div>

      {/* Import summary popover */}
      {showImportSummary && uploadMutation.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowImportSummary(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Resultado de la importación</h3>
              <button onClick={() => setShowImportSummary(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
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
                    <ul className="mt-2 max-h-48 overflow-auto rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700 space-y-1">
                      {uploadMutation.data.errors.map((e, i) => (
                        <li key={i}>
                          <span className="font-mono">fila {e.row}</span>: {e.reason}
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
              <p className="text-xs text-gray-500">
                Tip: descarga la plantilla con el botón <strong>Plantilla</strong> para
                ver el formato exacto y las columnas reconocidas.
              </p>
            </div>
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-right">
              <button className="btn-primary" onClick={() => setShowImportSummary(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Add-single modal */}
      {showAddForm && (
        <Modal title="Agregar jugador al roster" onClose={() => setShowAddForm(false)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre *">
              <input
                className="input-field"
                value={addForm.firstName}
                onChange={e => setAddForm(f => ({ ...f, firstName: e.target.value }))}
              />
            </Field>
            <Field label="Apellido *">
              <input
                className="input-field"
                value={addForm.lastName}
                onChange={e => setAddForm(f => ({ ...f, lastName: e.target.value }))}
              />
            </Field>
            <Field label="RUT">
              <input
                className="input-field"
                value={addForm.rut}
                onChange={e => setAddForm(f => ({ ...f, rut: e.target.value }))}
                placeholder="12.345.678-9"
              />
            </Field>
            <Field label="Fecha de nacimiento">
              <input
                className="input-field"
                type="date"
                value={addForm.dateOfBirth}
                onChange={e => setAddForm(f => ({ ...f, dateOfBirth: e.target.value }))}
              />
            </Field>
            <Field label="Teléfono">
              <input
                className="input-field"
                value={addForm.phone}
                onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+56 9 ..."
              />
            </Field>
            <Field label="División">
              <input
                className="input-field"
                value={addForm.division}
                onChange={e => setAddForm(f => ({ ...f, division: e.target.value }))}
                placeholder="A · B · C · Senior · Junior"
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            El jugador se creará en el roster del club aunque no tenga
            cuenta en la app. La cuenta la podrá crear luego desde
            <em> Registro</em>.
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

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: number; icon: any; color: 'brand' | 'green' | 'yellow';
}) {
  const palette: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-green-50 text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
  };
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${palette[color]}`}>
        <Icon className="w-6 h-6" />
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
  entry, form, setForm, onCancel, onSave, saving,
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
            onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
          />
        </Field>
        <Field label="Apellido">
          <input
            className="input-field"
            value={form.lastName}
            onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
          />
        </Field>
        <Field label="RUT">
          <input
            className="input-field"
            value={form.rut}
            onChange={e => setForm(f => ({ ...f, rut: e.target.value }))}
            placeholder="12.345.678-9"
          />
        </Field>
        <Field label="División">
          <input
            className="input-field"
            value={form.division}
            onChange={e => setForm(f => ({ ...f, division: e.target.value }))}
          />
        </Field>
        <Field label="Fecha de nacimiento">
          <input
            type="date"
            className="input-field"
            value={form.dateOfBirth}
            onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
          />
        </Field>
        <Field label="Teléfono">
          <input
            className="input-field"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          />
        </Field>
      </div>
      <p className="text-xs text-gray-500">
        Editando a <span className="font-medium">{entry.fullName}</span>. El RUT se valida con
        el dígito verificador chileno.
      </p>
      <div className="flex gap-2 justify-end">
        <button className="btn-secondary flex items-center gap-2" onClick={onCancel}>
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          className="btn-primary flex items-center gap-2"
          disabled={saving}
          onClick={onSave}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

function Modal({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
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
      <span className="block text-xs font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ModalActions({
  onCancel, onConfirm, confirmLabel, disabled,
}: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; disabled?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
      <button className="btn-primary" onClick={onConfirm} disabled={disabled}>{confirmLabel}</button>
    </div>
  );
}

// CSV cell escaping per RFC 4180.
function csvCell(value: string): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
