'use client';

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings, Clock, Image, Upload, Trash2, X } from 'lucide-react';
import { useClubStore } from '@/stores/club.store';
import { useClub } from '@/hooks/use-club';
import api from '@/lib/api';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_MB = 5;

function ImageUploader({
  label,
  currentUrl,
  endpoint,
  onSuccess,
}: {
  label: string;
  currentUrl?: string | null;
  endpoint: string;
  onSuccess: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera los ${MAX_MB} MB permitidos.`);
      return;
    }

    setPreview(URL.createObjectURL(file));
    setUploading(true);

    const form = new FormData();
    form.append('file', file);

    try {
      await api.post(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`${label} actualizado`);
      onSuccess();
      setPreview(null);
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Error al subir imagen';
      setError(msg);
      toast.error(msg);
      setPreview(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const displayUrl = preview ?? currentUrl;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex items-center gap-4">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={label}
            className="w-20 h-20 object-cover rounded-xl border border-gray-200"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
            <Image className="w-6 h-6 text-gray-300" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Subiendo...' : 'Seleccionar imagen'}
          </button>
          <p className="text-xs text-gray-400">JPEG, PNG o WebP · máx {MAX_MB} MB</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFile} />
    </div>
  );
}

function GalleryManager({ clubId, photos, onSuccess }: { clubId: string; photos: any[]; onSuccess: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => api.delete(`/clubs/${clubId}/photos/${photoId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['club', clubId] }); toast.success('Foto eliminada'); },
    onError: () => toast.error('Error al eliminar foto'),
  });

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera los ${MAX_MB} MB permitidos.`);
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append('file', file);

    try {
      await api.post(`/clubs/${clubId}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Foto agregada');
      onSuccess();
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Error al subir foto';
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium text-gray-700">Galería de fotos</label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? 'Subiendo...' : 'Agregar foto'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {photos.length === 0 ? (
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-gray-300 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Image className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Haz clic para subir la primera foto</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo: any) => (
            <div key={photo.id} className="relative group">
              <img
                src={photo.photoUrl}
                alt={photo.caption ?? 'Club photo'}
                className="w-full h-24 object-cover rounded-xl border border-gray-200"
              />
              <button
                onClick={() => deleteMutation.mutate(photo.id)}
                disabled={deleteMutation.isPending}
                className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"
                title="Eliminar foto"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFile} />
    </div>
  );
}

export default function SettingsPage() {
  const selectedClub = useClubStore(s => s.selectedClub);
  const { data: club, isLoading } = useClub(selectedClub?.id);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'profile' | 'hours' | 'media'>('profile');

  const [profileForm, setProfileForm] = useState({
    description: '', address: '', city: '', region: '',
    phone: '', whatsapp: '', email: '', instagram: '',
    website: '', rules: '', cancellationPolicy: '', accentColor: '',
  });

  const [hours, setHours] = useState(
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i, openTime: '07:00', closeTime: '22:00', isClosed: false,
    })),
  );

  useEffect(() => {
    if (club?.profile) {
      setProfileForm({
        description: club.profile.description ?? '',
        address: club.profile.address ?? '',
        city: club.profile.city ?? '',
        region: club.profile.region ?? '',
        phone: club.profile.phone ?? '',
        whatsapp: club.profile.whatsapp ?? '',
        email: club.profile.email ?? '',
        instagram: club.profile.instagram ?? '',
        website: club.profile.website ?? '',
        rules: club.profile.rules ?? '',
        cancellationPolicy: club.profile.cancellationPolicy ?? '',
        accentColor: club.profile.accentColor ?? '',
      });
    }
    if (club?.openingHours?.length > 0) {
      const hoursMap = Object.fromEntries(club.openingHours.map((h: any) => [h.dayOfWeek, h]));
      setHours(Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i,
        openTime: hoursMap[i]?.openTime ?? '07:00',
        closeTime: hoursMap[i]?.closeTime ?? '22:00',
        isClosed: hoursMap[i]?.isClosed ?? false,
      })));
    }
  }, [club]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/clubs/${selectedClub?.id}/profile`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', selectedClub?.id] });
      toast.success('Perfil actualizado');
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'Error al actualizar perfil'),
  });

  const updateHoursMutation = useMutation({
    mutationFn: (data: any) => api.put(`/clubs/${selectedClub?.id}/opening-hours`, { hours: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', selectedClub?.id] });
      toast.success('Horarios actualizados');
    },
    onError: () => toast.error('Error al actualizar horarios'),
  });

  const refreshClub = () => queryClient.invalidateQueries({ queryKey: ['club', selectedClub?.id] });

  if (isLoading) return <div className="card animate-pulse h-64" />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuración del club</h1>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { key: 'profile', label: 'Perfil', icon: Settings },
          { key: 'hours', label: 'Horarios', icon: Clock },
          { key: 'media', label: 'Imágenes', icon: Image },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="card max-w-2xl">
          <h2 className="font-semibold text-gray-900 mb-4">Información del club</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea className="input-field" rows={3} value={profileForm.description}
                onChange={e => setProfileForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                <input className="input-field" value={profileForm.address}
                  onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                <input className="input-field" value={profileForm.city}
                  onChange={e => setProfileForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input className="input-field" value={profileForm.phone}
                  onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                <input className="input-field" value={profileForm.whatsapp}
                  onChange={e => setProfileForm(f => ({ ...f, whatsapp: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" className="input-field" value={profileForm.email}
                  onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
                <input className="input-field" value={profileForm.instagram}
                  onChange={e => setProfileForm(f => ({ ...f, instagram: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reglamento</label>
              <textarea className="input-field" rows={3} value={profileForm.rules}
                onChange={e => setProfileForm(f => ({ ...f, rules: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Política de cancelación</label>
              <textarea className="input-field" rows={2} value={profileForm.cancellationPolicy}
                onChange={e => setProfileForm(f => ({ ...f, cancellationPolicy: e.target.value }))} />
            </div>
          </div>
          <button
            className="btn-primary mt-6"
            onClick={() => updateProfileMutation.mutate({ ...profileForm, accentColor: profileForm.accentColor || null })}
            disabled={updateProfileMutation.isPending}
          >
            {updateProfileMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}

      {tab === 'hours' && (
        <div className="card max-w-2xl">
          <h2 className="font-semibold text-gray-900 mb-4">Horarios de apertura</h2>
          <div className="space-y-3">
            {hours.map((hour, i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b border-gray-50">
                <div className="w-24 text-sm font-medium text-gray-700">{DAYS[i]}</div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hour.isClosed}
                    onChange={e => setHours(h => h.map((d, j) => j === i ? { ...d, isClosed: e.target.checked } : d))}
                    className="rounded"
                  />
                  Cerrado
                </label>
                {!hour.isClosed && (
                  <div className="flex items-center gap-2 ml-2">
                    <input
                      type="time"
                      className="input-field py-1 w-28"
                      value={hour.openTime}
                      onChange={e => setHours(h => h.map((d, j) => j === i ? { ...d, openTime: e.target.value } : d))}
                    />
                    <span className="text-gray-400 text-sm">–</span>
                    <input
                      type="time"
                      className="input-field py-1 w-28"
                      value={hour.closeTime}
                      onChange={e => setHours(h => h.map((d, j) => j === i ? { ...d, closeTime: e.target.value } : d))}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            className="btn-primary mt-6"
            onClick={() => updateHoursMutation.mutate(hours)}
            disabled={updateHoursMutation.isPending}
          >
            {updateHoursMutation.isPending ? 'Guardando...' : 'Guardar horarios'}
          </button>
        </div>
      )}

      {tab === 'media' && selectedClub && (
        <div className="card max-w-2xl space-y-8">
          <div>
            <h2 className="font-semibold text-gray-900 mb-6">Imágenes del club</h2>
            <div className="space-y-6">
              <ImageUploader
                label="Logo del club"
                currentUrl={club?.profile?.logoUrl}
                endpoint={`/clubs/${selectedClub.id}/logo`}
                onSuccess={refreshClub}
              />
              <div className="border-t border-gray-100 pt-6">
                <ImageUploader
                  label="Banner / portada"
                  currentUrl={club?.profile?.bannerUrl}
                  endpoint={`/clubs/${selectedClub.id}/banner`}
                  onSuccess={refreshClub}
                />
              </div>
              <div className="border-t border-gray-100 pt-6">
                <GalleryManager
                  clubId={selectedClub.id}
                  photos={club?.photos ?? []}
                  onSuccess={refreshClub}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
