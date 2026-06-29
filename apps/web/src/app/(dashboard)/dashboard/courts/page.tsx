'use client';

import { ChangeEvent, ReactNode, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Power,
  Sun,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
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

const USER_TYPES = [
  { value: 'MEMBER', label: 'Socio' },
  { value: 'CASUAL', label: 'Casual' },
] as const;

const BLOCK_TYPES = [
  { value: 'MAINTENANCE', label: 'Mantenimiento' },
  { value: 'PRIVATE_EVENT', label: 'Evento privado' },
  { value: 'STAFF', label: 'Uso interno' },
  { value: 'OTHER', label: 'Otro' },
] as const;

type CourtFormState = {
  name: string;
  surfaceType: string;
  indoor: boolean;
  lighting: boolean;
  active: boolean;
  description: string;
  pricing: Record<'MEMBER' | 'CASUAL', { price: string; peakPrice: string; offPeakPrice: string }>;
};

function emptyCourtForm(): CourtFormState {
  return {
    name: '',
    surfaceType: 'CLAY',
    indoor: false,
    lighting: false,
    active: true,
    description: '',
    pricing: {
      MEMBER: { price: '', peakPrice: '', offPeakPrice: '' },
      CASUAL: { price: '', peakPrice: '', offPeakPrice: '' },
    },
  };
}

function buildCourtForm(court?: any): CourtFormState {
  const form = emptyCourtForm();
  if (!court) return form;

  const memberPricing = court.pricing?.find((item: any) => item.userType === 'MEMBER');
  const casualPricing = court.pricing?.find((item: any) => item.userType === 'CASUAL');

  return {
    name: court.name ?? '',
    surfaceType: court.surfaceType ?? 'CLAY',
    indoor: !!court.indoor,
    lighting: !!court.lighting,
    active: court.active ?? true,
    description: court.description ?? '',
    pricing: {
      MEMBER: {
        price: memberPricing?.price != null ? String(memberPricing.price) : '',
        peakPrice: memberPricing?.peakPrice != null ? String(memberPricing.peakPrice) : '',
        offPeakPrice: memberPricing?.offPeakPrice != null ? String(memberPricing.offPeakPrice) : '',
      },
      CASUAL: {
        price: casualPricing?.price != null ? String(casualPricing.price) : '',
        peakPrice: casualPricing?.peakPrice != null ? String(casualPricing.peakPrice) : '',
        offPeakPrice: casualPricing?.offPeakPrice != null ? String(casualPricing.offPeakPrice) : '',
      },
    },
  };
}

function formatCurrency(value?: number | null) {
  if (value == null) return 'Sin precio';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

function toNumberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultBlockForm() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    startTime: toDateTimeLocal(start),
    endTime: toDateTimeLocal(end),
    reason: '',
    blockType: 'MAINTENANCE',
  };
}

function CourtPhotoUpload({ courtId }: { courtId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Archivo demasiado grande (máx 5 MB)');
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append('file', file);

    try {
      await api.post(`/courts/${courtId}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Foto actualizada');
      queryClient.invalidateQueries({ queryKey: ['courts'] });
      queryClient.invalidateQueries({ queryKey: ['club-public'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error al subir foto');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800 disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {uploading ? 'Subiendo...' : 'Foto'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </>
  );
}

export default function CourtsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const { data: courts, isLoading } = useCourts(selectedClub?.id);
  const queryClient = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [form, setForm] = useState<CourtFormState>(emptyCourtForm());
  const [scheduleCourtId, setScheduleCourtId] = useState<string | null>(null);
  const [blockForm, setBlockForm] = useState(defaultBlockForm());

  const editingCourt = courts?.find((court: any) => court.id === editingCourtId) ?? null;
  const scheduleCourt = courts?.find((court: any) => court.id === scheduleCourtId) ?? null;

  const refreshCourts = () => {
    queryClient.invalidateQueries({ queryKey: ['courts', selectedClub?.id] });
    queryClient.invalidateQueries({ queryKey: ['club-public'] });
    queryClient.invalidateQueries({ queryKey: ['club', selectedClub?.id] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClub?.id) throw new Error('Club no seleccionado');

      const basePayload = {
        name: form.name.trim(),
        surfaceType: form.surfaceType,
        indoor: form.indoor,
        lighting: form.lighting,
        active: form.active,
        description: form.description.trim(),
      };

      const savedCourt = editingCourtId
        ? await api.patch(`/courts/${editingCourtId}`, basePayload)
        : await api.post(`/clubs/${selectedClub.id}/courts`, basePayload);

      const courtId = savedCourt.data.id;

      await Promise.all(
        USER_TYPES.map(async userType => {
          const tier = form.pricing[userType.value];
          const price = toNumberOrNull(tier.price);
          const peakPrice = toNumberOrNull(tier.peakPrice);
          const offPeakPrice = toNumberOrNull(tier.offPeakPrice);
          const existingTier = editingCourt?.pricing?.find((item: any) => item.userType === userType.value);

          if (price == null) {
            if (existingTier) {
              await api.delete(`/courts/${courtId}/pricing/${userType.value}`);
            }
            return;
          }

          await api.post(`/courts/${courtId}/pricing`, {
            userType: userType.value,
            price,
            currency: 'CLP',
            peakPrice: peakPrice ?? undefined,
            offPeakPrice: offPeakPrice ?? undefined,
          });
        }),
      );

      return savedCourt.data;
    },
    onSuccess: () => {
      refreshCourts();
      toast.success(editingCourtId ? 'Cancha actualizada' : 'Cancha creada');
      setEditorOpen(false);
      setEditingCourtId(null);
      setForm(emptyCourtForm());
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'No se pudo guardar la cancha');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/courts/${id}`, { active }),
    onSuccess: () => {
      refreshCourts();
      toast.success('Disponibilidad actualizada');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo actualizar el estado'),
  });

  const deleteMutation = useMutation({
    mutationFn: (courtId: string) => api.delete(`/courts/${courtId}`),
    onSuccess: () => {
      refreshCourts();
      toast.success('Cancha eliminada');
      if (editingCourtId) {
        setEditorOpen(false);
        setEditingCourtId(null);
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo eliminar la cancha'),
  });

  const createBlockMutation = useMutation({
    mutationFn: async () => {
      if (!scheduleCourtId) throw new Error('Cancha no seleccionada');
      return api.post(`/courts/${scheduleCourtId}/blocks`, {
        startTime: blockForm.startTime,
        endTime: blockForm.endTime,
        reason: blockForm.reason.trim() || undefined,
        blockType: blockForm.blockType,
      });
    },
    onSuccess: () => {
      refreshCourts();
      toast.success('Bloqueo creado');
      setBlockForm(defaultBlockForm());
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo crear el bloqueo'),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: string) => api.delete(`/court-blocks/${blockId}`),
    onSuccess: () => {
      refreshCourts();
      toast.success('Bloqueo eliminado');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'No se pudo eliminar el bloqueo'),
  });

  const openCreate = () => {
    setEditingCourtId(null);
    setForm(emptyCourtForm());
    setEditorOpen(true);
  };

  const openEdit = (court: any) => {
    setEditingCourtId(court.id);
    setForm(buildCourtForm(court));
    setEditorOpen(true);
  };

  const openSchedule = (courtId: string) => {
    setScheduleCourtId(courtId);
    setBlockForm(defaultBlockForm());
  };

  const handleDelete = (courtId: string) => {
    if (!window.confirm('Esta acción eliminará la cancha. ¿Deseas continuar?')) return;
    deleteMutation.mutate(courtId);
  };

  const updatePricingField = (
    userType: 'MEMBER' | 'CASUAL',
    field: 'price' | 'peakPrice' | 'offPeakPrice',
    value: string,
  ) => {
    setForm(current => ({
      ...current,
      pricing: {
        ...current.pricing,
        [userType]: {
          ...current.pricing[userType],
          [field]: value,
        },
      },
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Canchas</h1>
          <p className="mt-1 text-sm text-gray-500">Administra fotos, precios, estado y bloqueos horarios.</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Agregar cancha
        </button>
      </div>

      {editorOpen && (
        <Modal title={editingCourtId ? 'Editar cancha' : 'Nueva cancha'} onClose={() => setEditorOpen(false)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre">
              <input
                className="input-field"
                value={form.name}
                onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
                placeholder="Cancha 1"
              />
            </Field>
            <Field label="Superficie">
              <select
                className="input-field"
                value={form.surfaceType}
                onChange={e => setForm(current => ({ ...current, surfaceType: e.target.value }))}
              >
                {Object.entries(SURFACES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Descripción">
              <textarea
                className="input-field min-h-24"
                value={form.description}
                onChange={e => setForm(current => ({ ...current, description: e.target.value }))}
                placeholder="Detalles visibles para ayudar a reservar esta cancha"
              />
            </Field>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Opciones</p>
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.indoor}
                    onChange={e => setForm(current => ({ ...current, indoor: e.target.checked }))}
                    className="rounded"
                  />
                  Cubierta
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.lighting}
                    onChange={e => setForm(current => ({ ...current, lighting: e.target.checked }))}
                    className="rounded"
                  />
                  Iluminación
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm(current => ({ ...current, active: e.target.checked }))}
                    className="rounded"
                  />
                  Disponible para reservas
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Precios por hora</h3>
              <p className="text-xs text-gray-500">Deja el precio vacío para eliminar esa tarifa.</p>
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {USER_TYPES.map(userType => (
                <div key={userType.value} className="rounded-2xl border border-gray-100 p-4">
                  <h4 className="text-sm font-semibold text-gray-900">{userType.label}</h4>
                  <div className="mt-3 grid gap-3">
                    <Field label="Precio base">
                      <input
                        className="input-field"
                        inputMode="decimal"
                        value={form.pricing[userType.value].price}
                        onChange={e => updatePricingField(userType.value, 'price', e.target.value)}
                        placeholder="15000"
                      />
                    </Field>
                    <Field label="Horario punta">
                      <input
                        className="input-field"
                        inputMode="decimal"
                        value={form.pricing[userType.value].peakPrice}
                        onChange={e => updatePricingField(userType.value, 'peakPrice', e.target.value)}
                        placeholder="Opcional"
                      />
                    </Field>
                    <Field label="Horario valle">
                      <input
                        className="input-field"
                        inputMode="decimal"
                        value={form.pricing[userType.value].offPeakPrice}
                        onChange={e => updatePricingField(userType.value, 'offPeakPrice', e.target.value)}
                        placeholder="Opcional"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ModalActions
            onCancel={() => setEditorOpen(false)}
            onConfirm={() => saveMutation.mutate()}
            confirmLabel={saveMutation.isPending ? 'Guardando...' : editingCourtId ? 'Guardar cambios' : 'Crear cancha'}
            disabled={!form.name.trim() || saveMutation.isPending}
          />
        </Modal>
      )}

      {scheduleCourt && (
        <Modal title={`Bloqueos · ${scheduleCourt.name}`} onClose={() => setScheduleCourtId(null)}>
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Nuevo bloqueo</h3>
              <Field label="Inicio">
                <input
                  className="input-field"
                  type="datetime-local"
                  value={blockForm.startTime}
                  onChange={e => setBlockForm(current => ({ ...current, startTime: e.target.value }))}
                />
              </Field>
              <Field label="Fin">
                <input
                  className="input-field"
                  type="datetime-local"
                  value={blockForm.endTime}
                  onChange={e => setBlockForm(current => ({ ...current, endTime: e.target.value }))}
                />
              </Field>
              <Field label="Tipo">
                <select
                  className="input-field"
                  value={blockForm.blockType}
                  onChange={e => setBlockForm(current => ({ ...current, blockType: e.target.value }))}
                >
                  {BLOCK_TYPES.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Motivo">
                <textarea
                  className="input-field min-h-24"
                  value={blockForm.reason}
                  onChange={e => setBlockForm(current => ({ ...current, reason: e.target.value }))}
                  placeholder="Ej. mantención de iluminación"
                />
              </Field>
              <button
                className="btn-primary w-full"
                onClick={() => createBlockMutation.mutate()}
                disabled={createBlockMutation.isPending || !blockForm.startTime || !blockForm.endTime}
              >
                {createBlockMutation.isPending ? 'Guardando bloqueo...' : 'Guardar bloqueo'}
              </button>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900">Bloqueos programados</h3>
              <div className="mt-3 space-y-3">
                {scheduleCourt.blocks?.length ? scheduleCourt.blocks.map((block: any) => (
                  <div key={block.id} className="rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {new Date(block.startTime).toLocaleString('es-CL')}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          hasta {new Date(block.endTime).toLocaleString('es-CL')}
                        </p>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {BLOCK_TYPES.find(option => option.value === block.blockType)?.label ?? block.blockType}
                        </p>
                        {block.reason ? <p className="mt-2 text-sm text-gray-600">{block.reason}</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteBlockMutation.mutate(block.id)}
                        className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                    No hay bloqueos programados para esta cancha.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(item => (
            <div key={item} className="card h-64 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : courts?.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courts.map((court: any) => {
            const memberPrice = court.pricing?.find((item: any) => item.userType === 'MEMBER')?.price;
            const casualPrice = court.pricing?.find((item: any) => item.userType === 'CASUAL')?.price;

            return (
              <div key={court.id} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                {court.photoUrl ? (
                  <img src={court.photoUrl} alt={court.name} className="h-44 w-full object-cover" />
                ) : (
                  <div className="flex h-44 items-center justify-center bg-gray-100">
                    <MapPin className="h-10 w-10 text-gray-300" />
                  </div>
                )}

                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{court.name}</h3>
                      <p className="mt-1 text-sm text-gray-500">{SURFACES[court.surfaceType] ?? court.surfaceType}</p>
                    </div>
                    <span className={court.active ? 'badge-green' : 'badge-gray'}>
                      {court.active ? 'Disponible' : 'No disponible'}
                    </span>
                  </div>

                  {court.description ? (
                    <p className="min-h-10 text-sm leading-6 text-gray-600">{court.description}</p>
                  ) : (
                    <p className="min-h-10 text-sm leading-6 text-gray-400">Agrega una descripción para ayudar a elegir esta cancha.</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1">
                      <Sun className="h-3.5 w-3.5" />
                      {court.indoor ? 'Cubierta' : 'Exterior'}
                    </span>
                    {court.lighting ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1">
                        <Zap className="h-3.5 w-3.5" />
                        Iluminación
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {court.blocks?.length ? `${court.blocks.length} bloqueos` : 'Sin bloqueos'}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-gray-50 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Socio</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(memberPrice)}/hr</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-gray-500">Casual</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(casualPrice)}/hr</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(court)}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => openSchedule(court.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300"
                    >
                      <Clock3 className="h-3.5 w-3.5" />
                      Horarios
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate({ id: court.id, active: !court.active })}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {court.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <CourtPhotoUpload courtId={court.id} />
                    <button
                      type="button"
                      onClick={() => handleDelete(court.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <MapPin className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">No hay canchas registradas.</p>
          <button className="btn-primary mt-5" onClick={openCreate}>Agregar primera cancha</button>
        </div>
      )}
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
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
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
    <div className="mt-6 flex justify-end gap-2">
      <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
      <button className="btn-primary" onClick={onConfirm} disabled={disabled}>{confirmLabel}</button>
    </div>
  );
}
